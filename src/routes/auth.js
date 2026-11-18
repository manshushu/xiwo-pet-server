const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dataStore = require('../services/data-store');

// 教师登录
router.post('/teacher/login', (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ success: false, message: '请输入教师管理密码' });
    }

    if (dataStore.verifyTeacherPassword(password)) {
        req.session.role = 'teacher';
        req.session.displayName = '教师机控制台';
        dataStore.addLog('login', '教师端登录成功', null, null, '教师');
        return res.json({
            success: true,
            role: 'teacher',
            displayName: '教师机控制台'
        });
    } else {
        return res.status(401).json({ success: false, message: '管理密码错误，默认密码为 teacher123' });
    }
});

// 学生登录
router.post('/student/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: '请输入账号和密码' });
    }

    const student = dataStore.getStudentByUsername(username);
    if (!student) {
        return res.status(404).json({ success: false, message: '未找到该账号，请确认学号格式（如 s01）' });
    }

    if (student.status === 'frozen') {
        return res.status(403).json({ success: false, message: '该账号今日已被暂停使用，请联系任课教师' });
    }

    const valid = bcrypt.compareSync(password, student.passwordHash);
    if (!valid) {
        return res.status(401).json({ success: false, message: '密码错误，初始密码为 123' });
    }

    req.session.role = 'student';
    req.session.studentId = student.id;
    req.session.username = student.username;
    req.session.displayName = student.displayName;

    dataStore.addLog('login', '学生端登录成功', student.id, student.displayName, student.displayName);

    return res.json({
        success: true,
        role: 'student',
        student: {
            id: student.id,
            username: student.username,
            displayName: student.displayName,
            pet: student.pet
        }
    });
});

// 获取当前登录会话
router.get('/current', (req, res) => {
    if (!req.session || !req.session.role) {
        return res.json({ loggedIn: false });
    }

    if (req.session.role === 'teacher') {
        return res.json({
            loggedIn: true,
            role: 'teacher',
            displayName: req.session.displayName
        });
    }

    if (req.session.role === 'student') {
        const student = dataStore.getStudentById(req.session.studentId);
        if (!student) {
            req.session.destroy();
            return res.json({ loggedIn: false });
        }
        return res.json({
            loggedIn: true,
            role: 'student',
            student: {
                id: student.id,
                username: student.username,
                displayName: student.displayName,
                status: student.status,
                pet: student.pet
            }
        });
    }

    return res.json({ loggedIn: false });
});

// 修改学生自身密码
router.post('/student/change-password', (req, res) => {
    if (!req.session || req.session.role !== 'student') {
        return res.status(401).json({ success: false, message: '未登录' });
    }

    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 3) {
        return res.status(400).json({ success: false, message: '新密码至少3位字符' });
    }

    const student = dataStore.getStudentById(req.session.studentId);
    if (!student) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const valid = bcrypt.compareSync(oldPassword, student.passwordHash);
    if (!valid) {
        return res.status(400).json({ success: false, message: '原密码不正确' });
    }

    student.passwordHash = bcrypt.hashSync(newPassword, 8);
    dataStore.saveStudents();
    dataStore.addLog('pwd_change', '学生自行修改了登录密码', student.id, student.displayName, student.displayName);

    return res.json({ success: true, message: '密码修改成功' });
});

// 退出登录
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// 获取当前上课班级与脱敏学生选择列表（方便学生点选姓名登录）
router.get('/class-roster', (req, res) => {
    const config = dataStore.getConfig();
    const students = dataStore.getAllSafeStudents().map(s => ({
        id: s.id,
        username: s.username,
        displayName: s.displayName
    }));
    res.json({
        success: true,
        className: config.className,
        students
    });
});

module.exports = router;
