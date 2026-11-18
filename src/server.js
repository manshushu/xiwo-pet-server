const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const os = require('os');

const dataStore = require('./services/data-store');
const decayService = require('./services/decay');
const broadcaster = require('./ws/broadcaster');
const wsServerManager = require('./ws/ws-server');

const authRoutes = require('./routes/auth');
const teacherRoutes = require('./routes/teacher');
const studentRoutes = require('./routes/student');
const outfitsRoutes = require('./routes/outfits');
const internalRoutes = require('./routes/internal');

const app = express();
const server = http.createServer(app);

// 获取本地局域网所有 IPv4 地址
function getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
        for (const k2 of interfaces[k]) {
            if (k2.family === 'IPv4' && !k2.internal) {
                addresses.push(k2.address);
            }
        }
    }
    return addresses;
}

// 静态文件目录适配（开发环境与 pkg 打包兼容）
const getPublicDir = () => {
    return path.join(__dirname, 'public');
};

const PUBLIC_DIR = getPublicDir();

// 解析 JSON 与 URL 编码
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 会话管理（纯内存会话，轻量且适合机房离线环境）
const sessionMiddleware = session({
    secret: 'xiwo_pet_classroom_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 12 * 60 * 60 * 1000, // 12 小时有效
        httpOnly: true
    }
});
app.use(sessionMiddleware);

// 静态资源路由
app.use('/shared', express.static(path.join(PUBLIC_DIR, 'shared')));
app.use('/teacher', express.static(path.join(PUBLIC_DIR, 'teacher')));
app.use('/student', express.static(path.join(PUBLIC_DIR, 'student')));

// 根路由导航：默认重定向到学生端，本机可直接通过 /teacher 进入控制台
app.get('/', (req, res) => {
    res.redirect('/student/');
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/outfits', outfitsRoutes);
app.use('/api/internal', internalRoutes);

// 初始化 WebSocket 服务与饱腹度衰减服务
wsServerManager.init(server, broadcaster, sessionMiddleware);
decayService.setBroadcaster(broadcaster);
decayService.start();

const PORT = Number(process.env.PORT) || Number(dataStore.getConfig().port) || 3001;
server.listen(PORT, '0.0.0.0', () => {
    const ips = getLocalIpAddresses();
    console.log('====================================================');
    console.log('🐾 西沃智慧宠物 v2.1.0 · 班级双端交互系统已成功启动！');
    console.log(`💻 教师机管理控制台:  http://localhost:${PORT}/teacher`);
    console.log('----------------------------------------------------');
    console.log('📡 机房学生端访问地址（可写在黑板或投屏）:');
    if (ips.length > 0) {
        ips.forEach(ip => {
            console.log(`   👉 http://${ip}:${PORT}/student`);
        });
    } else {
        console.log(`   👉 http://127.0.0.1:${PORT}/student`);
    }
    console.log('====================================================');
});

// 优雅退出处理
process.on('SIGINT', () => {
    console.log('[Server] 正在保存数据并关闭服务...');
    decayService.stop();
    dataStore.saveStudents();
    dataStore.saveOutfits();
    process.exit(0);
});

process.on('SIGTERM', () => {
    decayService.stop();
    process.exit(0);
});
