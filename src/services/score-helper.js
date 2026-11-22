const dataStore = require('./data-store');
const broadcaster = require('../ws/broadcaster');
const { getCurrentPeriodKey } = require('./ranking-helper');

const SCORE_TO_COIN_RATE = 5;

function recordPeriodGrowth(pet, growthDelta, periodKey) {
    if (!pet) return;
    const delta = Number(growthDelta) || 0;
    if (delta <= 0) return;
    pet.totalEarnedScore = (Number(pet.totalEarnedScore) || 0) + delta;
    if (pet.periodKey !== periodKey) {
        pet.periodKey = periodKey;
        pet.periodScore = 0;
    }
    pet.periodScore = (Number(pet.periodScore) || 0) + delta;
}

function getEvolutionStage(level) {
    const lv = Number(level) || 0;
    if (lv <= 0) return 0;
    if (lv >= 10) return 4;
    if (lv >= 7) return 3;
    if (lv >= 4) return 2;
    return 1;
}

function addPetExpWithEvolution(pet, expDelta) {
    if (!pet) {
        return { leveledUp: false, oldLevel: 0, newLevel: 0, oldStage: 0, newStage: 0, evolved: false, reachedMax: false };
    }
    const oldLevel = Number(pet.level) || 0;
    const oldStage = getEvolutionStage(oldLevel);
    let leveledUp = false;
    const delta = Number(expDelta) || 0;

    if (delta > 0 && oldLevel < 10) {
        pet.exp = (Number(pet.exp) || 0) + delta;
        while ((Number(pet.level) || 0) < 10) {
            const curLevel = Number(pet.level) || 0;
            const reqExp = curLevel === 0 ? 30 : curLevel * 100;
            if (pet.exp >= reqExp) {
                pet.exp -= reqExp;
                pet.level = curLevel + 1;
                leveledUp = true;
            } else {
                break;
            }
        }
        if ((Number(pet.level) || 0) >= 10) {
            pet.level = 10;
            pet.exp = 0;
            if (!Array.isArray(pet.dex)) pet.dex = [];
            const gen = pet.generation || 1;
            const alreadyRecorded = pet.dex.some(item => item.skinId === pet.currentSkin && item.generation === gen);
            if (!alreadyRecorded) {
                pet.dex.push({
                    skinId: pet.currentSkin,
                    generation: gen,
                    level: 10,
                    completedAt: new Date().toISOString()
                });
            }
        }
    }

    const newLevel = Number(pet.level) || 0;
    const newStage = getEvolutionStage(newLevel);
    return {
        leveledUp,
        oldLevel,
        newLevel,
        oldStage,
        newStage,
        evolved: newStage > oldStage,
        reachedMax: newLevel === 10 && oldLevel < 10
    };
}

function broadcastPetLevelUpIfNeeded(student, evoResult) {
    if (!student || !evoResult || !evoResult.leveledUp) return;
    broadcaster.broadcastAll('pet_level_up', {
        studentId: student.id,
        displayName: student.displayName,
        oldLevel: evoResult.oldLevel,
        newLevel: evoResult.newLevel,
        oldStage: evoResult.oldStage,
        newStage: evoResult.newStage,
        evolved: evoResult.evolved,
        reachedMax: evoResult.reachedMax,
        skinId: student.pet?.currentSkin
    });
}

/**
 * 给指定学生应用积分/饱腹度变更，统一处理孵化、进化、满级入库与 WebSocket 广播
 */
function applyStudentScoreChange(studentId, {
    coinsDelta = 0,
    rawCoinsDelta = null,
    fullnessDelta = 0,
    reason = '课堂表现优异',
    logType = null,
    operator = '教师',
    applyMultiplier = true
} = {}) {
    const isRawMode = rawCoinsDelta !== null && rawCoinsDelta !== undefined;
    const basePoints = Number(coinsDelta) || 0;
    const actualCoins = isRawMode
        ? (Number(rawCoinsDelta) || 0)
        : (applyMultiplier ? basePoints * SCORE_TO_COIN_RATE : basePoints);
    const expGain = isRawMode
        ? Math.max(0, actualCoins * 2)
        : Math.max(0, basePoints * 10);
    const growthGain = actualCoins > 0 ? actualCoins : 0;
    const fDelta = Number(fullnessDelta) || 0;
    const currentPeriodKey = getCurrentPeriodKey(dataStore.getConfig());
    let evoResult = null;

    const student = dataStore.updateStudent(studentId, s => {
        const oldLevel = Number(s.pet.level) || 0;
        const rawCoins = (s.pet.coins || 0) + actualCoins;
        if (actualCoins < 0 && rawCoins < 0 && oldLevel === 0) {
            s.pet.isCracked = true;
        } else if (actualCoins > 0) {
            s.pet.isCracked = false;
        }

        s.pet.coins = Math.max(0, rawCoins);
        s.pet.fullness = Math.min(100, Math.max(0, (s.pet.fullness || 0) + fDelta));

        if (growthGain > 0) {
            recordPeriodGrowth(s.pet, growthGain, currentPeriodKey);
        }

        if (expGain > 0 && oldLevel < 10) {
            evoResult = addPetExpWithEvolution(s.pet, expGain);
        }
    });

    if (!student) return null;

    broadcastPetLevelUpIfNeeded(student, evoResult);

    const resolvedLogType = logType || (actualCoins >= 0 ? 'score_add' : 'score_deduct');
    const scoreDesc = (!isRawMode && applyMultiplier && basePoints !== 0)
        ? `${basePoints > 0 ? '+' : ''}${basePoints}分 / ${actualCoins >= 0 ? '+' : ''}${actualCoins}币`
        : `${actualCoins >= 0 ? '+' : ''}${actualCoins}币`;
    dataStore.addLog(
        resolvedLogType,
        `${reason} (${scoreDesc}, ${fDelta >= 0 ? '+' : ''}${fDelta}%饱腹)`,
        student.id,
        student.displayName,
        operator
    );
    broadcaster.broadcastScoreUpdate(student, reason, actualCoins, fDelta);

    return { student, coinsDelta: actualCoins, leveledUp: Boolean(evoResult?.leveledUp) };
}

module.exports = {
    SCORE_TO_COIN_RATE,
    recordPeriodGrowth,
    applyStudentScoreChange,
    getEvolutionStage,
    addPetExpWithEvolution,
    broadcastPetLevelUpIfNeeded
};
