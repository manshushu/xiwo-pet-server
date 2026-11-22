const { RANKS_CATALOG, LEADERBOARD_TYPES } = require('../public/shared/js/skins-catalog');

function getCurrentIsoWeekKey(date = new Date()) {
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getCurrentPeriodKey(config = {}) {
    if (config && typeof config.darkhorsePeriodKey === 'string' && config.darkhorsePeriodKey.trim()) {
        return config.darkhorsePeriodKey.trim();
    }
    return getCurrentIsoWeekKey();
}

function getCollectionCount(pet = {}) {
    const skins = Array.isArray(pet.unlockedSkins) ? pet.unlockedSkins.length : 1;
    const bgs = Array.isArray(pet.unlockedBackgrounds) ? pet.unlockedBackgrounds.length : 1;
    const frames = Array.isArray(pet.unlockedFrames) ? pet.unlockedFrames.length : 1;
    const titles = Array.isArray(pet.unlockedTitles) ? pet.unlockedTitles.length : 1;
    const accs = Array.isArray(pet.unlockedAccessories) ? pet.unlockedAccessories.length : 0;
    const dex = Array.isArray(pet.dex) ? pet.dex.length : 0;
    return skins + bgs + frames + titles + accs + dex * 3;
}

function getEffectiveTotalScore(pet = {}) {
    const recorded = Number(pet.totalEarnedScore) || 0;
    if (recorded > 0) return recorded;
    const lv = Number(pet.level) || 0;
    const exp = Number(pet.exp) || 0;
    const dexCount = Array.isArray(pet.dex) ? pet.dex.length : 0;
    return Math.max(0, lv * 50 + Math.floor(exp / 2) + dexCount * 300);
}

function resolveRankInfo(honorScore) {
    let current = RANKS_CATALOG[0];
    let next = null;
    for (let i = 0; i < RANKS_CATALOG.length; i++) {
        if (honorScore >= RANKS_CATALOG[i].minScore) {
            current = RANKS_CATALOG[i];
            next = RANKS_CATALOG[i + 1] || null;
        } else {
            break;
        }
    }
    return { rank: current, nextRank: next };
}

function computeStudentMetrics(student, currentPeriodKey) {
    const pet = student?.pet || {};
    const level = Number(pet.level) || 0;
    const dexCount = Array.isArray(pet.dex) ? pet.dex.length : 0;
    const collectionCount = getCollectionCount(pet);
    const totalScore = getEffectiveTotalScore(pet);
    const honorScore = totalScore + level * 20 + dexCount * 150 + collectionCount * 8;
    const periodScore = pet.periodKey === currentPeriodKey ? (Number(pet.periodScore) || 0) : 0;
    const popularity = Number(pet.popularity) || 0;
    const { rank, nextRank } = resolveRankInfo(honorScore);

    return {
        totalScore,
        honorScore,
        periodScore,
        collectionCount,
        popularity,
        rank,
        nextRank
    };
}

const BADGE_META = {
    honor: { prefix: '荣耀', icon: '👑' },
    darkhorse: { prefix: '黑马', icon: '⚡' },
    collection: { prefix: '收藏', icon: '💎' },
    popularity: { prefix: '人气', icon: '💖' }
};

function getScoreByBoard(metrics, board) {
    if (board === 'darkhorse') return metrics.periodScore;
    if (board === 'collection') return metrics.collectionCount;
    if (board === 'popularity') return metrics.popularity;
    return metrics.honorScore;
}

function sortStudentsForBoard(list, board, currentPeriodKey) {
    return list
        .filter(s => s && s.status !== 'frozen')
        .map(s => {
            const metrics = computeStudentMetrics(s, currentPeriodKey);
            return {
                student: s,
                metrics,
                score: getScoreByBoard(metrics, board)
            };
        })
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.metrics.honorScore !== a.metrics.honorScore) return b.metrics.honorScore - a.metrics.honorScore;
            return Number(a.student.id) - Number(b.student.id);
        });
}

function computeClassHonorBadges(students, currentPeriodKey) {
    const badgeMap = new Map();
    const boards = ['honor', 'darkhorse', 'collection', 'popularity'];

    boards.forEach(board => {
        const sorted = sortStudentsForBoard(students, board, currentPeriodKey);
        const meta = BADGE_META[board];
        let count = 0;
        for (const item of sorted) {
            if (item.score <= 0 || count >= 3) break;
            count += 1;
            const sid = item.student.id;
            if (!badgeMap.has(sid)) badgeMap.set(sid, []);
            badgeMap.get(sid).push({
                board,
                rank: count,
                icon: meta.icon,
                label: `${meta.icon}${meta.prefix}Top${count}`
            });
        }
    });

    return badgeMap;
}

function formatLeaderboardRow(item, idx, badgeMap) {
    const s = item.student;
    const pet = s.pet || {};
    return {
        rank: idx + 1,
        id: s.id,
        username: s.username,
        displayName: s.displayName,
        className: s.className || null,
        score: item.score,
        honorScore: item.metrics.honorScore,
        rankInfo: item.metrics.rank,
        honorBadges: badgeMap ? (badgeMap.get(s.id) || []) : [],
        pet: {
            level: pet.level || 0,
            currentSkin: pet.currentSkin || 'default_cat',
            currentBackground: pet.currentBackground || null,
            currentFrame: pet.currentFrame || 'default_wood',
            currentTitle: pet.currentTitle || null,
            accessories: pet.accessories || [],
            colorHue: pet.colorHue || 0
        }
    };
}

function buildLeaderboard({ board = 'honor', students = [], currentPeriodKey, selfStudentId = null, selfClassName = null, gradeData = null }) {
    const boardMeta = LEADERBOARD_TYPES.find(b => b.id === board) || LEADERBOARD_TYPES[0];
    const targetBoard = boardMeta.id;
    const isGrade = targetBoard === 'grade';
    const sourceList = isGrade && gradeData ? gradeData.students : students;

    // 荣耀小标固定由本班 4 榜产生
    const classBadgeMap = computeClassHonorBadges(students, currentPeriodKey);
    const sorted = sortStudentsForBoard(sourceList, targetBoard, currentPeriodKey);

    const topList = sorted.slice(0, 10).map((item, idx) => {
        const useBadges = !isGrade || !selfClassName || item.student.className === selfClassName;
        return formatLeaderboardRow(item, idx, useBadges ? classBadgeMap : null);
    });

    let myRank = null;
    if (selfStudentId !== null && selfStudentId !== undefined) {
        const myIdx = sorted.findIndex(item => {
            if (Number(item.student.id) !== Number(selfStudentId)) return false;
            if (isGrade && selfClassName && item.student.className) {
                return item.student.className === selfClassName;
            }
            return true;
        });
        if (myIdx >= 0) {
            const myItem = sorted[myIdx];
            const prevItem = myIdx > 0 ? sorted[myIdx - 1] : null;
            myRank = {
                rank: myIdx + 1,
                totalCount: sorted.length,
                score: myItem.score,
                gapToPrev: prevItem ? Math.max(0, prevItem.score - myItem.score) : 0,
                honorScore: myItem.metrics.honorScore,
                rankInfo: myItem.metrics.rank,
                nextRankInfo: myItem.metrics.nextRank,
                gapToNextTier: myItem.metrics.nextRank
                    ? Math.max(0, myItem.metrics.nextRank.minScore - myItem.metrics.honorScore)
                    : 0,
                honorBadges: classBadgeMap.get(Number(selfStudentId)) || []
            };
        }
    }

    return {
        board: boardMeta,
        currentPeriodKey,
        topList,
        myRank,
        gradeInfo: isGrade && gradeData ? { gradeName: gradeData.gradeName, classCount: gradeData.classCount } : null
    };
}

module.exports = {
    getCurrentIsoWeekKey,
    getCurrentPeriodKey,
    getCollectionCount,
    getEffectiveTotalScore,
    resolveRankInfo,
    computeStudentMetrics,
    computeClassHonorBadges,
    buildLeaderboard
};
