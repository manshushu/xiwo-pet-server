// 教师机管控台核心驱动逻辑
class TeacherApp {
    constructor() {
        this.students = [];
        this.permissions = {};
        this.config = {};
        this.selectedStudentIds = new Set();
        this.currentActiveStudent = null;
        this.ws = null;
        this.countdownTimer = null;
        this.remainingSeconds = null;

        this.init();
    }

    async init() {
        await Promise.all([this.fetchData(), this.fetchClasses()]);
        this.initWebSocket();
        this.renderGrid();
        this.bindShortcuts();
    }

    async fetchClasses() {
        try {
            const res = await fetch('/api/teacher/classes');
            const data = await res.json();
            if (data.success && Array.isArray(data.classes)) {
                this.availableClasses = data.classes;
                this.renderClassOptions(data.currentClassName);
            }
        } catch (err) {
            console.error('[TeacherApp] 获取班级列表失败:', err);
        }
    }

    renderClassOptions(currentName) {
        const sel = document.getElementById('class-switch-select');
        if (!sel) return;
        const list = Array.isArray(this.availableClasses) && this.availableClasses.length > 0
            ? this.availableClasses
            : [currentName || '七年级(1)班'];
        sel.innerHTML = list.map(name => `<option value="${name}">${name}</option>`).join('');
        if (currentName) sel.value = currentName;
    }

    async switchClass(className) {
        if (!className || className === this.config?.className) return;
        try {
            const res = await fetch('/api/teacher/switch-class', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ className })
            });
            const data = await res.json();
            if (data.success) {
                this.students = data.students || [];
                this.config = data.config || this.config;
                this.selectedStudentIds.clear();
                this.updateHeaderState();
                this.updateTotalCount();
                this.renderGrid();
                this.showToast(`已切换至 ${data.className}（${this.students.length}人）`);
            } else {
                this.showToast(data.message || '切换班级失败', 'error');
                this.renderClassOptions(this.config?.className);
            }
        } catch (err) {
            console.error('[TeacherApp] 切换班级失败:', err);
            this.renderClassOptions(this.config?.className);
        }
    }

    // ── 数据拉取 ──────────────────────────────────────────────
    async fetchData() {
        try {
            const res = await fetch('/api/teacher/students');
            if (res.status === 403) {
                window.location.replace('/teacher/login.html');
                return;
            }
            const data = await res.json();
            if (data.success) {
                this.students = data.students || [];
                this.permissions = data.permissions || {};
                this.config = data.config || {};
                this.updateHeaderState();
                this.updateTotalCount();
            }
        } catch (err) {
            console.error('[TeacherApp] 获取数据失败:', err);
        }
    }

    updateTotalCount() {
        const el = document.getElementById('total-students-count');
        if (el) el.textContent = this.students.length;
    }

    updateHeaderState() {
        // 更新班级名称
        const sel = document.getElementById('class-switch-select');
        if (sel && this.config.className) {
            this.renderClassOptions(this.config.className);
        }

        // 更新模式按钮高亮
        const currentMode = this.permissions.currentMode || 'class';
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));

        const modeMap = {
            'class': 'btn-mode-class',
            'break': 'btn-mode-break',
            'interactive': 'btn-mode-interactive',
            'outfit_create': 'btn-mode-outfit',
            'dismissed': 'btn-mode-dismissed'
        };
        const activeBtn = document.getElementById(modeMap[currentMode]);
        if (activeBtn) activeBtn.classList.add('active');

        // 处理倒计时
        if (this.permissions.modeEndTime && this.permissions.modeEndTime > Date.now()) {
            this.startCountdown(Math.floor((this.permissions.modeEndTime - Date.now()) / 1000));
        } else {
            this.stopCountdown();
        }
    }

    // ── WebSocket 实时通信 ──────────────────────────────────────
    initWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/ws?role=teacher`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('[WebSocket] 教师端连接成功');
            this.setTicker('教师机连接成功 · 局域网实时交互链路就绪');
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleWsMessage(msg);
            } catch (e) {
                console.error('[WebSocket] 解析消息异常', e);
            }
        };

        this.ws.onclose = () => {
            console.warn('[WebSocket] 连接断开，3秒后重连...');
            setTimeout(() => this.initWebSocket(), 3000);
        };
    }

    handleWsMessage(msg) {
        const { type, data } = msg;

        if (type === 'mode_change') {
            this.permissions.currentMode = data.mode;
            this.permissions.modeEndTime = data.modeEndTime;
            this.updateHeaderState();
            this.setTicker(`课堂模式已切换为「${this.getModeName(data.mode)}」`);
        }

        if (type === 'score_update') {
            const student = this.students.find(s => s.id === data.studentId);
            if (student) {
                student.pet.coins = data.coins;
                student.pet.fullness = data.fullness;
                student.pet.level = data.level;
                student.pet.exp = data.exp;
                this.updateStudentCardDom(student);
            }
        }

        if (type === 'class_state') {
            if (data.students) {
                this.students = data.students;
                this.renderGrid();
            }
            if (data.permissions) {
                this.permissions = data.permissions;
                this.updateHeaderState();
            }
        }

        if (type === 'pending_outfits_count') {
            this.updatePendingOutfitsBadge(data.count);
            if (data.latestName) {
                this.setTicker(`学生提交了新装扮「${data.latestName}」，等待审核`);
            }
        }

        if (type === 'praise_bullet') {
            this.setTicker(`🌟 ${data.fromName} 向 ${data.toName} 送出了鼓励: ${data.emoji}`);
        }

        if (type === 'pet_animation') {
            const card = document.getElementById(`student-card-${data.studentId}`);
            if (card) {
                const stage = card.querySelector('.card-stage');
                if (stage) {
                    const animClass = data.animation === 'eat' ? 'is-eating' : (data.animation === 'purr' ? 'is-purring' : 'is-jumping');
                    stage.classList.remove('is-eating', 'is-purring', 'is-jumping');
                    void stage.offsetWidth;
                    stage.classList.add(animClass);
                    setTimeout(() => stage.classList.remove(animClass), 1200);

                    const bubble = document.createElement('div');
                    bubble.className = 'pet-floating-bubble';
                    bubble.textContent = data.message || '✨';
                    stage.appendChild(bubble);
                    setTimeout(() => bubble.remove(), 2000);
                }
            }
        }
    }

    setTicker(text) {
        const ticker = document.getElementById('bullet-ticker-text');
        if (ticker) ticker.textContent = text;
    }

    getModeName(mode) {
        const names = {
            'class': '上课专注',
            'break': '课间休息',
            'interactive': '自由互动',
            'outfit_create': '装扮创作',
            'dismissed': '下课归档'
        };
        return names[mode] || mode;
    }

    // ── 网格渲染与交互 ──────────────────────────────────────────
    resolvePetScene(pet = {}) {
        const skinCfg = (window.SKINS_CATALOG || []).find(s => s.id === (pet.currentSkin || 'default_cat'))
            || (window.SKINS_CATALOG || [])[0]
            || { sceneBg: '/shared/assets/scenes/sunny_courtyard.png', sceneName: '阳光木屋庭院' };
        const customBg = pet.currentBackground
            ? (window.BACKGROUNDS_CATALOG || []).find(b => b.id === pet.currentBackground)
            : null;
        if (customBg) {
            return { bgUrl: customBg.bgUrl, sceneName: customBg.name };
        }
        return { bgUrl: skinCfg.sceneBg, sceneName: skinCfg.sceneName };
    }

    getTitleConfig(titleId) {
        if (!titleId) return null;
        return (window.TITLES_CATALOG || []).find(t => t.id === titleId) || null;
    }

    renderGrid() {
        const container = document.getElementById('students-grid-container');
        if (!container) return;

        let html = '';
        this.students.forEach(student => {
            const isSelected = this.selectedStudentIds.has(student.id);
            const isFrozen = student.status === 'frozen';
            const pet = student.pet || {};
            const skinId = pet.currentSkin || 'default_cat';
            const accessories = pet.accessories || [];
            const colorHue = pet.colorHue || 0;
            const frameId = pet.currentFrame || 'default_wood';
            const sceneInfo = this.resolvePetScene(pet);
            const titleCfg = this.getTitleConfig(pet.currentTitle);
            const titleHtml = titleCfg
                ? `<span class="title-badge ${titleCfg.style || 'cozy'}">${titleCfg.icon} ${titleCfg.name}</span>`
                : '';
            const rankHtml = student.rankInfo
                ? `<span class="rank-badge" style="background:${student.rankInfo.bg}; color:${student.rankInfo.color};">${student.rankInfo.icon} ${student.rankInfo.name}</span>`
                : '';
            const ribbonsHtml = Array.isArray(student.honorBadges) && student.honorBadges.length > 0
                ? `<div class="honor-ribbons">${student.honorBadges.slice(0, 2).map(b => `<span class="honor-ribbon top-${b.rank}">${b.label}</span>`).join('')}</div>`
                : '';

            let fullnessColor = '#10b981';
            if (pet.fullness < 25) fullnessColor = '#ef4444';
            else if (pet.fullness < 60) fullnessColor = '#f59e0b';

            const lv = pet.level !== undefined && pet.level !== null ? Number(pet.level) : 1;
            html += `
                <div class="student-card frame-${frameId} ${isSelected ? 'selected' : ''} ${isFrozen ? 'frozen' : ''}"
                     id="student-card-${student.id}"
                     onclick="window.teacherApp.toggleSelectStudent(${student.id}, event)"
                     ondblclick="window.teacherApp.openSingleStudentModal(${student.id}, event)">
                    <div class="card-top">
                        <span class="card-no">${student.username}</span>
                        <span class="card-name" title="${student.displayName}">${student.displayName.replace(/^\d+号\s*/, '')}</span>
                        <span class="card-lvl">Lv.${lv}</span>
                    </div>

                    <div class="card-stage skin-${skinId}" id="pet-stage-${student.id}" style="background-image: url('${sceneInfo.bgUrl}');" title="${sceneInfo.sceneName}">
                        <div class="stage-shadow"></div>
                        <div class="pet-rig">
                            ${window.PetRenderer.renderSvg(skinId, accessories, colorHue, 74, { level: lv, isCracked: Boolean(pet.isCracked) })}
                        </div>
                    </div>

                    <div class="card-title-row" style="flex-direction:column; align-items:center; gap:3px;">
                        <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:3px;">${rankHtml}${titleHtml}</div>
                        ${ribbonsHtml}
                    </div>

                    <div class="card-bottom">
                        <div class="bar-wrap" title="饱腹度: ${pet.fullness || 80}%">
                            <div class="bar-fill" style="width: ${pet.fullness || 80}%; background: ${fullnessColor};"></div>
                        </div>
                        <div class="info-row">
                            <span class="card-coins">💰 ${pet.coins || 0}</span>
                            <span style="font-size:10px; cursor:pointer;" onclick="window.teacherApp.openSingleStudentModal(${student.id}, event); event.stopPropagation();">⚙️管理</span>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        this.updateSelectionBar();
    }

    updateStudentCardDom(student) {
        const card = document.getElementById(`student-card-${student.id}`);
        if (!card) return;

        const pet = student.pet || {};
        const lvlEl = card.querySelector('.card-lvl');
        if (lvlEl) lvlEl.textContent = `Lv.${pet.level || 1}`;

        const coinsEl = card.querySelector('.card-coins');
        if (coinsEl) coinsEl.textContent = `💰 ${pet.coins || 0}`;

        const barFill = card.querySelector('.bar-fill');
        if (barFill) {
            barFill.style.width = `${pet.fullness || 80}%`;
            if (pet.fullness < 25) barFill.style.background = '#ef4444';
            else if (pet.fullness < 60) barFill.style.background = '#f59e0b';
            else barFill.style.background = '#10b981';
        }
    }

    // ── 选择与打分 ──────────────────────────────────────────────
    toggleSelectStudent(id, event) {
        if (event) event.stopPropagation();
        if (this.selectedStudentIds.has(id)) {
            this.selectedStudentIds.delete(id);
        } else {
            this.selectedStudentIds.add(id);
        }

        const card = document.getElementById(`student-card-${id}`);
        if (card) {
            card.classList.toggle('selected', this.selectedStudentIds.has(id));
        }
        this.updateSelectionBar();
    }

    selectAllStudents() {
        this.students.forEach(s => this.selectedStudentIds.add(s.id));
        document.querySelectorAll('.student-card').forEach(c => c.classList.add('selected'));
        this.updateSelectionBar();
    }

    clearSelection() {
        this.selectedStudentIds.clear();
        document.querySelectorAll('.student-card').forEach(c => c.classList.remove('selected'));
        this.updateSelectionBar();
    }

    updateSelectionBar() {
        const bar = document.getElementById('floating-scoring-bar');
        const countEl = document.getElementById('selected-students-count');
        const count = this.selectedStudentIds.size;

        if (count > 0) {
            bar.classList.add('active');
            countEl.textContent = `已选 ${count} 人`;
        } else {
            bar.classList.remove('active');
        }
    }

    async applyBatchScore(coinsDelta, fullnessDelta, reason) {
        const ids = Array.from(this.selectedStudentIds);
        if (ids.length === 0) return;

        try {
            const res = await fetch('/api/teacher/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentIds: ids,
                    coinsDelta,
                    fullnessDelta,
                    reason
                })
            });
            const data = await res.json();
            if (data.success) {
                this.setTicker(`成功为 ${data.count} 名学生记录表现: ${reason} (${coinsDelta > 0 ? '+' : ''}${coinsDelta}币)`);
                this.clearSelection();
            }
        } catch (err) {
            console.error('[TeacherApp] 打分失败:', err);
        }
    }

    // ── 模式切换 ──────────────────────────────────────────────
    async switchMode(mode, durationSeconds = 0) {
        try {
            const res = await fetch('/api/teacher/mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode, durationSeconds })
            });
            const data = await res.json();
            if (data.success) {
                this.permissions = data.permissions;
                this.updateHeaderState();
            }
        } catch (err) {
            console.error('[TeacherApp] 切换模式失败:', err);
        }
    }

    startCountdown(seconds) {
        this.stopCountdown();
        this.remainingSeconds = seconds;
        const el = document.getElementById('mode-countdown-timer');
        if (!el) return;

        el.style.display = 'inline-block';
        const updateText = () => {
            const m = Math.floor(this.remainingSeconds / 60);
            const s = this.remainingSeconds % 60;
            el.textContent = `⏳ ${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        };
        updateText();

        this.countdownTimer = setInterval(() => {
            this.remainingSeconds--;
            if (this.remainingSeconds <= 0) {
                this.stopCountdown();
                this.permissions.currentMode = 'class';
                this.updateHeaderState();
            } else {
                updateText();
            }
        }, 1000);
    }

    stopCountdown() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
        const el = document.getElementById('mode-countdown-timer');
        if (el) el.style.display = 'none';
    }

    // ── 装扮审核 ──────────────────────────────────────────────
    updatePendingOutfitsBadge(count) {
        const badge = document.getElementById('pending-outfits-badge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }

    async openOutfitReviewModal() {
        this.openModal('modal-outfit-review');
        const container = document.getElementById('outfit-review-list');
        container.innerHTML = '<div style="text-align:center; padding:20px;">加载待审装扮中...</div>';

        try {
            const res = await fetch('/api/teacher/outfits/pending');
            const data = await res.json();
            const outfits = data.outfits || [];

            this.updatePendingOutfitsBadge(outfits.length);

            if (outfits.length === 0) {
                container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:30px;">暂无待审核装扮作品</div>';
                return;
            }

            let html = '';
            outfits.forEach(o => {
                const comp = o.components || {};
                const aiResult = o.aiReviewResult || {};
                html += `
                    <div class="outfit-review-item" id="review-item-${o.id}">
                        <div class="outfit-preview-box">
                            ${window.PetRenderer.renderSvg(comp.skinId, comp.accessories, comp.colorHue, 90)}
                        </div>
                        <div class="outfit-detail-box">
                            <div style="font-weight:800; font-size:15px; color:var(--text-main);">${o.name}</div>
                            <div style="font-size:12px; color:var(--text-muted);">
                                作者: <strong>${o.authorName}</strong> (${o.authorUsername}) · 提交时间: ${new Date(o.publishedAt).toLocaleTimeString()}
                            </div>
                            <div class="ai-badge">
                                🤖 AI预审: ${aiResult.reason || '合规'} (${aiResult.score || 90}分)
                            </div>
                            <div style="display:flex; gap:8px; margin-top:8px;">
                                <button class="score-btn btn-plus" onclick="window.teacherApp.submitOutfitReview('${o.id}', 'approve')">
                                    ✓ 批准上架
                                </button>
                                <button class="score-btn btn-minus" onclick="window.teacherApp.submitOutfitReview('${o.id}', 'reject')">
                                    ✗ 退回修改
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<div style="color:var(--danger); text-align:center;">加载失败</div>';
        }
    }

    async submitOutfitReview(outfitId, action) {
        try {
            const res = await fetch('/api/teacher/outfits/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ outfitId, action })
            });
            const data = await res.json();
            if (data.success) {
                const item = document.getElementById(`review-item-${outfitId}`);
                if (item) item.remove();
                this.openOutfitReviewModal();
            }
        } catch (e) {
            console.error('审核处理失败', e);
        }
    }

    // ── 随机点名 ──────────────────────────────────────────────
    openRandomPicker() {
        this.openModal('modal-random-picker');
        this.startRandomRoll();
    }

    renderRandomStage(student, size = 135, isFinal = false) {
        const nameEl = document.getElementById('random-student-name');
        const titleEl = document.getElementById('random-student-title');
        const petStage = document.getElementById('random-pet-stage');
        const pet = student.pet || {};
        const sceneInfo = this.resolvePetScene(pet);
        const frameId = pet.currentFrame || 'default_wood';
        const titleCfg = this.getTitleConfig(pet.currentTitle);

        if (nameEl) {
            nameEl.textContent = isFinal ? `🎯 ${student.displayName}` : student.displayName;
        }
        if (titleEl) {
            const rankHtml = student.rankInfo
                ? `<span class="rank-badge" style="background:${student.rankInfo.bg}; color:${student.rankInfo.color}; font-size:12px; padding:3px 10px;">${student.rankInfo.icon} ${student.rankInfo.name}</span>`
                : '';
            const titleHtml = titleCfg
                ? `<span class="title-badge ${titleCfg.style || 'cozy'}" style="font-size:12px; padding:3px 12px;">${titleCfg.icon} ${titleCfg.name}</span>`
                : '';
            const ribbonsHtml = Array.isArray(student.honorBadges) && student.honorBadges.length > 0
                ? `<div class="honor-ribbons" style="margin-top:4px;">${student.honorBadges.map(b => `<span class="honor-ribbon top-${b.rank}">${b.label}</span>`).join('')}</div>`
                : '';
            titleEl.innerHTML = `<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:6px;">${rankHtml}${titleHtml}</div>${ribbonsHtml}`;
        }
        if (petStage) {
            petStage.className = `random-pet-box frame-${frameId}`;
            petStage.style.backgroundImage = `url('${sceneInfo.bgUrl}')`;
            petStage.innerHTML = window.PetRenderer.renderSvg(
                pet.currentSkin || 'default_cat',
                pet.accessories || [],
                pet.colorHue || 0,
                size,
                { level: pet.level || 1, isCracked: Boolean(pet.isCracked) }
            );
        }
    }

    startRandomRoll() {
        const activeList = this.students.filter(s => s.status === 'active');
        if (activeList.length === 0) return;

        let rolls = 0;
        const interval = setInterval(() => {
            const temp = activeList[Math.floor(Math.random() * activeList.length)];
            this.renderRandomStage(temp, 128, false);
            rolls++;
            if (rolls > 15) {
                clearInterval(interval);
                this.pickFinalRandomStudent();
            }
        }, 100);
    }

    async pickFinalRandomStudent() {
        try {
            const res = await fetch('/api/teacher/random-pick', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                this.randomSelectedStudent = data.student;
                this.renderRandomStage(data.student, 138, true);
            }
        } catch (e) {
            console.error('随机抽取失败', e);
        }
    }

    async rewardRandomPick(coins = 2) {
        if (!this.randomSelectedStudent) return;
        await this.applySingleScore(this.randomSelectedStudent.id, coins, 5, '随机提问精彩作答');
        this.closeModal('modal-random-picker');
    }

    async applySingleScore(studentId, coinsDelta, fullnessDelta, reason) {
        try {
            await fetch('/api/teacher/score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentIds: [studentId],
                    coinsDelta,
                    fullnessDelta,
                    reason
                })
            });
        } catch (e) {
            console.error('打分失败', e);
        }
    }

    // ── 单个学生操作 ──────────────────────────────────────────
    openSingleStudentModal(id, event) {
        if (event) event.stopPropagation();
        const student = this.students.find(s => s.id === id);
        if (!student) return;

        this.currentActiveStudent = student;
        const lv = student.pet?.level !== undefined && student.pet?.level !== null ? Number(student.pet.level) : 1;
        document.getElementById('single-student-title').textContent = `${student.displayName} 管理操作`;
        document.getElementById('single-student-name').textContent = student.displayName;
        document.getElementById('single-student-info').textContent = `账号: ${student.username} · 等级: Lv.${lv}`;
        document.getElementById('single-student-coins').textContent = `💰 ${student.pet?.coins || 0} 课堂币 · 饱腹度: ${student.pet?.fullness || 80}%`;
        document.getElementById('input-edit-name').value = student.displayName;

        const switchSelect = document.getElementById('select-switch-pet');
        if (switchSelect) {
            const catalog = window.SKINS_CATALOG || [];
            switchSelect.innerHTML = catalog.map(s => `<option value="${s.id}">${s.icon || '🐾'} ${s.name}</option>`).join('');
            switchSelect.value = student.pet?.currentSkin || 'default_cat';
        }

        const petStage = document.getElementById('single-student-pet');
        petStage.innerHTML = window.PetRenderer.renderSvg(student.pet?.currentSkin, [], student.pet?.colorHue, 100, { level: lv, isCracked: Boolean(student.pet?.isCracked) });

        const freezeBtn = document.getElementById('btn-toggle-freeze');
        freezeBtn.textContent = student.status === 'frozen' ? '▶️ 恢复账号' : '⏸️ 暂停账号';

        this.openModal('modal-single-student');
    }

    async saveStudentName() {
        if (!this.currentActiveStudent) return;
        const newName = document.getElementById('input-edit-name').value;
        try {
            const res = await fetch('/api/teacher/student/update-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: this.currentActiveStudent.id, displayName: newName })
            });
            const data = await res.json();
            if (data.success) {
                this.currentActiveStudent.displayName = data.student.displayName;
                this.closeModal('modal-single-student');
                this.renderGrid();
            }
        } catch (e) {
            console.error('修改姓名失败', e);
        }
    }

    async switchStudentPet() {
        if (!this.currentActiveStudent) return;
        const switchSelect = document.getElementById('select-switch-pet');
        const skinId = switchSelect ? switchSelect.value : '';
        if (!skinId) return;
        try {
            const res = await fetch('/api/teacher/student/switch-pet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: this.currentActiveStudent.id, skinId })
            });
            const data = await res.json();
            if (data.success) {
                const idx = this.students.findIndex(s => s.id === this.currentActiveStudent.id);
                if (idx !== -1) this.students[idx] = data.student;
                this.currentActiveStudent = data.student;
                this.renderGrid();
                this.openSingleStudentModal(data.student.id);
            } else {
                alert(data.message || '更换宠物失败');
            }
        } catch (e) {
            console.error('更换宠物失败', e);
        }
    }

    async resetPassword() {
        if (!this.currentActiveStudent) return;
        try {
            const res = await fetch('/api/teacher/student/reset-pwd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: this.currentActiveStudent.id, newPassword: '123' })
            });
            const data = await res.json();
            if (data.success) {
                alert(`已将密码重置为 123`);
            }
        } catch (e) {
            console.error('重置密码失败', e);
        }
    }

    async toggleFreeze() {
        if (!this.currentActiveStudent) return;
        try {
            const res = await fetch('/api/teacher/student/toggle-freeze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: this.currentActiveStudent.id })
            });
            const data = await res.json();
            if (data.success) {
                this.currentActiveStudent.status = data.status;
                this.closeModal('modal-single-student');
                this.renderGrid();
            }
        } catch (e) {
            console.error('冻结状态变更失败', e);
        }
    }

    // ── 名单导入 ──────────────────────────────────────────────
    openRosterModal() {
        this.openModal('modal-roster');
    }

    async submitRosterImport() {
        const text = document.getElementById('textarea-roster').value;
        const resetAll = document.getElementById('checkbox-reset-all').checked;

        if (!text.trim()) {
            alert('请在文本框中粘贴学生姓名');
            return;
        }

        try {
            const res = await fetch('/api/teacher/batch-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rosterText: text, resetAll })
            });
            const data = await res.json();
            if (data.success) {
                alert(`名单导入成功，班级现有 ${data.total} 名学生！`);
                this.closeModal('modal-roster');
                await this.fetchData();
                this.renderGrid();
            }
        } catch (e) {
            console.error('导入失败', e);
        }
    }

    // ── 日志查看 ──────────────────────────────────────────────
    async openLogsModal() {
        this.openModal('modal-logs');
        const container = document.getElementById('logs-container');
        container.innerHTML = '<div>正在读取审计流水...</div>';

        try {
            const res = await fetch('/api/teacher/logs?limit=80');
            const data = await res.json();
            const logs = data.logs || [];

            if (logs.length === 0) {
                container.innerHTML = '<div style="color:var(--text-muted); text-align:center;">暂无日志记录</div>';
                return;
            }

            let html = '';
            logs.forEach(l => {
                const safeTime = this.escapeHtml(l.time);
                const safeDetail = this.escapeHtml(l.detail);
                const safeOperator = this.escapeHtml(l.operator || '系统');
                html += `
                    <div style="background:#FFFFFF; border:1.5px solid var(--border-card); padding:9px 14px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="color:#D97706; font-weight:800; margin-right:8px;">[${safeTime}]</span>
                            <span style="font-weight:600;">${safeDetail}</span>
                        </div>
                        <span style="font-size:11px; font-weight:700; color:var(--text-muted);">${safeOperator}</span>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<div style="color:var(--danger);">读取失败</div>';
        }
    }

    // ── 系统设置 ──────────────────────────────────────────────
    openSettingsModal() {
        document.getElementById('settings-class-name').value = this.config.className || '七年级(1)班';
        const adoptSelect = document.getElementById('settings-adoption-mode');
        if (adoptSelect) adoptSelect.value = this.config.adoptionMode || 'choose';
        this.openModal('modal-settings');
    }

    async saveSettings() {
        const className = document.getElementById('settings-class-name').value;
        const newTeacherPassword = document.getElementById('settings-teacher-pwd').value;
        const adoptSelect = document.getElementById('settings-adoption-mode');
        const adoptionMode = adoptSelect ? adoptSelect.value : 'choose';

        try {
            const res = await fetch('/api/teacher/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    className,
                    adoptionMode,
                    newTeacherPassword: newTeacherPassword || undefined
                })
            });
            const data = await res.json();
            if (data.success) {
                this.config = data.config;
                this.updateHeaderState();
                this.closeModal('modal-settings');
                alert('设置保存成功');
            }
        } catch (e) {
            console.error('保存设置失败', e);
        }
    }

    // ── 数据备份导出 ──────────────────────────────────────────
    exportData() {
        const link = document.createElement('a');
        link.href = '/api/teacher/export';
        link.download = `xiwo_pet_backup_${Date.now()}.json`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // ── 弹窗控制 ──────────────────────────────────────────────
    openModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }

    closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async giveClassBonus(coins = 10) {
        if (!confirm(`确定为全班活跃学生发放「+${coins} 课堂币」的基础专注奖励吗？`)) return;
        try {
            const res = await fetch('/api/teacher/class-bonus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coins, reason: '全班守纪与专注基础奖励' })
            });
            const data = await res.json();
            if (data.success) {
                this.setTicker(`🌟 已为全班 ${data.count} 位同学发放基础奖励 +${data.coins}💰！`);
                await this.fetchStudents();
            } else {
                alert(data.message || '发放失败');
            }
        } catch (e) {
            console.error('全班基础分发放失败', e);
        }
    }

    openTeacherLeaderboard(boardId = null) {
        this.openModal('modal-teacher-leaderboard');
        this.loadTeacherLeaderboard(boardId || this.activeTeacherLbBoard || 'honor');
    }

    async loadTeacherLeaderboard(boardId = 'honor') {
        const tabsEl = document.getElementById('teacher-lb-tabs');
        const visEl = document.getElementById('teacher-lb-visibility-controls');
        const descEl = document.getElementById('teacher-lb-desc');
        const listEl = document.getElementById('teacher-lb-list');
        if (!listEl) return;

        listEl.innerHTML = '<div style="text-align:center; padding:26px; color:#64748b;">正在生成荣耀榜单...</div>';

        try {
            const res = await fetch(`/api/teacher/leaderboard?board=${encodeURIComponent(boardId)}`);
            const data = await res.json();
            if (!data.success) return;

            const activeId = data.board?.id || 'honor';
            this.activeTeacherLbBoard = activeId;
            this.teacherVisibleBoards = Array.isArray(data.visibleBoards) ? data.visibleBoards : ['honor', 'darkhorse', 'collection', 'popularity'];

            const allTypes = window.LEADERBOARD_TYPES || [];
            if (tabsEl) {
                tabsEl.innerHTML = allTypes.map(t =>
                    `<button class="lb-tab-btn ${t.id === activeId ? 'active' : ''}" onclick="window.teacherApp.loadTeacherLeaderboard('${t.id}')">${t.icon} ${t.name}</button>`
                ).join('');
            }

            if (visEl) {
                visEl.innerHTML = allTypes.map(t => {
                    const checked = this.teacherVisibleBoards.includes(t.id) ? 'checked' : '';
                    return `
                        <label style="display:inline-flex; align-items:center; gap:4px; cursor:pointer; font-weight:700; color:#1E293B;">
                            <input type="checkbox" ${checked} onchange="window.teacherApp.toggleBoardVisibility('${t.id}', this.checked)">
                            ${t.icon} ${t.name}
                        </label>
                    `;
                }).join('');
            }

            if (descEl && data.board) {
                const extra = data.gradeInfo
                    ? `<span>同年级共 ${data.gradeInfo.classCount} 个班参与排行</span>`
                    : (activeId === 'darkhorse' ? `<span>当前冲刺周期：${data.currentPeriodKey}</span>` : '');
                descEl.innerHTML = `<span>${data.board.icon} ${data.board.desc}（展示前 10 名）</span>${extra}`;
            }

            const topList = Array.isArray(data.topList) ? data.topList : [];
            if (topList.length === 0) {
                listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;">暂无上榜数据</div>';
                return;
            }

            listEl.innerHTML = topList.map(row => {
                const pet = row.pet || {};
                const scene = this.resolvePetScene(pet);
                const frameId = pet.currentFrame || 'default_wood';
                const titleCfg = (window.TITLES_CATALOG || []).find(t => t.id === pet.currentTitle);
                const titleHtml = titleCfg
                    ? `<span class="title-badge ${titleCfg.style || 'cozy'}">${titleCfg.icon} ${titleCfg.name}</span>`
                    : '';
                const rankHtml = row.rankInfo
                    ? `<span class="rank-badge" style="background:${row.rankInfo.bg}; color:${row.rankInfo.color};">${row.rankInfo.icon} ${row.rankInfo.name}</span>`
                    : '';
                const ribbonsHtml = Array.isArray(row.honorBadges) && row.honorBadges.length > 0
                    ? row.honorBadges.slice(0, 2).map(b => `<span class="honor-ribbon top-${b.rank}">${b.label}</span>`).join('')
                    : '';
                const classTag = row.className ? `<span style="font-size:11px; color:#64748B;">[${row.className}]</span>` : '';
                const topClass = row.rank <= 3 ? `lb-top-${row.rank}` : '';

                return `
                    <div class="lb-row frame-${frameId} ${topClass}">
                        <div class="lb-rank-num">${row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank}</div>
                        <div class="lb-avatar-mini" style="background-image: url('${scene.bgUrl}');">
                            ${window.PetRenderer.renderSvg(pet.currentSkin, pet.accessories, pet.colorHue, 40, { level: pet.level || 1 })}
                        </div>
                        <div class="lb-info">
                            <div class="lb-name-line">
                                <span class="card-name" style="max-width:none;">${row.displayName}</span>
                                ${classTag}
                                ${rankHtml}
                                ${titleHtml}
                            </div>
                            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                                <span class="card-no" style="font-size:11px;">Lv.${pet.level || 0}</span>
                                ${ribbonsHtml}
                            </div>
                        </div>
                        <div class="lb-score-val">${row.score}<div style="font-size:10px; font-weight:700; opacity:0.8;">${data.board?.unit || '分'}</div></div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('加载教师排行榜失败', e);
            listEl.innerHTML = '<div style="text-align:center; padding:26px; color:#DC2626;">加载排行榜失败</div>';
        }
    }

    async toggleBoardVisibility(boardId, checked) {
        const current = new Set(this.teacherVisibleBoards || []);
        if (checked) current.add(boardId);
        else current.delete(boardId);
        const nextList = Array.from(current);

        try {
            const res = await fetch('/api/teacher/leaderboard/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visibleBoards: nextList })
            });
            const data = await res.json();
            if (data.success) {
                this.teacherVisibleBoards = data.visibleBoards;
                this.setTicker(`已更新学生端可见榜单（共 ${data.visibleBoards.length} 个开放）`);
            }
        } catch (e) {
            console.error('更新榜单可见配置失败', e);
        }
    }

    async resetDarkhorseBoard() {
        if (!confirm('确定立即重置「黑马进步榜」吗？重置后将从现在起重新统计本节课/本轮新增积分！')) return;
        try {
            const res = await fetch('/api/teacher/leaderboard/reset-darkhorse', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                this.setTicker('🔄 已开启新一轮「黑马进步榜」冲刺！');
                await this.fetchStudents();
                this.loadTeacherLeaderboard('darkhorse');
            }
        } catch (e) {
            console.error('重置黑马榜失败', e);
        }
    }

    bindShortcuts() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
                this.clearSelection();
            }
        });
    }
}

window.teacherApp = new TeacherApp();
