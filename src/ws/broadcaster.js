const dataStore = require('../services/data-store');

class Broadcaster {
    constructor() {
        this.wsServer = null;
    }

    setWsServer(wsServer) {
        this.wsServer = wsServer;
    }

    // 广播到所有连接端（教师、学生、大屏）
    broadcastAll(type, data) {
        if (!this.wsServer) return;
        this.wsServer.broadcastToAll({ type, data, timestamp: Date.now() });
    }

    // 仅广播给教师端
    broadcastToTeachers(type, data) {
        if (!this.wsServer) return;
        this.wsServer.broadcastToRole('teacher', { type, data, timestamp: Date.now() });
    }

    // 广播给指定学生
    sendToStudent(studentId, type, data) {
        if (!this.wsServer) return;
        this.wsServer.sendToStudent(Number(studentId), { type, data, timestamp: Date.now() });
    }

    // 模式变更广播
    broadcastModeChange(mode, modeEndTime) {
        const remaining = modeEndTime ? Math.max(0, Math.floor((modeEndTime - Date.now()) / 1000)) : null;
        this.broadcastAll('mode_change', {
            mode,
            modeEndTime,
            remainingSeconds: remaining
        });
    }

    // 学生加分/扣分实时刷新
    broadcastScoreUpdate(student, reason, deltaCoins, deltaFullness) {
        this.broadcastAll('score_update', {
            studentId: student.id,
            displayName: student.displayName,
            coins: student.pet.coins,
            fullness: student.pet.fullness,
            level: student.pet.level,
            exp: student.pet.exp,
            reason,
            deltaCoins,
            deltaFullness
        });
    }

    // 全量班级状态更新
    broadcastClassState() {
        const students = dataStore.getAllStudents().map(s => ({
            id: s.id,
            username: s.username,
            displayName: s.displayName,
            status: s.status,
            pet: s.pet
        }));
        const permissions = dataStore.getPermissions();
        this.broadcastAll('class_state', { students, permissions });
    }
}

module.exports = new Broadcaster();
