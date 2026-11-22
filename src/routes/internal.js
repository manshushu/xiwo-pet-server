const express = require('express');
const router = express.Router();
const dataStore = require('../services/data-store');
const { applyStudentScoreChange } = require('../services/score-helper');

// 仅允许本机回环地址调用内部联动接口，防止局域网学生机伪造发奖
function requireLocalhost(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return next();
    }
    return res.status(403).json({ success: false, message: '内部接口仅允许本机调用' });
}

function normalizeClassName(name) {
    return String(name || '')
        .replace(/[\s()（）【】[\]]+/g, '')
        .trim();
}

function getLocalDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function hasHomeworkRewardToday(studentId) {
    const todayKey = getLocalDateKey();
    const logs = dataStore.getLogs(500, studentId);
    return logs.some(entry => {
        if (entry.type !== 'homework_reward' || !entry.fullTime) return false;
        return getLocalDateKey(new Date(entry.fullTime)) === todayKey;
    });
}

router.use(requireLocalhost);

// 作业收发平台提交成功后的自动发奖接口
router.post('/homework-reward', (req, res) => {
    const { className, studentNo, isUpdate = false } = req.body || {};
    const numNo = parseInt(studentNo, 10);
    if (!className || !numNo || Number.isNaN(numNo) || numNo <= 0) {
        return res.status(400).json({ success: false, message: '缺少有效的 className 或 studentNo' });
    }

    const currentClassName = dataStore.getConfig().className;
    if (normalizeClassName(className) !== normalizeClassName(currentClassName)) {
        return res.json({
            success: true,
            rewarded: false,
            reason: 'class_mismatch',
            currentClassName
        });
    }

    if (Boolean(isUpdate)) {
        return res.json({
            success: true,
            rewarded: false,
            reason: 'duplicate_update'
        });
    }

    const username = `s${String(numNo).padStart(2, '0')}`;
    const student = dataStore.getStudentByUsername(username);
    if (!student) {
        return res.json({
            success: true,
            rewarded: false,
            reason: 'student_not_found',
            username
        });
    }

    if (student.status === 'frozen') {
        return res.json({
            success: true,
            rewarded: false,
            reason: 'student_frozen',
            username
        });
    }

    if (hasHomeworkRewardToday(student.id)) {
        return res.json({
            success: true,
            rewarded: false,
            reason: 'already_rewarded_today',
            username
        });
    }

    const coinsReward = 2;
    const result = applyStudentScoreChange(student.id, {
        coinsDelta: coinsReward,
        fullnessDelta: 0,
        reason: '课堂作业提交奖励',
        logType: 'homework_reward',
        operator: '作业平台'
    });

    return res.json({
        success: true,
        rewarded: true,
        username,
        displayName: student.displayName,
        coinsDelta: result?.coinsDelta ?? coinsReward,
        leveledUp: Boolean(result?.leveledUp),
        pet: result?.student?.pet || null
    });
});

module.exports = router;
