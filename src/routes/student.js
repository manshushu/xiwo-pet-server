const express = require('express');
const router = express.Router();
const dataStore = require('../services/data-store');
const broadcaster = require('../ws/broadcaster');
const { studentActionCooldownMiddleware } = require('../services/action-limiter');
const { recordPeriodGrowth, addPetExpWithEvolution, broadcastPetLevelUpIfNeeded } = require('../services/score-helper');
const { getCurrentPeriodKey, computeStudentMetrics, computeClassHonorBadges, buildLeaderboard } = require('../services/ranking-helper');
const { SKINS_CATALOG, ACCESSORIES_CATALOG, FOODS_CATALOG, BACKGROUNDS_CATALOG, FRAMES_CATALOG, TITLES_CATALOG } = require('../public/shared/js/skins-catalog');

const DAILY_HIGHFIVE_EXP_LIMIT = 5;

function getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// 从全局共享目录自动构建服务端官方查表（前后端单一数据源，防篡改）
const OFFICIAL_SKINS = Object.fromEntries(
    SKINS_CATALOG.map(s => [s.id, { name: s.name, price: s.price, reqLevel: s.reqLevel || 1, isStarter: Boolean(s.isStarter) }])
);

const OFFICIAL_ACCESSORIES = Object.fromEntries(
    ACCESSORIES_CATALOG.map(a => [a.id, { name: a.name, price: Number(a.price) || 0, slot: a.slot, isPremium: Boolean(a.isPremium) }])
);

const OFFICIAL_FOODS = Object.fromEntries(
    FOODS_CATALOG.map(f => [f.id, { name: f.name, cost: f.cost, fullnessBoost: f.fullnessBoost, expBoost: f.expBoost }])
);

const OFFICIAL_BACKGROUNDS = Object.fromEntries(
    BACKGROUNDS_CATALOG.map(b => [b.id, { name: b.name, price: Number(b.price) || 0, reqLevel: b.reqLevel || 1 }])
);

const OFFICIAL_FRAMES = Object.fromEntries(
    FRAMES_CATALOG.map(f => [f.id, { name: f.name, price: Number(f.price) || 0, reqLevel: f.reqLevel || 1 }])
);

const OFFICIAL_TITLES = Object.fromEntries(
    TITLES_CATALOG.map(t => [t.id, { name: t.name, price: Number(t.price) || 0, reqLevel: t.reqLevel || 1 }])
);

// 学生鉴权中间件（增加账号冻结即时拦截与安全注入）
function requireStudent(req, res, next) {
    if (!req.session || (!req.session.role)) {
        return res.status(401).json({ success: false, message: '请先登录学生账号' });
    }

    if (req.session.role === 'teacher') {
        return next();
    }

    if (req.session.role === 'student') {
        const studentId = req.session.studentId;
        const student = dataStore.getStudentById(studentId);
        if (!student) {
            req.session.destroy();
            return res.status(401).json({ success: false, message: '学生档案不存在或已被注销' });
        }
        if (student.status === 'frozen') {
            return res.status(403).json({ success: false, message: '该账号今日已被任课教师暂停使用' });
        }
        req.student = student;
        return next();
    }

    return res.status(401).json({ success: false, message: '请先登录学生账号' });
}

router.use(requireStudent);
router.use(studentActionCooldownMiddleware(2000));

function attachStudentHonors(safeStudent, badgeMap, periodKey) {
    if (!safeStudent) return safeStudent;
    const metrics = computeStudentMetrics(safeStudent, periodKey);
    return {
        ...safeStudent,
        rankInfo: metrics.rank,
        nextRankInfo: metrics.nextRank,
        honorScore: metrics.honorScore,
        honorBadges: badgeMap ? (badgeMap.get(safeStudent.id) || []) : []
    };
}

// 获取本人数据（脱敏下发，杜绝泄露密码哈希）
router.get('/me', (req, res) => {
    const studentId = req.session.studentId;
    if (!studentId) {
        return res.status(400).json({ success: false, message: '未关联学生ID' });
    }
    const safeStudent = dataStore.getSafeStudentById(studentId);
    if (!safeStudent) {
        return res.status(404).json({ success: false, message: '未找到学生档案' });
    }
    const permissions = dataStore.getPermissions();
    const cfg = dataStore.getConfig();
    const periodKey = getCurrentPeriodKey(cfg);
    const badgeMap = computeClassHonorBadges(dataStore.getAllSafeStudents(), periodKey);
    const enriched = attachStudentHonors(safeStudent, badgeMap, periodKey);
    enriched.checkedInToday = safeStudent.pet?.lastCheckinDate === getTodayKey();

    res.json({
        success: true,
        student: enriched,
        permissions,
        config: {
            className: cfg.className || '班级',
            adoptionMode: cfg.adoptionMode || 'choose',
            visibleBoards: Array.isArray(cfg.visibleBoards) ? cfg.visibleBoards : ['honor', 'darkhorse', 'collection', 'popularity']
        }
    });
});

// 获取全班同学宠物列表（供串门社交与邻里街展示，已脱敏）
router.get('/classmates', (req, res) => {
    const cfg = dataStore.getConfig();
    const periodKey = getCurrentPeriodKey(cfg);
    const allSafe = dataStore.getAllSafeStudents();
    const badgeMap = computeClassHonorBadges(allSafe, periodKey);
    const list = allSafe.map(s => {
        const enriched = attachStudentHonors(s, badgeMap, periodKey);
        return {
            id: enriched.id,
            username: enriched.username,
            displayName: enriched.displayName,
            status: enriched.status,
            rankInfo: enriched.rankInfo,
            honorBadges: enriched.honorBadges,
            pet: enriched.pet
        };
    });
    res.json({ success: true, classmates: list });
});

// 每日课堂签到（不受上课锁定限制，固定 +10 币、+10 经验、+10 成长分）
router.post('/checkin', (req, res) => {
    const studentId = req.session.studentId;
    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });

    const today = getTodayKey();
    if (student.pet?.lastCheckinDate === today) {
        return res.status(400).json({ success: false, message: '今天已经签过到啦，明天再来领奖励吧！' });
    }

    const cfg = dataStore.getConfig();
    const periodKey = getCurrentPeriodKey(cfg);
    let evoResult = null;

    const updated = dataStore.updateStudent(studentId, s => {
        s.pet.lastCheckinDate = today;
        s.pet.coins = (s.pet.coins || 0) + 10;
        s.pet.isCracked = false;
        recordPeriodGrowth(s.pet, 10, periodKey);
        if ((Number(s.pet.level) || 0) < 10) {
            evoResult = addPetExpWithEvolution(s.pet, 10);
        }
    });

    broadcastPetLevelUpIfNeeded(updated, evoResult);
    dataStore.addLog('daily_checkin', `每日课堂签到领取奖励 (+10币, +10经验)`, updated.id, updated.displayName, updated.displayName);
    broadcaster.broadcastScoreUpdate(updated, '每日签到', 10, 0);

    const badgeMap = computeClassHonorBadges(dataStore.getAllSafeStudents(), periodKey);
    const enriched = attachStudentHonors(dataStore.getSafeStudentById(studentId), badgeMap, periodKey);
    enriched.checkedInToday = true;

    res.json({
        success: true,
        message: '📅 签到成功！获得 +10 课堂币、+10 成长值！',
        leveledUp: Boolean(evoResult?.leveledUp),
        student: enriched
    });
});

// 学生端查看多维荣耀排行榜（仅显示教师开放的榜单与 Top 10 + 个人排名）
router.get('/leaderboard', (req, res) => {
    const studentId = req.session.studentId;
    const cfg = dataStore.getConfig();
    const visibleBoards = Array.isArray(cfg.visibleBoards) ? cfg.visibleBoards : ['honor', 'darkhorse', 'collection', 'popularity'];

    if (visibleBoards.length === 0) {
        return res.json({
            success: true,
            closed: true,
            visibleBoards: [],
            topList: [],
            myRank: null
        });
    }

    const reqBoard = typeof req.query.board === 'string' ? req.query.board : visibleBoards[0];
    const activeBoard = visibleBoards.includes(reqBoard) ? reqBoard : visibleBoards[0];
    const periodKey = getCurrentPeriodKey(cfg);
    const students = dataStore.getAllSafeStudents();
    const gradeData = activeBoard === 'grade' ? dataStore.getSameGradeClassStudents() : null;

    const result = buildLeaderboard({
        board: activeBoard,
        students,
        currentPeriodKey: periodKey,
        selfStudentId: studentId,
        selfClassName: cfg.className,
        gradeData
    });

    res.json({
        success: true,
        closed: false,
        visibleBoards,
        ...result
    });
});

// 抚摸互动（支持摸头/挠肚皮/拍拍等部位互动）
router.post('/touch', (req, res) => {
    const studentId = req.session.studentId;
    const permissions = dataStore.getPermissions();

    if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
        return res.status(403).json({ success: false, message: '当前模式下暂停抚摸互动' });
    }

    const part = typeof req.body?.part === 'string' ? req.body.part : 'head';
    const partMessages = {
        head: '摸摸小脑袋~ 呼噜呼噜好舒服！❤️',
        belly: '挠挠软肚皮~ 开心得打滚啦！✨',
        tail: '拍拍小尾巴~ 元气满满跳起来！🐾'
    };

    const student = dataStore.updateStudent(studentId, s => {
        s.pet.lastTouchTime = Date.now();
    });

    if (!student) {
        return res.status(404).json({ success: false, message: '学生未找到' });
    }

    broadcaster.broadcastAll('pet_animation', {
        studentId: student.id,
        animation: 'purr',
        message: partMessages[part] || partMessages.head
    });

    res.json({ success: true, student: dataStore.getSafeStudent(student) });
});

// 喂食（支持8款官方美食货架，服务端绝对控制消费金额、饱腹度与经验增量）
router.post('/feed', (req, res) => {
    const studentId = req.session.studentId;
    const permissions = dataStore.getPermissions();

    if (permissions.currentMode !== 'interactive' && permissions.currentMode !== 'break') {
        return res.status(403).json({ success: false, message: '当前课堂模式未开放喂食功能' });
    }

    const student = dataStore.getStudentById(studentId);
    if (!student) {
        return res.status(404).json({ success: false, message: '学生未找到' });
    }

    // 查表匹配美食配置，兼容旧版仅传 foodName 的请求
    const rawFoodId = typeof req.body?.foodId === 'string' ? req.body.foodId : 'dried_fish';
    const foodItem = OFFICIAL_FOODS[rawFoodId] || OFFICIAL_FOODS['dried_fish'];
    const cost = foodItem.cost;
    const fullnessBoost = foodItem.fullnessBoost;
    const expBoost = foodItem.expBoost;
    const foodName = foodItem.name;

    if (student.pet.coins < cost) {
        return res.status(400).json({ success: false, message: `课堂币不足（需 ${cost} 币），请在课堂上积极发言争取奖励！` });
    }

    if (student.pet.fullness >= 100) {
        return res.status(400).json({ success: false, message: '宠物肚子圆滚滚的，已经吃得很饱啦！' });
    }

    let evoResult = null;
    dataStore.updateStudent(studentId, s => {
        s.pet.coins -= cost;
        s.pet.fullness = Math.min(100, s.pet.fullness + fullnessBoost);
        s.pet.lastFeedTime = Date.now();
        evoResult = addPetExpWithEvolution(s.pet, expBoost);
    });
    const leveledUp = Boolean(evoResult?.leveledUp);
    broadcastPetLevelUpIfNeeded(student, evoResult);

    dataStore.addLog('feed', `品尝了「${foodName}」，消耗 ${cost} 课堂币，饱腹+${fullnessBoost}%`, student.id, student.displayName, student.displayName);
    broadcaster.broadcastScoreUpdate(student, `品尝${foodName}`, -cost, fullnessBoost);
    broadcaster.broadcastAll('pet_animation', {
        studentId: student.id,
        animation: 'eat',
        message: `大口享用 ${foodName}~ 饱腹+${fullnessBoost}%`
    });

    res.json({
        success: true,
        leveledUp,
        food: foodItem,
        student: dataStore.getSafeStudentById(studentId)
    });
});

// 串门社交互动（去同学家贴贴击掌 / 投喂爱心零食）
router.post('/visit-interact', (req, res) => {
    const studentId = req.session.studentId;
    const permissions = dataStore.getPermissions();

    if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
        return res.status(403).json({ success: false, message: '上课或归档期间暂停串门互动哦' });
    }

    const visitor = dataStore.getStudentById(studentId);
    const targetId = Number(req.body?.targetStudentId);
    const actionType = req.body?.actionType === 'treat' ? 'treat' : 'highfive';

    if (!visitor) return res.status(404).json({ success: false, message: '未找到本人信息' });
    if (!targetId || targetId === visitor.id) {
        return res.status(400).json({ success: false, message: '请选择一位同学的宠物小窝进行串门互动' });
    }

    const host = dataStore.getStudentById(targetId);
    if (!host) {
        return res.status(404).json({ success: false, message: '未找到目标同学的小窝' });
    }

    if (actionType === 'treat') {
        const giftCost = 3;
        if (visitor.pet.coins < giftCost) {
            return res.status(400).json({ success: false, message: `赠送爱心小零食需要 ${giftCost} 课堂币，当前余额不足` });
        }

        let visitorEvo = null;
        let hostEvo = null;
        const periodKey = getCurrentPeriodKey(dataStore.getConfig());
        dataStore.updateStudent(visitor.id, v => {
            v.pet.coins -= giftCost;
            recordPeriodGrowth(v.pet, 5, periodKey);
            visitorEvo = addPetExpWithEvolution(v.pet, 5);
        });

        dataStore.updateStudent(host.id, h => {
            h.pet.fullness = Math.min(100, (h.pet.fullness || 80) + 10);
            h.pet.popularity = (Number(h.pet.popularity) || 0) + 3;
            recordPeriodGrowth(h.pet, 5, periodKey);
            hostEvo = addPetExpWithEvolution(h.pet, 8);
        });

        broadcastPetLevelUpIfNeeded(visitor, visitorEvo);
        broadcastPetLevelUpIfNeeded(host, hostEvo);
        broadcaster.broadcastScoreUpdate(visitor, `串门投喂${host.displayName}`, -giftCost, 0);
        broadcaster.broadcastScoreUpdate(host, `${visitor.displayName}串门投喂`, 0, 10);

        dataStore.addLog('visit_treat', `到 ${host.displayName} 的小窝串门并投喂了爱心零食(-${giftCost}币)`, visitor.id, visitor.displayName, visitor.displayName);
        broadcaster.broadcastAll('praise_bullet', {
            fromName: visitor.displayName,
            toName: host.displayName,
            emoji: '🎁 串门投喂了爱心小零食'
        });
        broadcaster.sendToStudent(host.id, 'received_praise', {
            fromName: visitor.displayName,
            outfitName: '串门投喂零食',
            rewardCoins: 0,
            customText: `🎁 ${visitor.displayName} 来你家串门并喂了零食（饱腹+10%）！`
        });

        return res.json({
            success: true,
            expGained: true,
            leveledUp: Boolean(visitorEvo?.leveledUp),
            message: `已向 ${host.displayName} 的宠物投喂爱心零食！对方饱腹度+10%`,
            student: dataStore.getSafeStudentById(visitor.id),
            targetStudent: dataStore.getSafeStudentById(host.id)
        });
    } else {
        // 贴贴击掌：对同一位同学每天限 1 次获经验，每人每天总计限 5 次获经验；超限后仍可互动发弹幕但不加经验
        const today = getTodayKey();
        const prevDate = visitor.pet.dailyHighfiveDate;
        const currentTargets = prevDate === today && Array.isArray(visitor.pet.dailyHighfiveTargets)
            ? visitor.pet.dailyHighfiveTargets
            : [];
        const currentCount = prevDate === today ? (Number(visitor.pet.dailyHighfiveCount) || 0) : 0;

        const alreadyVisitedHostToday = currentTargets.includes(host.id);
        const reachedDailyCap = currentCount >= DAILY_HIGHFIVE_EXP_LIMIT;
        const canGainExp = !alreadyVisitedHostToday && !reachedDailyCap;

        let visitorEvo = null;
        let hostEvo = null;
        let nextCount = currentCount;
        let gotFirstCoinBonus = false;
        const periodKey = getCurrentPeriodKey(dataStore.getConfig());

        dataStore.updateStudent(visitor.id, v => {
            if (v.pet.dailyHighfiveDate !== today) {
                v.pet.dailyHighfiveDate = today;
                v.pet.dailyHighfiveTargets = [];
                v.pet.dailyHighfiveCount = 0;
            } else {
                if (!Array.isArray(v.pet.dailyHighfiveTargets)) v.pet.dailyHighfiveTargets = [];
                v.pet.dailyHighfiveCount = Number(v.pet.dailyHighfiveCount) || 0;
            }

            if (canGainExp) {
                v.pet.dailyHighfiveTargets.push(host.id);
                v.pet.dailyHighfiveCount += 1;
                nextCount = v.pet.dailyHighfiveCount;
                visitorEvo = addPetExpWithEvolution(v.pet, 3);
            }

            if (v.pet.lastHighfiveRewardDate !== today) {
                v.pet.lastHighfiveRewardDate = today;
                v.pet.coins = (v.pet.coins || 0) + 5;
                recordPeriodGrowth(v.pet, 5, periodKey);
                gotFirstCoinBonus = true;
            }
        });

        if (canGainExp) {
            dataStore.updateStudent(host.id, h => {
                h.pet.popularity = (Number(h.pet.popularity) || 0) + 1;
                hostEvo = addPetExpWithEvolution(h.pet, 3);
            });
            broadcastPetLevelUpIfNeeded(visitor, visitorEvo);
            broadcastPetLevelUpIfNeeded(host, hostEvo);
            broadcaster.broadcastScoreUpdate(visitor, `与${host.displayName}贴贴`, gotFirstCoinBonus ? 5 : 0, 0);
            broadcaster.broadcastScoreUpdate(host, `与${visitor.displayName}贴贴`, 0, 0);
        } else if (gotFirstCoinBonus) {
            broadcaster.broadcastScoreUpdate(visitor, `今日首次串门贴贴`, 5, 0);
        }

        const logDesc = canGainExp
            ? `带着宠物去 ${host.displayName} 的小窝贴贴击掌（双方经验+3${gotFirstCoinBonus ? '，每日首访+5币' : ''}）`
            : `带着宠物去 ${host.displayName} 的小窝贴贴击掌（今日经验已达上限，仅互动）`;
        dataStore.addLog('visit_highfive', logDesc, visitor.id, visitor.displayName, visitor.displayName);
        broadcaster.broadcastAll('praise_bullet', {
            fromName: visitor.displayName,
            toName: host.displayName,
            emoji: '🤝 两只宠物开心地贴贴击掌'
        });
        broadcaster.sendToStudent(host.id, 'received_praise', {
            fromName: visitor.displayName,
            outfitName: '串门贴贴',
            rewardCoins: 0,
            customText: `🐾 ${visitor.displayName} 带着宠物来你家小窝贴贴击掌啦！`
        });

        let msg = `🤝 贴贴击掌成功！双方经验+3${gotFirstCoinBonus ? '，每日首次串门额外奖励 +5💰' : ''}（今日贴贴获经验 ${nextCount}/${DAILY_HIGHFIVE_EXP_LIMIT}）`;
        if (!canGainExp) {
            msg = reachedDailyCap
                ? `🤝 贴贴互动成功！今日贴贴获经验次数已满（${DAILY_HIGHFIVE_EXP_LIMIT}/${DAILY_HIGHFIVE_EXP_LIMIT}），本次不加经验`
                : `🤝 贴贴互动成功！今天已经和 ${host.displayName} 贴贴过啦，本次不加经验`;
        }

        return res.json({
            success: true,
            expGained: canGainExp,
            leveledUp: Boolean(visitorEvo?.leveledUp),
            dailyHighfiveCount: nextCount,
            dailyHighfiveLimit: DAILY_HIGHFIVE_EXP_LIMIT,
            message: msg,
            student: dataStore.getSafeStudentById(visitor.id),
            targetStudent: dataStore.getSafeStudentById(host.id)
        });
    }
});

// 佩戴已解锁皮肤
router.post('/skin/equip', (req, res) => {
    const studentId = req.session.studentId;
    const permissions = dataStore.getPermissions();

    if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
        return res.status(403).json({ success: false, message: '当前课堂模式下禁止更换形象' });
    }

    const { skinId } = req.body;
    if (!skinId || typeof skinId !== 'string') {
        return res.status(400).json({ success: false, message: '缺少皮肤ID' });
    }

    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });

    if (!student.pet.unlockedSkins.includes(skinId)) {
        return res.status(400).json({ success: false, message: '尚未解锁此款皮肤' });
    }

    dataStore.updateStudent(studentId, s => {
        s.pet.currentSkin = skinId;
    });

    broadcaster.broadcastClassState();
    res.json({ success: true, currentSkin: skinId });
});

// 购买新皮肤（由服务端查表决定价格和等级条件，严禁信任客户端传入的 price）
router.post('/skin/buy', (req, res) => {
    const studentId = req.session.studentId;
    const permissions = dataStore.getPermissions();

    if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
        return res.status(403).json({ success: false, message: '当前课堂模式下禁止兑换形象' });
    }

    const { skinId } = req.body;
    if (!skinId || typeof skinId !== 'string') {
        return res.status(400).json({ success: false, message: '皮肤ID参数不正确' });
    }

    const skinConfig = OFFICIAL_SKINS[skinId];
    if (!skinConfig) {
        return res.status(400).json({ success: false, message: '商城中不存在该皮肤形象' });
    }

    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });

    if (student.pet.unlockedSkins.includes(skinId)) {
        return res.status(400).json({ success: false, message: '已拥有该皮肤，无需重复兑换' });
    }

    if (student.pet.level < (skinConfig.reqLevel || 1)) {
        return res.status(400).json({ success: false, message: `该形象需要达到 Lv.${skinConfig.reqLevel} 才能兑换！` });
    }

    const officialPrice = skinConfig.price;

    if (student.pet.coins < officialPrice) {
        return res.status(400).json({ success: false, message: '课堂币不足以兑换此皮肤' });
    }

    dataStore.updateStudent(studentId, s => {
        s.pet.coins -= officialPrice;
        s.pet.unlockedSkins.push(skinId);
        s.pet.currentSkin = skinId;
    });

    dataStore.addLog('skin_buy', `兑换并佩戴了形象「${skinConfig.name}」，消耗 ${officialPrice} 课堂币`, student.id, student.displayName, student.displayName);
    broadcaster.broadcastScoreUpdate(student, '兑换形象', -officialPrice, 0);

    res.json({ success: true, student: dataStore.getSafeStudentById(studentId) });
});

// 切换已解锁庭院背景（支持 'auto' 或 null 恢复跟随当前物种默认背景）
router.post('/background/equip', (req, res) => {
    const studentId = req.session.studentId;
    const permissions = dataStore.getPermissions();

    if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
        return res.status(403).json({ success: false, message: '当前课堂模式下禁止更换庭院背景' });
    }

    const { bgId } = req.body;
    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });

    if (!bgId || bgId === 'auto') {
        dataStore.updateStudent(studentId, s => {
            s.pet.currentBackground = null;
        });
        broadcaster.broadcastClassState();
        return res.json({ success: true, currentBackground: null });
    }

    if (typeof bgId !== 'string' || !OFFICIAL_BACKGROUNDS[bgId]) {
        return res.status(400).json({ success: false, message: '商城中不存在该庭院背景' });
    }

    const bgConfig = OFFICIAL_BACKGROUNDS[bgId];
    const unlocked = Array.isArray(student.pet.unlockedBackgrounds) ? student.pet.unlockedBackgrounds : ['sunny_courtyard'];
    if (bgConfig.price > 0 && !unlocked.includes(bgId)) {
        return res.status(400).json({ success: false, message: '尚未解锁此款庭院背景' });
    }

    dataStore.updateStudent(studentId, s => {
        if (!Array.isArray(s.pet.unlockedBackgrounds)) {
            s.pet.unlockedBackgrounds = ['sunny_courtyard'];
        }
        if (bgConfig.price === 0 && !s.pet.unlockedBackgrounds.includes(bgId)) {
            s.pet.unlockedBackgrounds.push(bgId);
        }
        s.pet.currentBackground = bgId;
    });

    broadcaster.broadcastClassState();
    res.json({ success: true, currentBackground: bgId });
});

// 购买新庭院背景（由服务端查表决定价格和等级条件）
router.post('/background/buy', (req, res) => {
    const studentId = req.session.studentId;
    const permissions = dataStore.getPermissions();

    if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
        return res.status(403).json({ success: false, message: '当前课堂模式下禁止兑换庭院背景' });
    }

    const { bgId } = req.body;
    if (!bgId || typeof bgId !== 'string') {
        return res.status(400).json({ success: false, message: '背景ID参数不正确' });
    }

    const bgConfig = OFFICIAL_BACKGROUNDS[bgId];
    if (!bgConfig) {
        return res.status(400).json({ success: false, message: '商城中不存在该庭院背景' });
    }

    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });

    const unlocked = Array.isArray(student.pet.unlockedBackgrounds) ? student.pet.unlockedBackgrounds : ['sunny_courtyard'];
    if (unlocked.includes(bgId)) {
        return res.status(400).json({ success: false, message: '已拥有该庭院背景，无需重复兑换' });
    }

    const reqLv = Number(bgConfig.reqLevel) || 1;
    if (reqLv > 1 && student.pet.level < reqLv) {
        return res.status(400).json({ success: false, message: `该背景需要达到 Lv.${reqLv} 才能兑换！` });
    }

    const officialPrice = bgConfig.price;
    if (student.pet.coins < officialPrice) {
        return res.status(400).json({ success: false, message: '课堂币不足以兑换此庭院背景' });
    }

    dataStore.updateStudent(studentId, s => {
        if (!Array.isArray(s.pet.unlockedBackgrounds)) {
            s.pet.unlockedBackgrounds = ['sunny_courtyard'];
        }
        s.pet.coins -= officialPrice;
        s.pet.unlockedBackgrounds.push(bgId);
        s.pet.currentBackground = bgId;
    });

    dataStore.addLog('bg_buy', `兑换并装扮了庭院背景「${bgConfig.name}」，消耗 ${officialPrice} 课堂币`, student.id, student.displayName, student.displayName);
    broadcaster.broadcastScoreUpdate(student, '兑换背景', -officialPrice, 0);

    res.json({ success: true, student: dataStore.getSafeStudentById(studentId) });
});

// 统一注册名片边框与称号的购买/佩戴接口
function registerCosmeticRoutes({ routePrefix, catalogMap, currentField, unlockedField, defaultId, label, logType }) {
    router.post(`/${routePrefix}/equip`, (req, res) => {
        const studentId = req.session.studentId;
        const permissions = dataStore.getPermissions();
        if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
            return res.status(403).json({ success: false, message: `当前课堂模式下禁止更换${label}` });
        }

        const itemId = req.body?.itemId;
        const student = dataStore.getStudentById(studentId);
        if (!student) return res.status(404).json({ success: false, message: '学生未找到' });

        if (!itemId || itemId === 'none') {
            dataStore.updateStudent(studentId, s => {
                s.pet[currentField] = null;
            });
            broadcaster.broadcastClassState();
            return res.json({ success: true, [currentField]: null });
        }

        if (typeof itemId !== 'string' || !catalogMap[itemId]) {
            return res.status(400).json({ success: false, message: `商城中不存在该${label}` });
        }

        const cfg = catalogMap[itemId];
        const unlocked = Array.isArray(student.pet[unlockedField]) ? student.pet[unlockedField] : [defaultId];
        if (cfg.price > 0 && !unlocked.includes(itemId)) {
            return res.status(400).json({ success: false, message: `尚未解锁该${label}` });
        }

        dataStore.updateStudent(studentId, s => {
            if (!Array.isArray(s.pet[unlockedField])) s.pet[unlockedField] = [defaultId];
            if (cfg.price === 0 && !s.pet[unlockedField].includes(itemId)) s.pet[unlockedField].push(itemId);
            s.pet[currentField] = itemId;
        });

        broadcaster.broadcastClassState();
        res.json({ success: true, [currentField]: itemId });
    });

    router.post(`/${routePrefix}/buy`, (req, res) => {
        const studentId = req.session.studentId;
        const permissions = dataStore.getPermissions();
        if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
            return res.status(403).json({ success: false, message: `当前课堂模式下禁止兑换${label}` });
        }

        const itemId = req.body?.itemId;
        if (!itemId || typeof itemId !== 'string' || !catalogMap[itemId]) {
            return res.status(400).json({ success: false, message: `商城中不存在该${label}` });
        }

        const cfg = catalogMap[itemId];
        const student = dataStore.getStudentById(studentId);
        if (!student) return res.status(404).json({ success: false, message: '学生未找到' });

        const unlocked = Array.isArray(student.pet[unlockedField]) ? student.pet[unlockedField] : [defaultId];
        if (unlocked.includes(itemId) || cfg.price === 0) {
            return res.status(400).json({ success: false, message: `已拥有该${label}，无需重复兑换` });
        }

        const reqLv = Number(cfg.reqLevel) || 1;
        if (reqLv > 1 && student.pet.level < reqLv) {
            return res.status(400).json({ success: false, message: `该${label}需要达到 Lv.${reqLv} 才能兑换！` });
        }

        if (student.pet.coins < cfg.price) {
            return res.status(400).json({ success: false, message: `课堂币不足以兑换该${label}` });
        }

        dataStore.updateStudent(studentId, s => {
            if (!Array.isArray(s.pet[unlockedField])) s.pet[unlockedField] = [defaultId];
            s.pet.coins -= cfg.price;
            s.pet[unlockedField].push(itemId);
            s.pet[currentField] = itemId;
        });

        dataStore.addLog(logType, `兑换并佩戴了${label}「${cfg.name}」，消耗 ${cfg.price} 课堂币`, student.id, student.displayName, student.displayName);
        broadcaster.broadcastScoreUpdate(student, `兑换${label}`, -cfg.price, 0);

        res.json({ success: true, student: dataStore.getSafeStudentById(studentId) });
    });
}

registerCosmeticRoutes({
    routePrefix: 'frame',
    catalogMap: OFFICIAL_FRAMES,
    currentField: 'currentFrame',
    unlockedField: 'unlockedFrames',
    defaultId: 'default_wood',
    label: '名片边框',
    logType: 'frame_buy'
});

registerCosmeticRoutes({
    routePrefix: 'title',
    catalogMap: OFFICIAL_TITLES,
    currentField: 'currentTitle',
    unlockedField: 'unlockedTitles',
    defaultId: 'classroom_rookie',
    label: '荣誉称号',
    logType: 'title_buy'
});

// 初次登录领养御三家首发伙伴（仅允许领取一次，不受上课模式锁定限制）
router.post('/starter/choose', (req, res) => {
    const studentId = req.session.studentId;
    const { skinId } = req.body;

    if (!skinId || typeof skinId !== 'string') {
        return res.status(400).json({ success: false, message: '请选择一只御三家首发伙伴' });
    }

    const skinConfig = OFFICIAL_SKINS[skinId];
    if (!skinConfig || !skinConfig.isStarter) {
        return res.status(400).json({ success: false, message: '该角色不在初始领养御三家范围内' });
    }

    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });

    if (student.pet.hasChosenStarter) {
        return res.status(400).json({ success: false, message: '你已经完成过初始伙伴领养，请在物种图鉴中切换或解锁其他伙伴' });
    }

    dataStore.updateStudent(studentId, s => {
        if (!Array.isArray(s.pet.unlockedSkins)) s.pet.unlockedSkins = ['default_cat'];
        if (!s.pet.unlockedSkins.includes(skinId)) {
            s.pet.unlockedSkins.push(skinId);
        }
        s.pet.currentSkin = skinId;
        s.pet.hasChosenStarter = true;
    });

    dataStore.addLog('starter_choose', `领养了首发伙伴「${skinConfig.name}」`, student.id, student.displayName, student.displayName);
    broadcaster.broadcastClassState();

    res.json({ success: true, student: dataStore.getSafeStudentById(studentId) });
});

// 抽蛋模式：随机抽取宠物（每位学生每轮最多 3 次机会）
router.post('/starter/draw', (req, res) => {
    const studentId = req.session.studentId;
    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });
    if (student.pet.hasChosenStarter) {
        return res.status(400).json({ success: false, message: '本轮已完成宠物领养' });
    }

    const chances = typeof student.pet.drawChances === 'number' ? student.pet.drawChances : 3;
    if (chances <= 0) {
        return res.status(400).json({ success: false, message: '抽蛋次数已用完' });
    }

    const pool = SKINS_CATALOG.filter(s => s.isStarter || (s.reqLevel || 1) <= 1);
    const candidates = pool.filter(s => s.id !== student.pet.currentSkin);
    const finalPool = candidates.length > 0 ? candidates : pool;
    const drawn = finalPool[Math.floor(Math.random() * finalPool.length)];

    const remain = chances - 1;
    const autoConfirmed = remain <= 0;

    dataStore.updateStudent(studentId, s => {
        if (!Array.isArray(s.pet.unlockedSkins)) s.pet.unlockedSkins = ['default_cat'];
        if (!s.pet.unlockedSkins.includes(drawn.id)) {
            s.pet.unlockedSkins.push(drawn.id);
        }
        s.pet.currentSkin = drawn.id;
        s.pet.drawChances = remain;
        if (autoConfirmed) {
            s.pet.hasChosenStarter = true;
        }
    });

    dataStore.addLog('starter_draw', `抽蛋唤醒了「${drawn.name}」（剩余${remain}次）`, student.id, student.displayName, student.displayName);
    broadcaster.broadcastClassState();

    res.json({
        success: true,
        drawnSkinId: drawn.id,
        drawChances: remain,
        autoConfirmed,
        student: dataStore.getSafeStudentById(studentId)
    });
});

// 抽蛋模式：确认领养当前抽到的宠物
router.post('/starter/confirm', (req, res) => {
    const studentId = req.session.studentId;
    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });
    if (student.pet.hasChosenStarter) {
        return res.status(400).json({ success: false, message: '已完成领养' });
    }
    const chances = typeof student.pet.drawChances === 'number' ? student.pet.drawChances : 3;
    if (chances === 3 && !student.pet.currentSkin) {
        return res.status(400).json({ success: false, message: '请先抽一次宠物蛋再确认领养' });
    }

    dataStore.updateStudent(studentId, s => {
        s.pet.hasChosenStarter = true;
    });

    const skinCfg = OFFICIAL_SKINS[student.pet.currentSkin] || { name: student.pet.currentSkin };
    dataStore.addLog('starter_choose', `确认领养了「${skinCfg.name}」`, student.id, student.displayName, student.displayName);
    broadcaster.broadcastClassState();

    res.json({ success: true, student: dataStore.getSafeStudentById(studentId) });
});

// 满级后开启下一轮新宠领养（原满级宠物保留在个人图鉴中）
router.post('/pet/next-round', (req, res) => {
    const studentId = req.session.studentId;
    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });
    if ((student.pet.level || 0) < 10) {
        return res.status(400).json({ success: false, message: '当前宠物达到 Lv.10 满级后才能开启下一轮领养' });
    }

    dataStore.updateStudent(studentId, s => {
        if (!Array.isArray(s.pet.dex)) s.pet.dex = [];
        const gen = s.pet.generation || 1;
        if (!s.pet.dex.some(item => item.skinId === s.pet.currentSkin && item.generation === gen)) {
            s.pet.dex.push({
                skinId: s.pet.currentSkin,
                generation: gen,
                level: 10,
                completedAt: new Date().toISOString()
            });
        }
        s.pet.generation = gen + 1;
        s.pet.level = 0;
        s.pet.exp = 0;
        s.pet.isCracked = false;
        s.pet.hasChosenStarter = false;
        s.pet.drawChances = 3;
    });

    dataStore.addLog('next_round', `满级入驻图鉴，开启第 ${student.pet.generation} 轮新伙伴领养`, student.id, student.displayName, student.displayName);
    broadcaster.broadcastClassState();

    res.json({ success: true, student: dataStore.getSafeStudentById(studentId) });
});

// 使用课堂币购买并解锁精品配饰
router.post('/accessories/buy', (req, res) => {
    const studentId = req.session.studentId;
    const permissions = dataStore.getPermissions();

    if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
        return res.status(403).json({ success: false, message: '当前课堂模式下禁止购买配饰' });
    }

    const { accId } = req.body;
    if (!accId || typeof accId !== 'string') {
        return res.status(400).json({ success: false, message: '缺少配饰ID参数' });
    }

    const accConfig = OFFICIAL_ACCESSORIES[accId];
    if (!accConfig) {
        return res.status(400).json({ success: false, message: '配饰商城中不存在该配饰' });
    }

    const student = dataStore.getStudentById(studentId);
    if (!student) return res.status(404).json({ success: false, message: '学生未找到' });

    const unlocked = Array.isArray(student.pet.unlockedAccessories) ? student.pet.unlockedAccessories : [];
    if (accConfig.price <= 0 || unlocked.includes(accId)) {
        return res.status(400).json({ success: false, message: '已拥有该配饰，无需重复购买' });
    }

    if (student.pet.coins < accConfig.price) {
        return res.status(400).json({ success: false, message: `课堂币不足，购买「${accConfig.name}」需要 ${accConfig.price} 课堂币` });
    }

    dataStore.updateStudent(studentId, s => {
        s.pet.coins -= accConfig.price;
        if (!Array.isArray(s.pet.unlockedAccessories)) s.pet.unlockedAccessories = [];
        s.pet.unlockedAccessories.push(accId);

        // 自动替换同槽位旧配饰并穿戴新购买配饰
        const sameSlotIds = Object.entries(OFFICIAL_ACCESSORIES)
            .filter(([, cfg]) => cfg.slot === accConfig.slot)
            .map(([id]) => id);
        const currentAccs = Array.isArray(s.pet.accessories) ? s.pet.accessories : [];
        s.pet.accessories = currentAccs.filter(id => !sameSlotIds.includes(id));
        s.pet.accessories.push(accId);
    });

    dataStore.addLog('acc_buy', `花费 ${accConfig.price} 课堂币解锁配饰「${accConfig.name}」`, student.id, student.displayName, student.displayName);
    broadcaster.broadcastScoreUpdate(student, `解锁配饰:${accConfig.name}`, -accConfig.price, 0);

    res.json({ success: true, student: dataStore.getSafeStudentById(studentId) });
});

// 配戴饰品与捏脸部件
router.post('/accessories/equip', (req, res) => {
    const studentId = req.session.studentId;
    const permissions = dataStore.getPermissions();

    if (permissions.currentMode === 'class' || permissions.currentMode === 'dismissed') {
        return res.status(403).json({ success: false, message: '当前课堂模式下禁止更换饰品' });
    }

    const { accessories, colorHue } = req.body;
    const studentRecord = dataStore.getStudentById(studentId);
    if (!studentRecord) return res.status(404).json({ success: false, message: '学生未找到' });

    const unlockedAccs = Array.isArray(studentRecord.pet.unlockedAccessories) ? studentRecord.pet.unlockedAccessories : [];

    if (Array.isArray(accessories)) {
        for (const accId of accessories) {
            if (typeof accId !== 'string') continue;
            if (accId.startsWith('face_')) continue;
            const cfg = OFFICIAL_ACCESSORIES[accId];
            if (!cfg) {
                return res.status(400).json({ success: false, message: `无效的配饰ID: ${accId}` });
            }
            if (cfg.price > 0 && !unlockedAccs.includes(accId)) {
                return res.status(403).json({ success: false, message: `配饰「${cfg.name}」尚未购买解锁` });
            }
        }
    }

    const student = dataStore.updateStudent(studentId, s => {
        if (Array.isArray(accessories)) {
            s.pet.accessories = accessories.filter(a => typeof a === 'string').slice(0, 15);
        }
        if (typeof colorHue === 'number' && !isNaN(colorHue)) {
            s.pet.colorHue = Math.max(0, Math.min(360, colorHue));
        }
    });

    broadcaster.broadcastClassState();
    res.json({ success: true, pet: student.pet });
});

// 获取个人流水日志
router.get('/logs', (req, res) => {
    const studentId = req.session.studentId;
    res.json({ success: true, logs: dataStore.getLogs(50, studentId) });
});

module.exports = router;
