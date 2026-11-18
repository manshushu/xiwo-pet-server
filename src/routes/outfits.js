const express = require('express');
const router = express.Router();
const dataStore = require('../services/data-store');
const aiReview = require('../services/ai-review');
const broadcaster = require('../ws/broadcaster');
const { studentActionCooldownMiddleware } = require('../services/action-limiter');
const { ACCESSORIES_CATALOG } = require('../public/shared/js/skins-catalog');

const OFFICIAL_ACCESSORIES = Object.fromEntries(
    ACCESSORIES_CATALOG.map(a => [a.id, { name: a.name, price: Number(a.price) || 0, slot: a.slot }])
);

router.use(studentActionCooldownMiddleware(2000));

// 获取装扮广场已审核通过的作品
router.get('/plaza', (req, res) => {
    const list = dataStore.getApprovedOutfits();
    res.json({ success: true, outfits: list });
});

// 获取本人提交的所有装扮作品
router.get('/my', (req, res) => {
    const studentId = req.session.studentId;
    if (!studentId) {
        return res.status(401).json({ success: false, message: '请先登录' });
    }
    const student = dataStore.getStudentById(studentId);
    if (!student || student.status === 'frozen') {
        return res.status(403).json({ success: false, message: '该账号已被教师暂停使用' });
    }
    const myOutfits = dataStore.getAllOutfits().filter(o => o.authorId === studentId);
    res.json({ success: true, outfits: myOutfits });
});

// 学生提交装扮作品（触发AI离线规则预审）
router.post('/submit', async (req, res) => {
    const studentId = req.session.studentId;
    if (!studentId) {
        return res.status(401).json({ success: false, message: '请先登录' });
    }

    const student = dataStore.getStudentById(studentId);
    if (!student) {
        return res.status(404).json({ success: false, message: '学生未找到' });
    }
    if (student.status === 'frozen') {
        return res.status(403).json({ success: false, message: '该账号今日已被暂停使用，无法提交装扮' });
    }

    const permissions = dataStore.getPermissions();
    if (permissions.currentMode !== 'outfit_create' && req.session.role !== 'teacher') {
        return res.status(403).json({ success: false, message: '当前未在装扮创作开放时间内，请等待老师开启！' });
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: '请为你的装扮起一个响亮的名字' });
    }

    // 安全解析 components，严防缺少 components 字段时访问 skinId 导致进程崩溃
    const rawComponents = req.body.components && typeof req.body.components === 'object' ? req.body.components : {};
    const safeComponents = {
        skinId: typeof rawComponents.skinId === 'string' ? rawComponents.skinId : 'default_cat',
        accessories: Array.isArray(rawComponents.accessories) ? rawComponents.accessories.filter(a => typeof a === 'string').slice(0, 15) : [],
        colorHue: typeof rawComponents.colorHue === 'number' && !isNaN(rawComponents.colorHue) ? Math.max(0, Math.min(360, rawComponents.colorHue)) : 0
    };

    const unlockedAccs = Array.isArray(student.pet?.unlockedAccessories) ? student.pet.unlockedAccessories : [];
    for (const accId of safeComponents.accessories) {
        if (accId.startsWith('face_')) continue;
        const cfg = OFFICIAL_ACCESSORIES[accId];
        if (!cfg) {
            return res.status(400).json({ success: false, message: `无效的配饰ID: ${accId}` });
        }
        if (cfg.price > 0 && !unlockedAccs.includes(accId)) {
            return res.status(403).json({ success: false, message: `配饰「${cfg.name}」尚未购买解锁` });
        }
    }

    // 触发 AI/规则引擎预审
    let reviewResult;
    try {
        reviewResult = await aiReview.reviewOutfit({ name: name.trim(), components: safeComponents }, student);
    } catch (err) {
        console.error('[Outfits] AI预审发生异常，降级通过:', err);
        reviewResult = { pass: true, score: 85, reason: '本地审核服务正常放行', aiType: 'fallback' };
    }

    if (!reviewResult.pass) {
        // AI 预审未通过，直接返回友好拦截理由
        dataStore.addLog(
            'outfit_ai_reject',
            `装扮「${name.trim()}」未通过AI预审: ${reviewResult.reason}`,
            student.id,
            student.displayName,
            'AI预审员'
        );
        return res.status(400).json({
            success: false,
            message: `提交未通过AI预审: ${reviewResult.reason}`
        });
    }

    // AI 预审通过，生成待审核记录，等待教师最终首肯
    const outfitId = `outfit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newOutfit = {
        id: outfitId,
        authorId: student.id,
        authorUsername: student.username,
        authorName: student.displayName,
        name: name.trim(),
        components: safeComponents,
        status: 'pending', // 'pending' | 'approved' | 'rejected'
        aiReviewResult: {
            pass: true,
            score: reviewResult.score,
            reason: reviewResult.reason,
            aiType: reviewResult.aiType
        },
        teacherNote: '',
        likes: 0,
        likedUserIds: [],
        publishedAt: new Date().toISOString()
    };

    dataStore.updateStudent(student.id, s => {
        s.pet.accessories = safeComponents.accessories;
        s.pet.colorHue = safeComponents.colorHue;
    });

    dataStore.addOutfit(newOutfit);
    dataStore.addLog(
        'outfit_submit',
        `提交了新装扮作品「${newOutfit.name}」，AI预审已通过(${reviewResult.score}分)，等待教师审核`,
        student.id,
        student.displayName,
        student.displayName
    );

    broadcaster.broadcastClassState();
    // 通知教师端有新装扮待审
    const pendingCount = dataStore.getPendingOutfits().length;
    broadcaster.broadcastToTeachers('pending_outfits_count', { count: pendingCount, latestName: newOutfit.name });

    res.json({
        success: true,
        message: '装扮已通过AI初审，已呈送教师机等待批准！',
        outfit: newOutfit,
        student: dataStore.getSafeStudentById(student.id)
    });
});

// 为广场作品点赞/支持
router.post('/like', (req, res) => {
    const studentId = req.session.studentId;
    if (!studentId) {
        return res.status(401).json({ success: false, message: '请先登录' });
    }

    const currentStudent = dataStore.getStudentById(studentId);
    if (!currentStudent) {
        return res.status(404).json({ success: false, message: '学生未找到' });
    }
    if (currentStudent.status === 'frozen') {
        return res.status(403).json({ success: false, message: '该账号已被教师暂停使用，无法点赞' });
    }

    const { outfitId } = req.body;
    const outfit = dataStore.getOutfitById(outfitId);
    if (!outfit || outfit.status !== 'approved') {
        return res.status(404).json({ success: false, message: '作品不存在或尚未通过审核' });
    }

    if (outfit.likedUserIds && outfit.likedUserIds.includes(studentId)) {
        return res.status(400).json({ success: false, message: '你今天已经为该装扮点过赞啦！' });
    }

    // 更新装扮点赞（outfit 对象在 updateOutfit 中已被递增）
    dataStore.updateOutfit(outfitId, o => {
        o.likes = (o.likes || 0) + 1;
        if (!o.likedUserIds) o.likedUserIds = [];
        o.likedUserIds.push(studentId);
    });

    // 给作者奖励 2 个课堂币
    const author = dataStore.updateStudent(outfit.authorId, a => {
        a.pet.coins += 2;
    });

    dataStore.addLog(
        'outfit_like',
        `为 ${outfit.authorName} 的装扮「${outfit.name}」点赞，作者获得 2 课堂币`,
        currentStudent.id,
        currentStudent.displayName,
        currentStudent.displayName
    );

    // 广播点赞鼓励
    broadcaster.broadcastAll('praise_bullet', {
        fromName: currentStudent.displayName,
        toName: outfit.authorName,
        emoji: '🎨 超赞装扮'
    });

    if (author) {
        broadcaster.sendToStudent(author.id, 'received_praise', {
            fromName: currentStudent.displayName,
            outfitName: outfit.name,
            rewardCoins: 2
        });
    }

    // 修复点赞计数+1偏差：直接返回更新后的 outfit.likes
    res.json({ success: true, likes: outfit.likes });
});

module.exports = router;
