const WebSocket = require('ws');
const dataStore = require('../services/data-store');
const { checkStudentCooldown } = require('../services/action-limiter');
const { addPetExpWithEvolution, broadcastPetLevelUpIfNeeded } = require('../services/score-helper');

class WsServerManager {
    constructor() {
        this.wss = null;
        this.clients = new Set(); // 活跃客户端集合
    }

    init(httpServer, broadcaster, sessionMiddleware = null) {
        this.wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
        broadcaster.setWsServer(this);

        this.wss.on('connection', (ws, req) => {
            const setupClient = () => {
                const parsedUrl = new URL(req.url, 'http://localhost');
                const ip = (req.socket && req.socket.remoteAddress) || '';
                const isLocalhost = (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1');

                let role = 'guest';
                let studentId = null;

                // 优先根据经过服务端认证的会话确定身份
                if (req.session && req.session.role === 'teacher') {
                    role = 'teacher';
                } else if (isLocalhost && parsedUrl.searchParams.get('role') === 'teacher') {
                    role = 'teacher';
                } else if (req.session && req.session.role === 'student' && req.session.studentId) {
                    const student = dataStore.getStudentById(req.session.studentId);
                    if (student && student.status === 'active') {
                        role = 'student';
                        studentId = student.id;
                    }
                }

                ws.role = role;
                ws.studentId = studentId;
                ws.isAlive = true;

                this.clients.add(ws);

                // 连接建立时发送初始全量状态与权限
                const permissions = dataStore.getPermissions();
                const remaining = permissions.modeEndTime ? Math.max(0, Math.floor((permissions.modeEndTime - Date.now()) / 1000)) : null;

                // 仅对已通过会话鉴权的学生下发脱敏后的数据对象，绝不携带 passwordHash
                const safeStudent = ws.studentId ? dataStore.getSafeStudentById(ws.studentId) : null;

                ws.send(JSON.stringify({
                    type: 'init_state',
                    data: {
                        permissions,
                        remainingSeconds: remaining,
                        student: safeStudent
                    },
                    timestamp: Date.now()
                }));

                // 教师端连接时推送待审核装扮数量
                if (ws.role === 'teacher') {
                    const pendingOutfits = dataStore.getPendingOutfits();
                    ws.send(JSON.stringify({
                        type: 'pending_outfits_count',
                        data: { count: pendingOutfits.length },
                        timestamp: Date.now()
                    }));
                }

                ws.on('pong', () => {
                    ws.isAlive = true;
                });

                ws.on('message', (messageRaw) => {
                    try {
                        const message = JSON.parse(messageRaw);
                        this.handleClientMessage(ws, message, broadcaster);
                    } catch (err) {
                        console.error('[WebSocket] 解析消息异常:', err);
                    }
                });

                ws.on('close', () => {
                    this.clients.delete(ws);
                });

                ws.on('error', (err) => {
                    console.error('[WebSocket] 连接错误:', err);
                    this.clients.delete(ws);
                });
            };

            // 如果挂载了 sessionMiddleware，解析 Cookie 获取真实会话
            if (sessionMiddleware) {
                sessionMiddleware(req, {}, () => setupClient());
            } else {
                setupClient();
            }
        });

        // 心跳保活检测
        const heartbeatInterval = setInterval(() => {
            this.clients.forEach(ws => {
                if (ws.isAlive === false) {
                    this.clients.delete(ws);
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);

        this.wss.on('close', () => {
            clearInterval(heartbeatInterval);
        });

        console.log('[WebSocket] 服务就绪，监听路径 /ws (已集成会话鉴权与数据脱敏)');
    }

    handleClientMessage(ws, msg, broadcaster) {
        const { type, data = {} } = msg;

        // 仅允许已鉴权学生或教师发起状态变更指令
        if (ws.role !== 'student' && ws.role !== 'teacher') {
            return ws.send(JSON.stringify({
                type: 'action_rejected',
                data: { reason: '请先登录学生账号后再进行互动' }
            }));
        }

        if (ws.role === 'student' && ws.studentId && ['pet_touch', 'feed', 'praise'].includes(type)) {
            const cooldown = checkStudentCooldown(ws.studentId, 2000);
            if (!cooldown.allowed) {
                const waitSec = Math.max(1, Math.ceil(cooldown.retryAfterMs / 1000));
                return ws.send(JSON.stringify({
                    type: 'action_rejected',
                    data: { reason: `操作太快啦，请 ${waitSec} 秒后再试！` }
                }));
            }
        }

        // 抚摸互动
        if (type === 'pet_touch') {
            const studentId = ws.studentId;
            if (!studentId) return;

            const permissions = dataStore.getPermissions();

            // 上课专注模式与下课归档模式下均不允许互动
            if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
                return ws.send(JSON.stringify({
                    type: 'action_rejected',
                    data: { reason: '当前模式中暂停抚摸互动，请专心听讲！' }
                }));
            }

            const student = dataStore.getStudentById(studentId);
            if (student && student.status === 'active') {
                student.pet.lastTouchTime = Date.now();
                dataStore.saveStudents();

                broadcaster.broadcastAll('pet_animation', {
                    studentId: student.id,
                    animation: 'purr',
                    message: '呼噜呼噜~ 好开心！'
                });
            }
        }

        // 快捷喂食（严格由服务端固定计费与饱腹度增量，忽略前端上报数值）
        if (type === 'feed') {
            const studentId = ws.studentId;
            if (!studentId) return;

            const permissions = dataStore.getPermissions();

            if (permissions.currentMode !== 'interactive' && permissions.currentMode !== 'break') {
                return ws.send(JSON.stringify({
                    type: 'action_rejected',
                    data: { reason: '当前模式未开放喂食功能' }
                }));
            }

            const student = dataStore.getStudentById(studentId);
            if (!student || student.status !== 'active') return;

            // 服务端固定扣费与增加数值，防篡改
            const cost = 5;
            const fullnessBoost = 15;

            if (student.pet.coins < cost) {
                return ws.send(JSON.stringify({
                    type: 'action_rejected',
                    data: { reason: '课堂币不足，多积极发言赚取课堂币吧！' }
                }));
            }

            if (student.pet.fullness >= 100) {
                return ws.send(JSON.stringify({
                    type: 'action_rejected',
                    data: { reason: '宠物已经吃饱啦，肚子圆滚滚的！' }
                }));
            }

            student.pet.coins -= cost;
            student.pet.fullness = Math.min(100, student.pet.fullness + fullnessBoost);
            const evoResult = addPetExpWithEvolution(student.pet, 5);

            dataStore.saveStudents();
            broadcastPetLevelUpIfNeeded(student, evoResult);
            dataStore.addLog('feed', `喂食消耗 ${cost} 课堂币，增加饱腹度`, student.id, student.displayName, student.displayName);

            broadcaster.broadcastScoreUpdate(student, '喂食', -cost, fullnessBoost);
            broadcaster.broadcastAll('pet_animation', {
                studentId: student.id,
                animation: 'eat',
                message: '吃得饱饱的！'
            });
        }

        // 同学点赞/鼓励弹幕
        if (type === 'praise') {
            const fromStudent = ws.studentId ? dataStore.getStudentById(ws.studentId) : null;
            if (!fromStudent || fromStudent.status !== 'active') return;

            const toStudent = dataStore.getStudentById(data.toId);
            if (fromStudent && toStudent) {
                const emoji = data.emoji || '👍';
                broadcaster.broadcastAll('praise_bullet', {
                    fromName: fromStudent.displayName,
                    toName: toStudent.displayName,
                    emoji
                });
                dataStore.addLog('praise', `向 ${toStudent.displayName} 发送了鼓励 ${emoji}`, fromStudent.id, fromStudent.displayName, fromStudent.displayName);
            }
        }
    }

    broadcastToAll(payload) {
        const raw = JSON.stringify(payload);
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(raw);
            }
        });
    }

    broadcastToRole(role, payload) {
        const raw = JSON.stringify(payload);
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.role === role) {
                client.send(raw);
            }
        });
    }

    sendToStudent(studentId, payload) {
        const raw = JSON.stringify(payload);
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.studentId === studentId) {
                client.send(raw);
            }
        });
    }

    forceLogoutStudent(studentId) {
        this.clients.forEach(client => {
            if (client.studentId === studentId) {
                client.send(JSON.stringify({ type: 'force_logout', data: { reason: '已被教师下线' } }));
                client.close();
            }
        });
    }
}

module.exports = new WsServerManager();
