const dataStore = require('./data-store');

let decayIntervalTimer = null;
let broadcaster = null;

class DecayService {
    setBroadcaster(b) {
        broadcaster = b;
    }

    start() {
        if (decayIntervalTimer) clearInterval(decayIntervalTimer);

        // 每 60 秒检查一次饱腹度衰减
        decayIntervalTimer = setInterval(() => {
            const permissions = dataStore.getPermissions();

            // 检查倒计时课堂模式是否过期，如果过期自动恢复为上课模式
            if (permissions.modeEndTime && Date.now() >= permissions.modeEndTime) {
                console.log('[DecayService] 课堂临时模式倒计时结束，自动切回上课模式');
                dataStore.setMode('class', null);
                if (broadcaster) {
                    broadcaster.broadcastModeChange('class', null);
                }
            }

            // 下课状态或衰减关闭时不衰减
            if (!permissions.decayEnabled || permissions.currentMode === 'dismissed') {
                return;
            }

            const students = dataStore.getAllStudents();
            let changed = false;

            students.forEach(s => {
                if (s.status === 'active' && s.pet) {
                    if (s.pet.fullness > 15) {
                        s.pet.fullness = Math.max(15, s.pet.fullness - 1);
                        changed = true;
                    }
                }
            });

            if (changed) {
                dataStore.saveStudents();
                if (broadcaster) {
                    broadcaster.broadcastClassState();
                }
            }
        }, 60000);

        console.log('[DecayService] 饱腹度与课堂模式定时服务已启动');
    }

    stop() {
        if (decayIntervalTimer) {
            clearInterval(decayIntervalTimer);
            decayIntervalTimer = null;
        }
    }
}

module.exports = new DecayService();
