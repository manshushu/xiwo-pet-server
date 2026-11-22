const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dataStore = require('../services/data-store');
const broadcaster = require('../ws/broadcaster');
const wsServer = require('../ws/ws-server');
const { applyStudentScoreChange } = require('../services/score-helper');
const { getCurrentPeriodKey, computeStudentMetrics, computeClassHonorBadges, buildLeaderboard } = require('../services/ranking-helper');
const { LEADERBOARD_TYPES } = require('../public/shared/js/skins-catalog');

function enrichStudentsWithHonors(safeStudents, cfg) {
    const periodKey = getCurrentPeriodKey(cfg);
    const badgeMap = computeClassHonorBadges(safeStudents, periodKey);
    return safeStudents.map(s => {
        const metrics = computeStudentMetrics(s, periodKey);
        return {
            ...s,
            rankInfo: metrics.rank,
            honorScore: metrics.honorScore,
            honorBadges: badgeMap.get(s.id) || []
        };
    });
}

// 教师鉴权中间件
function requireTeacher(req, res, next) {
    if (req.session && req.session.role === 'teacher') {
        return next();
    }
    // 本机 localhost 访问时提供便携通道
    const ip = req.ip || req.connection.remoteAddress;
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        req.session.role = 'teacher';
        req.session.displayName = '教师机控制台';
        return next();
    }
    return res.status(403).json({ success: false, message: '无权访问教师管控接口' });
}

router.use(requireTeacher);

// 获取所有学生全量数据（脱敏下发，杜绝泄露密码哈希）
router.get('/students', (req, res) => {
    const cfg = dataStore.getConfig();
    const students = enrichStudentsWithHonors(dataStore.getAllSafeStudents(), cfg);
    res.json({
        success: true,
        students,
        permissions: dataStore.getPermissions(),
        config: cfg
    });
});

// 获取可选班级列表（来自全校真实名单）
router.get('/classes', (req, res) => {
    res.json({
        success: true,
        currentClassName: dataStore.getConfig().className,
        classes: dataStore.getAvailableClasses()
    });
});

// 切换当前上课班级（自动加载或初始化该班真实学生名单）
router.post('/switch-class', (req, res) => {
    const { className } = req.body || {};
    if (!className || !String(className).trim()) {
        return res.status(400).json({ success: false, message: '请选择有效班级名称' });
    }
    const result = dataStore.switchClass(String(className).trim());
    if (!result) {
        return res.status(400).json({ success: false, message: '切换班级失败' });
    }
    broadcaster.broadcastClassState();
    const cfg = dataStore.getConfig();
    res.json({
        success: true,
        ...result,
        students: enrichStudentsWithHonors(dataStore.getAllSafeStudents(), cfg),
        config: cfg
    });
});

// 加分/扣分 (单人/多选/全班)
router.post('/score', (req, res) => {
    const { studentIds, coinsDelta = 0, fullnessDelta = 0, reason = '课堂表现优异' } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ success: false, message: '请选择至少一名学生' });
    }

    const cDelta = Number(coinsDelta) || 0;
    const fDelta = Number(fullnessDelta) || 0;
    let updatedCount = 0;

    studentIds.forEach(id => {
        const result = applyStudentScoreChange(id, {
            coinsDelta: cDelta,
            fullnessDelta: fDelta,
            reason,
            operator: '教师'
        });
        if (result) {
            updatedCount += 1;
        }
    });

    res.json({ success: true, count: updatedCount });
});

// 切换课堂模式
router.post('/mode', (req, res) => {
    const { mode, durationSeconds = 0 } = req.body;
    const validModes = ['class', 'break', 'interactive', 'outfit_create', 'dismissed'];
    if (!validModes.includes(mode)) {
        return res.status(400).json({ success: false, message: '无效的课堂模式' });
    }

    const updatedPermissions = dataStore.setMode(mode, durationSeconds);
    const modeNames = {
        'class': '上课专注模式（学生端锁定）',
        'break': '课间休息模式',
        'interactive': '自由互动模式（开放喂食与抚摸）',
        'outfit_create': '装扮创作时间（开放编辑器与投稿）',
        'dismissed': '下课归档模式'
    };

    dataStore.addLog('mode_change', `切换课堂模式为「${modeNames[mode]}」${durationSeconds > 0 ? `，限时${durationSeconds}秒` : ''}`, null, null, '教师');
    broadcaster.broadcastModeChange(mode, updatedPermissions.modeEndTime);

    res.json({ success: true, permissions: updatedPermissions });
});

// 随机提问抽选学生
router.post('/random-pick', (req, res) => {
    const activeStudents = dataStore.getAllStudents().filter(s => s.status === 'active');
    if (activeStudents.length === 0) {
        return res.status(400).json({ success: false, message: '暂无可用学生' });
    }
    const chosen = activeStudents[Math.floor(Math.random() * activeStudents.length)];
    dataStore.addLog('random_pick', `随机点名抽取了 ${chosen.displayName}`, chosen.id, chosen.displayName, '教师');

    broadcaster.broadcastAll('random_picked', {
        studentId: chosen.id,
        displayName: chosen.displayName
    });

    const cfg = dataStore.getConfig();
    const enrichedList = enrichStudentsWithHonors(dataStore.getAllSafeStudents(), cfg);
    const enrichedChosen = enrichedList.find(s => s.id === chosen.id) || dataStore.getSafeStudent(chosen);

    res.json({ success: true, student: enrichedChosen });
});

// 一键全班基础分（直接给全班未冻结学生发放固定课堂币与经验，无需先全选）
router.post('/class-bonus', (req, res) => {
    const coins = Math.max(1, Math.min(50, Number(req.body?.coins) || 10));
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : '全班守纪与专注基础奖励';

    const activeStudents = dataStore.getAllStudents().filter(s => s.status === 'active');
    let count = 0;
    activeStudents.forEach(st => {
        const r = applyStudentScoreChange(st.id, {
            rawCoinsDelta: coins,
            fullnessDelta: 2,
            reason,
            logType: 'class_bonus',
            operator: '教师'
        });
        if (r) count += 1;
    });

    broadcaster.broadcastClassState();
    res.json({ success: true, count, coins });
});

// 教师端查看多维荣耀排行榜（开放全部 5 大分榜，支持投屏结算）
router.get('/leaderboard', (req, res) => {
    const cfg = dataStore.getConfig();
    const validIds = LEADERBOARD_TYPES.map(b => b.id);
    const reqBoard = typeof req.query.board === 'string' ? req.query.board : 'honor';
    const activeBoard = validIds.includes(reqBoard) ? reqBoard : 'honor';
    const periodKey = getCurrentPeriodKey(cfg);
    const students = dataStore.getAllSafeStudents();
    const gradeData = activeBoard === 'grade' ? dataStore.getSameGradeClassStudents() : null;

    const result = buildLeaderboard({
        board: activeBoard,
        students,
        currentPeriodKey: periodKey,
        selfClassName: cfg.className,
        gradeData
    });

    res.json({
        success: true,
        visibleBoards: Array.isArray(cfg.visibleBoards) ? cfg.visibleBoards : ['honor', 'darkhorse', 'collection', 'popularity'],
        darkhorsePeriodKey: cfg.darkhorsePeriodKey || null,
        ...result
    });
});

// 教师控制学生端可见榜单范围
router.post('/leaderboard/settings', (req, res) => {
    const validIds = LEADERBOARD_TYPES.map(b => b.id);
    const incoming = Array.isArray(req.body?.visibleBoards) ? req.body.visibleBoards : [];
    const filtered = validIds.filter(id => incoming.includes(id));

    const updated = dataStore.updateConfig({ visibleBoards: filtered });
    dataStore.addLog('leaderboard_settings', `更新学生可见榜单配置：${filtered.length > 0 ? filtered.join(', ') : '全部隐藏'}`, null, null, '教师');
    broadcaster.broadcastAll('leaderboard_config_update', { visibleBoards: filtered });

    res.json({ success: true, visibleBoards: updated.visibleBoards });
});

// 教师手动重置黑马进步榜（开启新课堂或新周期冲刺）
router.post('/leaderboard/reset-darkhorse', (req, res) => {
    const newKey = `custom_${Date.now()}`;
    dataStore.updateConfig({ darkhorsePeriodKey: newKey });
    dataStore.addLog('darkhorse_reset', `教师开启了新一轮黑马进步榜冲刺 (${newKey})`, null, null, '教师');
    broadcaster.broadcastAll('leaderboard_config_update', { darkhorsePeriodKey: newKey });

    res.json({ success: true, darkhorsePeriodKey: newKey });
});

// 重置学生密码
router.post('/student/reset-pwd', (req, res) => {
    const { studentId, newPassword = '123' } = req.body;
    const ok = dataStore.resetStudentPassword(studentId, newPassword);
    if (ok) {
        const student = dataStore.getStudentById(studentId);
        dataStore.addLog('pwd_reset', `重置了 ${student.displayName} 的登录密码`, student.id, student.displayName, '教师');
        return res.json({ success: true, message: `密码已成功重置为 ${newPassword}` });
    }
    res.status(404).json({ success: false, message: '学生未找到' });
});

// 冻结/解冻学生
router.post('/student/toggle-freeze', (req, res) => {
    const { studentId } = req.body;
    let newStatus = 'active';
    const student = dataStore.updateStudent(studentId, s => {
        s.status = s.status === 'active' ? 'frozen' : 'active';
        newStatus = s.status;
    });

    if (student) {
        if (newStatus === 'frozen') {
            wsServer.forceLogoutStudent(student.id);
            broadcaster.sendToStudent(student.id, 'account_frozen', { reason: '今日账号已被教师暂停' });
        }
        dataStore.addLog('status_change', `${newStatus === 'frozen' ? '暂停冻结' : '恢复激活'}了 ${student.displayName} 的账号`, student.id, student.displayName, '教师');
        broadcaster.broadcastClassState();
        return res.json({ success: true, status: newStatus });
    }
    res.status(404).json({ success: false, message: '学生未找到' });
});

// 强制下线
router.post('/student/kick', (req, res) => {
    const { studentId } = req.body;
    wsServer.forceLogoutStudent(Number(studentId));
    res.json({ success: true });
});

// 修改学生姓名
router.post('/student/update-name', (req, res) => {
    const { studentId, displayName } = req.body;
    if (!displayName || !displayName.trim()) {
        return res.status(400).json({ success: false, message: '姓名不能为空' });
    }
    const student = dataStore.updateStudent(studentId, s => {
        s.displayName = displayName.trim();
    });
    if (student) {
        dataStore.addLog('name_change', `更新了学号 ${student.username} 的姓名为 ${student.displayName}`, student.id, student.displayName, '教师');
        broadcaster.broadcastClassState();
        return res.json({ success: true, student });
    }
    res.status(404).json({ success: false, message: '学生未找到' });
});

// 批量导入学生名单
router.post('/batch-create', (req, res) => {
    const { rosterText, resetAll = false } = req.body;
    if (!rosterText || !rosterText.trim()) {
        return res.status(400).json({ success: false, message: '请输入名单文本' });
    }

    const lines = rosterText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
        return res.status(400).json({ success: false, message: '未解析到有效姓名' });
    }

    const defaultHash = bcrypt.hashSync('123', 8);
    let students = dataStore.getAllStudents();

    if (resetAll) {
        students.length = 0;
        lines.forEach((name, idx) => {
            const no = idx + 1;
            const noStr = no < 10 ? `0${no}` : `${no}`;
            students.push({
                id: no,
                username: `s${noStr}`,
                displayName: `${noStr}号 ${name}`,
                passwordHash: defaultHash,
                role: 'student',
                status: 'active',
                pet: dataStore.createDefaultPet(),
                createdAt: new Date().toISOString()
            });
        });
    } else {
        // 追加模式
        let maxId = students.reduce((max, s) => Math.max(max, s.id), 0);
        lines.forEach(name => {
            maxId++;
            const noStr = maxId < 10 ? `0${maxId}` : `${maxId}`;
            students.push({
                id: maxId,
                username: `s${noStr}`,
                displayName: `${noStr}号 ${name}`,
                passwordHash: defaultHash,
                role: 'student',
                status: 'active',
                pet: dataStore.createDefaultPet(),
                createdAt: new Date().toISOString()
            });
        });
    }

    dataStore.saveStudents();
    dataStore.addLog('roster_import', `批量更新了学生名单，共 ${students.length} 名学生`, null, null, '教师');
    broadcaster.broadcastClassState();

    res.json({ success: true, total: students.length });
});

// 获取待审核装扮
router.get('/outfits/pending', (req, res) => {
    const pending = dataStore.getPendingOutfits();
    res.json({ success: true, outfits: pending });
});

// 审核装扮（批准或拒绝）
router.post('/outfits/review', (req, res) => {
    const { outfitId, action, reason = '' } = req.body;
    if (!outfitId || (action !== 'approve' && action !== 'reject')) {
        return res.status(400).json({ success: false, message: '参数有误' });
    }

    const outfit = dataStore.updateOutfit(outfitId, o => {
        o.status = action === 'approve' ? 'approved' : 'rejected';
        o.teacherNote = reason || (action === 'approve' ? '教师审核通过' : '装扮需进一步调整');
        o.reviewedAt = new Date().toISOString();
    });

    if (!outfit) {
        return res.status(404).json({ success: false, message: '未找到该装扮' });
    }

    dataStore.addLog(
        'outfit_review',
        `${action === 'approve' ? '批准' : '拒绝'}了 ${outfit.authorName} 的装扮「${outfit.name}」`,
        outfit.authorId,
        outfit.authorName,
        '教师'
    );

    // 通知作者
    broadcaster.sendToStudent(outfit.authorId, 'outfit_review_done', {
        outfitId: outfit.id,
        outfitName: outfit.name,
        status: outfit.status,
        reason: outfit.teacherNote
    });

    // 若通过，向全班广播新作品上架
    if (action === 'approve') {
        broadcaster.broadcastAll('outfit_approved', {
            outfitId: outfit.id,
            authorName: outfit.authorName,
            outfitName: outfit.name
        });
    }

    res.json({ success: true, outfit });
});

// 获取操作日志
router.get('/logs', (req, res) => {
    const limit = Number(req.query.limit) || 100;
    const studentId = req.query.studentId ? Number(req.query.studentId) : null;
    res.json({ success: true, logs: dataStore.getLogs(limit, studentId) });
});

// 导出系统数据快照
router.get('/export', (req, res) => {
    const payload = {
        exportTime: new Date().toISOString(),
        config: dataStore.getConfig(),
        permissions: dataStore.getPermissions(),
        students: dataStore.getAllStudents(),
        outfits: dataStore.getAllOutfits(),
        logs: dataStore.getLogs(500)
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=xiwo_pet_backup_${Date.now()}.json`);
    res.send(JSON.stringify(payload, null, 2));
});

// 更新系统设置
router.post('/settings', (req, res) => {
    const { className, newTeacherPassword, aiConfig, aiReview, adoptionMode } = req.body;
    if (className) {
        dataStore.updateConfig({ className });
    }
    if (adoptionMode === 'choose' || adoptionMode === 'draw') {
        dataStore.updateConfig({ adoptionMode });
    }
    if (newTeacherPassword && newTeacherPassword.length >= 4) {
        dataStore.setTeacherPassword(newTeacherPassword);
    }
    const finalAi = aiConfig || aiReview;
    if (finalAi) {
        dataStore.updateConfig({ aiConfig: finalAi, aiReview: finalAi });
    }
    dataStore.addLog('settings_update', '更新了系统设置参数', null, null, '教师');
    res.json({ success: true, config: dataStore.getConfig() });
});

// 教师为学生更换宠物（保留当前等级与经验）
router.post('/student/switch-pet', (req, res) => {
    const { studentId, skinId } = req.body;
    if (!studentId || !skinId || typeof skinId !== 'string') {
        return res.status(400).json({ success: false, message: '缺少学生ID或目标宠物ID' });
    }
    const updated = dataStore.updateStudent(studentId, s => {
        if (!Array.isArray(s.pet.unlockedSkins)) s.pet.unlockedSkins = ['default_cat'];
        if (!s.pet.unlockedSkins.includes(skinId)) {
            s.pet.unlockedSkins.push(skinId);
        }
        s.pet.currentSkin = skinId;
        s.pet.hasChosenStarter = true;
    });
    if (!updated) {
        return res.status(404).json({ success: false, message: '学生未找到' });
    }
    dataStore.addLog('teacher_switch_pet', `教师为其更换宠物为「${skinId}」（保留 Lv.${updated.pet.level}）`, updated.id, updated.displayName, '教师');
    broadcaster.broadcastClassState();
    res.json({ success: true, student: dataStore.getSafeStudentById(updated.id) });
});

module.exports = router;
