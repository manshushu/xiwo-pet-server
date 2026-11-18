// 学生端全局动作频率限制（内存级，防止连点/脚本刷接口导致卡顿）
const DEFAULT_COOLDOWN_MS = 2000;
const lastActionMap = new Map();

function checkStudentCooldown(studentId, cooldownMs = DEFAULT_COOLDOWN_MS) {
    const key = String(studentId);
    const now = Date.now();
    const last = lastActionMap.get(key) || 0;
    const elapsed = now - last;

    if (elapsed < cooldownMs) {
        return {
            allowed: false,
            retryAfterMs: cooldownMs - elapsed
        };
    }

    lastActionMap.set(key, now);
    return { allowed: true, retryAfterMs: 0 };
}

function studentActionCooldownMiddleware(cooldownMs = DEFAULT_COOLDOWN_MS) {
    return (req, res, next) => {
        if (req.method !== 'POST') return next();
        if (req.path === '/starter/confirm') return next();
        if (!req.session || req.session.role !== 'student' || !req.session.studentId) {
            return next();
        }

        const result = checkStudentCooldown(req.session.studentId, cooldownMs);
        if (!result.allowed) {
            const waitSec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
            return res.status(429).json({
                success: false,
                code: 'ACTION_COOLDOWN',
                retryAfterMs: result.retryAfterMs,
                message: `操作太快啦，请 ${waitSec} 秒后再试！`
            });
        }

        return next();
    };
}

module.exports = {
    DEFAULT_COOLDOWN_MS,
    checkStudentCooldown,
    studentActionCooldownMiddleware
};
