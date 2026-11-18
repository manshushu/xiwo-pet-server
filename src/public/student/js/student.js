// 学生端核心控制逻辑 v2.0 (支持庭院漫步、多品类美食抛投、五官捏脸、部位互斥换装与串门社交)
class StudentApp {
    constructor() {
        this.student = null;
        this.permissions = {};
        this.config = { className: '班级', adoptionMode: 'choose' };
        this.classmates = [];
        this.ws = null;

        // 装扮与捏脸工坊临时状态
        this.editorTemp = {
            accessories: [],
            colorHue: 0,
            skinId: 'default_cat',
            activeTab: 'face'
        };

        // 庭院内宠物漫步坐标与定时器
        this.petPos = { x: 52, y: 68 };
        this.walkTimeout = null;
        this.roamInterval = null;

        // 串门状态
        this.visitingHost = null;

        // 装扮保存与 Mind+ 导出状态
        this.hasSavedOutfit = false;
        this.lastOutfitName = '';

        this.countdownTimer = null;
        this.actionCooldownUntil = 0;
        this.actionCooldownTimer = null;
        this.remainingSeconds = null;

        this.init();
    }

    async init() {
        await this.checkAuth();
        this.initWebSocket();
        this.bindEvents();
        this.startAutonomousRoaming();
    }

    // ── 会话检查与个人档案拉取 ────────────────────────────────
    async checkAuth() {
        try {
            const res = await fetch('/api/auth/current');
            const data = await res.json();
            if (!data.loggedIn || data.role !== 'student') {
                window.location.replace('/student/login.html');
                return;
            }
            this.student = data.student;
            await this.fetchMe();
        } catch (err) {
            window.location.replace('/student/login.html');
        }
    }

    async fetchMe() {
        try {
            const res = await fetch('/api/student/me');
            const data = await res.json();
            if (data.success) {
                this.student = data.student;
                this.permissions = data.permissions || {};
                if (data.config) this.config = data.config;
                this.updateUi();
            }
        } catch (e) {
            console.error('获取个人档案失败', e);
        }
    }

    getSkinConfig(skinId) {
        return (window.SKINS_CATALOG || []).find(s => s.id === skinId) || window.SKINS_CATALOG[0];
    }

    getSkinStageName(skinCfg, level = 1) {
        if (skinCfg && Array.isArray(skinCfg.stages) && skinCfg.stages.length >= 3) {
            const idx = level >= 7 ? 2 : (level >= 4 ? 1 : 0);
            return skinCfg.stages[idx] || skinCfg.name;
        }
        return skinCfg ? skinCfg.name : '伙伴';
    }

    getEvoStageLabel(level = 1) {
        const lv = Number(level);
        if (lv <= 0) return '待孵化蛋 🥚';
        if (lv >= 10) return '满级神话 👑';
        if (lv >= 7) return '觉醒期 ✨';
        if (lv >= 4) return '成长期 🌟';
        return '幼年期 🌱';
    }

    // ── 界面与庭院状态渲染 ────────────────────────────────────
    updateUi() {
        if (!this.student) return;

        const pet = this.student.pet || {};
        const level = pet.level !== undefined && pet.level !== null ? Number(pet.level) : 1;
        const currentSkinCfg = this.getSkinConfig(pet.currentSkin || 'default_cat');
        const stageName = level <= 0 ? '神秘宠物蛋' : this.getSkinStageName(currentSkinCfg, level);

        // 顶部个人信息与物种图标
        document.getElementById('user-display-name').textContent = this.student.displayName;
        document.getElementById('user-sub-info').textContent = `学号: ${this.student.username} · ${stageName} (${currentSkinCfg.sceneName})`;
        const navIcon = document.getElementById('nav-species-icon');
        if (navIcon) navIcon.textContent = level <= 0 ? '🥚' : (currentSkinCfg.icon || '🐾');

        // 课堂币、等级与进化阶段
        document.getElementById('stat-coins').textContent = pet.coins || 0;
        document.getElementById('stat-level').textContent = `Lv.${level}`;
        const evoTag = document.getElementById('stat-evo-tag');
        if (evoTag) evoTag.textContent = this.getEvoStageLabel(level);

        const nextRoundBtn = document.getElementById('btn-action-next-round');
        if (nextRoundBtn) {
            nextRoundBtn.style.display = level >= 10 ? 'inline-flex' : 'none';
        }

        // 饱腹度
        const fullness = pet.fullness ?? 80;
        document.getElementById('stat-fullness-text').textContent = `${fullness}%`;
        const fillBar = document.getElementById('stat-fullness-fill');
        fillBar.style.width = `${fullness}%`;
        if (fullness < 25) fillBar.style.background = '#EF4444';
        else if (fullness < 60) fillBar.style.background = '#F59E0B';
        else fillBar.style.background = 'linear-gradient(90deg, #34D399, #10B981)';

        // 渲染庭院场景与宠物实体（区分自家模式 vs 串门模式）
        if (this.visitingHost) {
            this.renderVisitCourtyard();
        } else {
            this.renderOwnCourtyard();
        }

        // 更新课堂模式提示与按键锁
        this.updateModeBanner();

        // 首次进入尚未领养三系初始伙伴时，弹出领养仪式弹窗
        if (pet.hasChosenStarter !== true) {
            this.openStarterAdoptModal();
        }
    }

    renderOwnCourtyard() {
        const pet = this.student.pet || {};
        const level = pet.level !== undefined && pet.level !== null ? Number(pet.level) : 1;
        const skinCfg = this.getSkinConfig(pet.currentSkin || 'default_cat');
        const stageName = level <= 0 ? '神秘宠物蛋' : this.getSkinStageName(skinCfg, level);

        // 切换专属庭院背景图
        const bgEl = document.getElementById('courtyard-bg');
        if (bgEl && skinCfg.sceneBg) {
            bgEl.style.backgroundImage = `url('${skinCfg.sceneBg}')`;
        }

        const sceneTitle = document.getElementById('courtyard-scene-title');
        if (sceneTitle) sceneTitle.textContent = `${skinCfg.sceneName} · ${stageName}`;

        document.getElementById('visit-banner-bar').style.display = 'none';
        document.getElementById('quick-pet-actions').style.display = 'flex';
        document.getElementById('visitor-pet-wrap').style.display = 'none';

        const rig = document.getElementById('pet-hero-rig');
        if (rig) {
            rig.innerHTML = window.PetRenderer.renderSvg(
                pet.currentSkin || 'default_cat',
                [],
                pet.colorHue || 0,
                175,
                { level, isCracked: Boolean(pet.isCracked) }
            );
            rig.classList.toggle('pet-max-mythic', level >= 10);
        }
    }

    renderVisitCourtyard() {
        if (!this.visitingHost) return;
        const hostPet = this.visitingHost.pet || {};
        const myPet = this.student.pet || {};
        const hostSkinCfg = this.getSkinConfig(hostPet.currentSkin || 'default_cat');

        // 庭院切换为被拜访同学的物种主题场景
        const bgEl = document.getElementById('courtyard-bg');
        if (bgEl && hostSkinCfg.sceneBg) {
            bgEl.style.backgroundImage = `url('${hostSkinCfg.sceneBg}')`;
        }

        const sceneTitle = document.getElementById('courtyard-scene-title');
        if (sceneTitle) sceneTitle.textContent = `${this.visitingHost.displayName} 的 ${hostSkinCfg.sceneName}`;

        document.getElementById('visit-banner-bar').style.display = 'flex';
        document.getElementById('visit-host-label').textContent = `🏡 串门中：${this.visitingHost.displayName}`;
        document.getElementById('quick-pet-actions').style.display = 'none';

        // 渲染主人宠物 (右侧)
        const hostWrap = document.getElementById('pet-hero-wrap');
        hostWrap.style.left = '64%';
        hostWrap.style.top = '68%';
        const hostRig = document.getElementById('pet-hero-rig');
        hostRig.innerHTML = window.PetRenderer.renderSvg(
            hostPet.currentSkin || 'default_cat',
            hostPet.accessories || [],
            hostPet.colorHue || 0,
            175,
            { level: hostPet.level || 1 }
        );
        this.setDialogue(`欢迎来我家小窝做客呀！✨`);

        // 渲染我方随行宠物 (左侧)
        const visitorWrap = document.getElementById('visitor-pet-wrap');
        visitorWrap.style.display = 'flex';
        visitorWrap.style.left = '34%';
        visitorWrap.style.top = '71%';
        const visitorRig = document.getElementById('visitor-pet-rig');
        visitorRig.innerHTML = window.PetRenderer.renderSvg(
            myPet.currentSkin || 'default_cat',
            myPet.accessories || [],
            myPet.colorHue || 0,
            155,
            { level: myPet.level || 1 }
        );
    }

    // ── 庭院内自主漫步与点击地面走动引擎 ───────────────────────
    handleCourtyardGroundClick(event) {
        if (this.visitingHost) return;
        const mode = this.permissions.currentMode || 'class';
        if (mode === 'dismissed') return;

        const frame = document.getElementById('courtyard-frame');
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        const clickX = ((event.clientX - rect.left) / rect.width) * 100;
        const clickY = ((event.clientY - rect.top) / rect.height) * 100;

        // 限制在前景草坪/露台可行走区域内 (X: 16%~84%, Y: 54%~82%)
        const targetX = Math.max(16, Math.min(84, clickX));
        const targetY = Math.max(54, Math.min(82, clickY));

        // 生成点击波纹
        const ripple = document.createElement('div');
        ripple.className = 'courtyard-ripple';
        ripple.style.left = `${targetX}%`;
        ripple.style.top = `${targetY}%`;
        frame.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);

        this.walkPetTo(targetX, targetY);

        const stepLines = [
            '哒哒哒~ 我走过来啦！🐾',
            '这片草坪真舒服呀~ ✨',
            '主人叫我有什么好事吗？🌟',
            '散步时间到咯~ 🎵'
        ];
        this.setDialogue(stepLines[Math.floor(Math.random() * stepLines.length)]);
    }

    walkPetTo(targetX, targetY, customDuration = null) {
        const wrap = document.getElementById('pet-hero-wrap');
        const flipBox = document.getElementById('pet-flip-box');
        if (!wrap || !flipBox) return;

        const dx = targetX - this.petPos.x;
        const dy = targetY - this.petPos.y;
        const dist = Math.hypot(dx, dy);

        // 根据移动方向翻转朝向
        if (Math.abs(dx) > 1.5) {
            flipBox.style.transform = dx < 0 ? 'scaleX(-1)' : 'scaleX(1)';
        }

        const durationMs = customDuration || Math.max(450, Math.min(1800, Math.round(dist * 26)));
        wrap.style.transition = `left ${durationMs}ms linear, top ${durationMs}ms linear`;
        wrap.classList.remove('is-sleeping');
        wrap.classList.add('is-walking');

        this.petPos = { x: targetX, y: targetY };
        wrap.style.left = `${targetX}%`;
        wrap.style.top = `${targetY}%`;

        if (this.walkTimeout) clearTimeout(this.walkTimeout);
        this.walkTimeout = setTimeout(() => {
            wrap.classList.remove('is-walking');
        }, durationMs);
    }

    startAutonomousRoaming() {
        if (this.roamInterval) clearInterval(this.roamInterval);
        this.roamInterval = setInterval(() => {
            if (this.visitingHost) return;
            // 若有弹窗打开则暂停后台漫步
            if (document.querySelector('.modal-overlay.active')) return;

            const mode = this.permissions.currentMode || 'class';
            const wrap = document.getElementById('pet-hero-wrap');
            if (!wrap) return;

            if (mode === 'dismissed') {
                wrap.classList.add('is-sleeping');
                return;
            }
            wrap.classList.remove('is-sleeping');

            // 上课模式下小幅度安静漫步，课间/互动模式下欢快走动
            const randX = mode === 'class'
                ? 42 + Math.random() * 18
                : 20 + Math.random() * 60;
            const randY = 58 + Math.random() * 20;

            this.walkPetTo(randX, randY);
        }, 5500);
    }

    triggerPetJump(event) {
        if (event) event.stopPropagation();
        const wrap = document.getElementById('pet-hero-wrap');
        if (!wrap) return;
        wrap.classList.remove('is-jumping');
        void wrap.offsetWidth;
        wrap.classList.add('is-jumping');
        setTimeout(() => wrap.classList.remove('is-jumping'), 900);
        this.triggerBubble('好耶！跳得高高的~ 🤸✨');
        this.playAudioPurr();
    }

    // ── 课堂模式横幅与按键控制 ────────────────────────────────
    updateModeBanner() {
        const mode = this.permissions.currentMode || 'class';
        const banner = document.getElementById('mode-banner');
        const icon = document.getElementById('mode-banner-icon');
        const text = document.getElementById('mode-banner-text');
        const wrap = document.getElementById('pet-hero-wrap');

        banner.className = 'mode-banner';

        const btnTouch = document.getElementById('btn-action-touch');
        const btnFeed = document.getElementById('btn-action-feed');
        const btnCloset = document.getElementById('btn-action-closet');
        const btnEditor = document.getElementById('btn-action-editor');
        const btnPlaza = document.getElementById('btn-action-plaza');
        const btnExport = document.getElementById('btn-action-export');

        if (mode === 'class') {
            banner.classList.add('mode-class');
            icon.textContent = '📚';
            text.textContent = '上课专注模式进行中：宠物正在乖巧伴读，积极回答问题可赢取课堂币！';
            if (btnTouch) btnTouch.disabled = true;
            if (btnFeed) btnFeed.disabled = true;
            if (btnCloset) btnCloset.disabled = true;
            if (btnEditor) btnEditor.disabled = true;
            if (btnPlaza) btnPlaza.disabled = true;
            if (btnExport) {
                btnExport.disabled = true;
                btnExport.style.display = 'none';
            }
            if (!this.visitingHost) this.setDialogue('嘘~ 上课认真听讲，记好笔记哦！📘');
        } else if (mode === 'break') {
            banner.classList.add('mode-interactive');
            icon.textContent = '☕';
            text.textContent = '课间休息时间：快来庭院遛宠、去美食工坊投喂零食，或者去同学家串门吧！';
            if (btnTouch) btnTouch.disabled = false;
            if (btnFeed) btnFeed.disabled = false;
            if (btnCloset) btnCloset.disabled = false;
            if (btnEditor) btnEditor.disabled = true;
            if (btnPlaza) btnPlaza.disabled = false;
            if (btnExport) {
                btnExport.disabled = true;
                btnExport.style.display = 'none';
            }
            if (!this.visitingHost) this.setDialogue('下课休息啦！点击草坪带我散步吧~ 🐾');
        } else if (mode === 'interactive') {
            banner.classList.add('mode-interactive');
            icon.textContent = '🎮';
            text.textContent = '自由互动时间开放！美食工坊、物种图鉴、邻里串门与 Mind+ 角色导出已解锁！';
            if (btnTouch) btnTouch.disabled = false;
            if (btnFeed) btnFeed.disabled = false;
            if (btnCloset) btnCloset.disabled = false;
            if (btnEditor) btnEditor.disabled = true;
            if (btnPlaza) btnPlaza.disabled = false;
            if (btnExport) {
                btnExport.disabled = false;
                btnExport.style.display = 'inline-flex';
            }
            if (!this.visitingHost) this.setDialogue('主人，我想吃美食工坊里的好吃的！🍱');
        } else if (mode === 'outfit_create') {
            banner.classList.add('mode-outfit');
            icon.textContent = '🎨';
            text.textContent = '装扮与捏脸工坊开放中！定制造型并保存后，即可一键导出为 Mind+ 角色包！';
            if (btnTouch) btnTouch.disabled = false;
            if (btnFeed) btnFeed.disabled = false;
            if (btnCloset) btnCloset.disabled = false;
            if (btnEditor) btnEditor.disabled = false;
            if (btnPlaza) btnPlaza.disabled = false;
            if (btnExport) {
                btnExport.disabled = !this.hasSavedOutfit;
                btnExport.style.display = this.hasSavedOutfit ? 'inline-flex' : 'none';
            }
            if (!this.visitingHost) this.setDialogue('快打开「装扮与捏脸」给我换新造型吧！🎩');
        } else if (mode === 'dismissed') {
            banner.classList.add('mode-class');
            icon.textContent = '🔔';
            text.textContent = '今日课程圆满结束，宠物正在庭院打盹休眠，请整理好桌面有序离开。';
            if (btnTouch) btnTouch.disabled = true;
            if (btnFeed) btnFeed.disabled = true;
            if (btnCloset) btnCloset.disabled = true;
            if (btnEditor) btnEditor.disabled = true;
            if (btnPlaza) btnPlaza.disabled = false;
            if (btnExport) {
                btnExport.disabled = true;
                btnExport.style.display = 'none';
            }
            if (wrap) wrap.classList.add('is-sleeping');
            if (!this.visitingHost) this.setDialogue('呼噜呼噜... 明天课堂再见咯~ 💤');
        }

        if (this.permissions.modeEndTime && this.permissions.modeEndTime > Date.now()) {
            this.startCountdown(Math.floor((this.permissions.modeEndTime - Date.now()) / 1000));
        } else {
            this.stopCountdown();
        }

        if (Date.now() < this.actionCooldownUntil) {
            if (btnTouch) btnTouch.disabled = true;
            if (btnFeed) btnFeed.disabled = true;
        }
    }

    startCountdown(seconds) {
        this.stopCountdown();
        this.remainingSeconds = seconds;
        const el = document.getElementById('mode-banner-timer');
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
        const el = document.getElementById('mode-banner-timer');
        if (el) el.style.display = 'none';
    }

    setDialogue(text) {
        const d = document.getElementById('pet-dialogue');
        if (d) d.textContent = text;
    }

    // ── WebSocket 实时联动 ────────────────────────────────────
    initWebSocket() {
        if (!this.student) return;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/ws?role=student&studentId=${this.student.id}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleWsMessage(msg);
            } catch (e) {
                console.error('WS解析异常', e);
            }
        };

        this.ws.onclose = () => {
            setTimeout(() => this.initWebSocket(), 3000);
        };
    }

    handleWsMessage(msg) {
        const { type, data } = msg;

        if (type === 'mode_change') {
            this.permissions.currentMode = data.mode;
            this.permissions.modeEndTime = data.modeEndTime;
            if (data.mode === 'class' && this.visitingHost) {
                this.exitVisitMode();
            }
            this.updateModeBanner();
        }

        if (type === 'score_update') {
            if (data.studentId === this.student.id) {
                const oldLevel = this.student.pet.level !== undefined ? this.student.pet.level : 1;
                this.student.pet.coins = data.coins;
                this.student.pet.fullness = data.fullness;
                this.student.pet.level = data.level;
                if (data.deltaCoins > 0) this.student.pet.isCracked = false;
                this.updateUi();

                if (data.deltaCoins > 0) {
                    this.triggerBubble(`🎉 老师奖励 +${data.deltaCoins} 课堂币 (${data.reason})`);
                    this.triggerPetJump();
                    this.playAudioReward();
                }
                if (data.level > oldLevel) {
                    this.triggerBubble(`🌟 恭喜升级到 Lv.${data.level}！`);
                }
            }
        }

        if (type === 'pet_level_up') {
            if (data.studentId === this.student.id && (data.evolved || data.reachedMax)) {
                this.fetchMe().then(() => {
                    this.openEvolutionModal(data);
                });
            }
        }

        if (type === 'outfit_review_done') {
            if (data.status === 'approved') {
                alert(`🎉 恭喜！你的装扮作品「${data.outfitName}」已通过老师审核，现已上架班级广场！`);
            } else {
                alert(`⚠️ 你的装扮作品「${data.outfitName}」未获批准: ${data.reason || '需进一步调整'}`);
            }
        }

        if (type === 'received_praise') {
            const tip = data.customText || `🌟 收到 ${data.fromName} 的点赞！(+${data.rewardCoins || 2}币)`;
            this.triggerBubble(tip);
            this.playAudioReward();
            this.fetchMe();
        }

        if (type === 'force_logout') {
            alert('账号已被教师端暂停或下线');
            window.location.replace('/student/login.html');
        }
    }

    // ── 全局动作冷却（2 秒防连点） ───────────────────────────
    canTriggerAction() {
        const now = Date.now();
        if (now < this.actionCooldownUntil) {
            const waitSec = Math.max(1, Math.ceil((this.actionCooldownUntil - now) / 1000));
            this.triggerBubble(`⏳ 操作太快啦，请 ${waitSec} 秒后再试~`);
            return false;
        }
        return true;
    }

    startActionCooldown(ms = 2000) {
        this.actionCooldownUntil = Date.now() + ms;
        const selectors = ['#btn-action-touch', '#btn-action-feed', '.btn-visit-action', '.btn-mini-act'];
        document.querySelectorAll(selectors.join(',')).forEach(el => {
            el.disabled = true;
        });

        if (this.actionCooldownTimer) clearTimeout(this.actionCooldownTimer);
        this.actionCooldownTimer = setTimeout(() => {
            this.actionCooldownTimer = null;
            document.querySelectorAll('.btn-visit-action, .btn-mini-act').forEach(el => {
                el.disabled = false;
            });
            this.updateModeBanner();
        }, ms);
    }

    // ── 互动 1：多部位抚摸与撒娇 ──────────────────────────────
    async handlePetTouch(part = 'head', event = null) {
        if (event) event.stopPropagation();
        if (this.permissions.currentMode === 'class' || this.permissions.currentMode === 'dismissed') {
            this.triggerBubble('📚 上课专注时间，下课再摸我哟~');
            return;
        }
        if (!this.canTriggerAction()) return;
        this.startActionCooldown(2000);

        try {
            const res = await fetch('/api/student/touch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ part })
            });
            const data = await res.json();
            if (data.success) {
                const wrap = document.getElementById('pet-hero-wrap');
                wrap.classList.remove('is-purring', 'is-jumping');
                void wrap.offsetWidth;
                wrap.classList.add(part === 'belly' ? 'is-jumping' : 'is-purring');
                setTimeout(() => wrap.classList.remove('is-purring', 'is-jumping'), 1200);

                const bubbles = {
                    head: '呼噜呼噜~ 最喜欢主人摸摸头啦！❤️',
                    belly: '哈哈哈好痒呀~ 肚皮软乎乎！✨',
                    tail: '喵呜~ 精神百倍！🐾'
                };
                this.triggerBubble(bubbles[part] || bubbles.head);
                this.playAudioPurr();
            } else if (res.status === 429) {
                this.triggerBubble(data.message);
            } else {
                alert(data.message);
            }
        } catch (e) {
            console.error('抚摸交互失败', e);
        }
    }

    // ── 互动 2：多品类美食工坊与抛投动画 ──────────────────────
    openFoodShop() {
        if (this.permissions.currentMode !== 'interactive' && this.permissions.currentMode !== 'break') {
            alert('当前课堂模式未开放喂食功能，请等待课间或自由互动时间！');
            return;
        }

        const coinsEl = document.getElementById('food-modal-coins');
        if (coinsEl) coinsEl.textContent = this.student?.pet?.coins || 0;

        const container = document.getElementById('food-items-container');
        let html = '';
        (window.FOODS_CATALOG || []).forEach(food => {
            html += `
                <div class="food-card" onclick="window.studentApp.feedFoodItem('${food.id}')">
                    <div class="food-icon">${food.icon}</div>
                    <div class="food-name">${food.name}</div>
                    <div class="food-tags">
                        <span class="food-tag">+${food.fullnessBoost}% 🍖</span>
                        <span class="food-tag exp">+${food.expBoost} ⭐</span>
                    </div>
                    <button class="btn-dock food-btn" style="margin-top:6px; padding:6px 14px; font-size:12px;">
                        💰 ${food.cost}
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
        this.openModal('modal-food-shop');
    }

    async feedFoodItem(foodId) {
        if (!this.canTriggerAction()) return;
        this.startActionCooldown(2000);

        const foodCfg = (window.FOODS_CATALOG || []).find(f => f.id === foodId) || window.FOODS_CATALOG[0];
        this.closeModal('modal-food-shop');

        try {
            const res = await fetch('/api/student/feed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ foodId: foodCfg.id, foodName: foodCfg.name })
            });
            const data = await res.json();
            if (!data.success) {
                if (res.status === 429) {
                    this.triggerBubble(data.message);
                } else {
                    alert(data.message);
                }
                return;
            }

            // 触发食物抛物线飞向宠物当前庭院位置动画
            this.launchFoodProjectile(foodCfg.icon, () => {
                this.student = data.student;
                this.updateUi();

                const wrap = document.getElementById('pet-hero-wrap');
                wrap.classList.remove('is-eating');
                void wrap.offsetWidth;
                wrap.classList.add('is-eating');
                setTimeout(() => wrap.classList.remove('is-eating'), 1200);

                this.triggerBubble(foodCfg.reaction || `美味 ${foodCfg.name}！饱腹+${foodCfg.fullnessBoost}%`);
                this.playAudioEat();

                if (data.leveledUp) {
                    setTimeout(() => {
                        this.triggerPetJump();
                        this.triggerBubble(`🎉 恭喜升级到 Lv.${this.student.pet.level}！`);
                        this.playAudioReward();
                    }, 900);
                }
            });
        } catch (e) {
            console.error('投喂失败', e);
        }
    }

    launchFoodProjectile(emoji, onArrive) {
        const frame = document.getElementById('courtyard-frame');
        if (!frame) {
            if (onArrive) onArrive();
            return;
        }

        const flyer = document.createElement('div');
        flyer.className = 'flying-food-item';
        flyer.textContent = emoji || '🍖';
        flyer.style.left = '50%';
        flyer.style.top = '92%';
        flyer.style.transform = 'translate(-50%, -50%) scale(0.6)';
        frame.appendChild(flyer);

        requestAnimationFrame(() => {
            flyer.style.left = `${this.petPos.x}%`;
            flyer.style.top = `${this.petPos.y - 6}%`;
            flyer.style.transform = 'translate(-50%, -50%) scale(1.25) rotate(360deg)';
        });

        setTimeout(() => {
            flyer.remove();
            if (onArrive) onArrive();
        }, 550);
    }

    // ── 初始/新轮宠物领养仪式（支持自选与3次抽蛋双模式） ─────────
    openStarterAdoptModal() {
        const modal = document.getElementById('modal-starter-adopt');
        if (!modal) return;

        const grid = document.getElementById('starter-adopt-grid');
        const drawPanel = document.getElementById('starter-draw-panel');
        const titleEl = document.getElementById('starter-adopt-title');
        const mode = (this.config && this.config.adoptionMode) || 'choose';

        if (mode === 'draw' && drawPanel && grid) {
            grid.style.display = 'none';
            drawPanel.style.display = 'block';
            if (titleEl) titleEl.textContent = '🥚 随机抽蛋领养伙伴';
            this.renderDrawEggPanel();
            this.openModal('modal-starter-adopt');
            return;
        }

        if (drawPanel) drawPanel.style.display = 'none';
        if (grid) grid.style.display = 'grid';
        if (titleEl) titleEl.textContent = '🌟 选择你的成长伙伴';
        if (!grid || modal.classList.contains('active')) return;

        const starters = (window.SKINS_CATALOG || []).filter(s => s.isStarter);
        const elemMap = {
            starter_fire_fox: { cls: 'fire', badge: '🔥 火系 · 烈焰灵狐' },
            starter_water_penguin: { cls: 'water', badge: '💧 水系 · 苍翼企鹅' },
            starter_grass_dino: { cls: 'grass', badge: '🌿 草系 · 森翼恐龙' }
        };

        grid.innerHTML = starters.map(skin => {
            const meta = elemMap[skin.id] || { cls: 'grass', badge: skin.icon };
            const stages = skin.stages || [skin.name, skin.name, skin.name];
            return `
                <div class="starter-adopt-card ${meta.cls}">
                    <span class="starter-badge ${meta.cls}">${meta.badge}</span>
                    <div class="starter-main-preview">
                        ${window.PetRenderer.renderSvg(skin.id, [], 0, 116, { level: 1 })}
                    </div>
                    <div class="starter-name">${stages[0]}</div>
                    <div class="starter-desc">${skin.desc}</div>
                    <div class="starter-evo-strip">
                        <div class="starter-evo-mini">
                            <div class="mini-svg">${window.PetRenderer.renderSvg(skin.id, [], 0, 44, { level: 1 })}</div>
                            <span>Lv.1 ${stages[0]}</span>
                        </div>
                        <div class="starter-evo-mini">
                            <div class="mini-svg">${window.PetRenderer.renderSvg(skin.id, [], 0, 44, { level: 4 })}</div>
                            <span>Lv.4 ${stages[1]}</span>
                        </div>
                        <div class="starter-evo-mini">
                            <div class="mini-svg">${window.PetRenderer.renderSvg(skin.id, [], 0, 44, { level: 7 })}</div>
                            <span>Lv.7 ${stages[2]}</span>
                        </div>
                    </div>
                    <button class="btn-dock highlight" style="width:100%; justify-content:center; margin-top:4px;" onclick="window.studentApp.chooseStarter('${skin.id}')">
                        选择它作为成长伙伴
                    </button>
                </div>
            `;
        }).join('');

        this.openModal('modal-starter-adopt');
    }

    renderDrawEggPanel() {
        const pet = (this.student && this.student.pet) || {};
        const chances = typeof pet.drawChances === 'number' ? pet.drawChances : 3;
        const hasDrawnOnce = chances < 3;
        const previewEl = document.getElementById('starter-draw-preview');
        const nameEl = document.getElementById('starter-draw-name');
        const descEl = document.getElementById('starter-draw-desc');
        const drawBtn = document.getElementById('btn-draw-egg');
        const confirmBtn = document.getElementById('btn-confirm-egg');

        if (hasDrawnOnce && pet.currentSkin) {
            const cfg = this.getSkinConfig(pet.currentSkin);
            if (previewEl) previewEl.innerHTML = window.PetRenderer.renderSvg(cfg.id, [], 0, 150, { level: 1 });
            if (nameEl) nameEl.textContent = `${cfg.icon || '🐾'} ${cfg.name}`;
            if (descEl) descEl.textContent = cfg.desc || '已唤醒的神秘伙伴！';
            if (confirmBtn) confirmBtn.style.display = 'inline-flex';
        } else {
            if (previewEl) previewEl.innerHTML = window.PetRenderer.renderSvg('default_cat', [], 0, 145, { level: 0 });
            if (nameEl) nameEl.textContent = '神秘宠物蛋';
            if (descEl) descEl.textContent = '点击下方按钮唤醒你的专属伙伴（每轮最多 3 次抽蛋机会）';
            if (confirmBtn) confirmBtn.style.display = 'none';
        }

        if (drawBtn) {
            drawBtn.textContent = chances > 0 ? `🥚 随机抽蛋 (剩余 ${chances} 次)` : '抽蛋次数已用完';
            drawBtn.disabled = chances <= 0;
        }
    }

    async drawStarterEgg() {
        try {
            const res = await fetch('/api/student/starter/draw', { method: 'POST' });
            const data = await res.json();
            if (!data.success) {
                alert(data.message || '抽蛋失败');
                return;
            }
            this.student = data.student;
            this.playAudioReward();
            if (data.autoConfirmed) {
                this.closeModal('modal-starter-adopt');
                this.updateUi();
                this.triggerBubble('🎉 3次抽蛋结束，已自动锁定最终伙伴！');
            } else {
                this.renderDrawEggPanel();
            }
        } catch (err) {
            console.error('抽蛋失败', err);
        }
    }

    async confirmStarterEgg() {
        try {
            const res = await fetch('/api/student/starter/confirm', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                this.student = data.student;
                this.closeModal('modal-starter-adopt');
                this.playAudioReward();
                this.updateUi();
            } else {
                alert(data.message || '确认领养失败');
            }
        } catch (err) {
            console.error('确认领养失败', err);
        }
    }

    // ── 个人满级图鉴、A4 奖状与进化庆祝 ───────────────────────────
    openDexModal() {
        const container = document.getElementById('dex-items-container');
        const emptyTip = document.getElementById('dex-empty-tip');
        if (!container) return;

        const dex = (this.student && this.student.pet && Array.isArray(this.student.pet.dex)) ? this.student.pet.dex : [];
        if (dex.length === 0) {
            container.innerHTML = '';
            if (emptyTip) emptyTip.style.display = 'block';
        } else {
            if (emptyTip) emptyTip.style.display = 'none';
            container.innerHTML = dex.map(item => {
                const cfg = this.getSkinConfig(item.skinId);
                const stageName = this.getSkinStageName(cfg, 10);
                const dateStr = item.completedAt ? new Date(item.completedAt).toLocaleDateString('zh-CN') : '';
                return `
                    <div class="plaza-card" style="text-align:center;">
                        <div style="font-size:12px; color:#d97706; font-weight:700;">第 ${item.generation || 1} 轮 · Lv.10 满级</div>
                        <div style="display:flex; justify-content:center; margin:8px 0;">
                            ${window.PetRenderer.renderSvg(item.skinId, [], 0, 105, { level: 10 })}
                        </div>
                        <div style="font-weight:700; font-size:15px;">${stageName}</div>
                        <div style="font-size:12px; color:#64748b; margin:4px 0 10px;">达成日期：${dateStr}</div>
                        <button class="btn-dock highlight" style="width:100%; justify-content:center;" onclick="window.studentApp.openCertificateModal('${item.skinId}', '${item.completedAt || ''}')">
                            📜 查看并打印奖状
                        </button>
                    </div>
                `;
            }).join('');
        }
        this.openModal('modal-dex');
    }

    openCertificateModal(skinId, completedAt) {
        const cfg = this.getSkinConfig(skinId);
        const stageName = this.getSkinStageName(cfg, 10);
        const classEl = document.getElementById('cert-class-name');
        const stuEl = document.getElementById('cert-student-name');
        const petEl = document.getElementById('cert-pet-name');
        const previewEl = document.getElementById('cert-pet-preview');
        const dateEl = document.getElementById('cert-date-text');

        if (classEl) classEl.textContent = (this.config && this.config.className) || '班级';
        if (stuEl) stuEl.textContent = (this.student && this.student.displayName) || '同学';
        if (petEl) petEl.textContent = stageName;
        if (previewEl) previewEl.innerHTML = window.PetRenderer.renderSvg(skinId, [], 0, 150, { level: 10 });
        if (dateEl) {
            const d = completedAt ? new Date(completedAt) : new Date();
            dateEl.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
        }
        this.openModal('modal-certificate');
    }

    openEvolutionModal(data) {
        const cfg = this.getSkinConfig(data.skinId || (this.student && this.student.pet && this.student.pet.currentSkin));
        const newLv = Number(data.newLevel) || 1;
        const stageName = this.getSkinStageName(cfg, newLv);
        const badgeEl = document.getElementById('evo-celebrate-badge');
        const titleEl = document.getElementById('evo-celebrate-title');
        const petEl = document.getElementById('evo-celebrate-pet');
        const descEl = document.getElementById('evo-celebrate-desc');

        if (data.reachedMax) {
            if (badgeEl) badgeEl.textContent = '👑 满级荣耀 · 图鉴点亮 👑';
            if (titleEl) titleEl.textContent = `${stageName} 达成 Lv.10 满级！`;
            if (descEl) descEl.textContent = '已永久收录至个人荣誉图鉴，可随时打印满级奖状并开启下一轮新伙伴领养！';
        } else if (data.oldLevel === 0) {
            if (badgeEl) badgeEl.textContent = '🥚 破壳而出 ✨';
            if (titleEl) titleEl.textContent = `你的 ${stageName} 孵化啦！`;
            if (descEl) descEl.textContent = `当前等级 Lv.${newLv}，继续保持课堂好习惯让它变得更强大吧！`;
        } else {
            if (badgeEl) badgeEl.textContent = '✨ 形态突破 · 进化成功 ✨';
            if (titleEl) titleEl.textContent = `进化为「${stageName}」！`;
            if (descEl) descEl.textContent = `等级突破至 Lv.${newLv}，解锁全新高阶形态！`;
        }
        if (petEl) petEl.innerHTML = window.PetRenderer.renderSvg(cfg.id, [], 0, 165, { level: newLv });
        this.playAudioReward();
        this.openModal('modal-evolution');
    }

    async startNextRound() {
        if (!confirm('当前满级伙伴已保存在【图鉴】中，确定要开启新一轮宠物领养吗？')) return;
        try {
            const res = await fetch('/api/student/pet/next-round', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                this.student = data.student;
                this.updateUi();
            } else {
                alert(data.message || '开启下一轮失败');
            }
        } catch (err) {
            console.error('开启下一轮失败', err);
        }
    }

    async chooseStarter(skinId) {
        try {
            const res = await fetch('/api/student/starter/choose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skinId })
            });
            const data = await res.json();
            if (data.success) {
                this.student = data.student;
                this.closeModal('modal-starter-adopt');
                this.playAudioReward();
                this.updateUi();
                const cfg = this.getSkinConfig(skinId);
                this.triggerBubble(`太棒啦！${cfg.name}加入庭院啦，加油升级解锁下一阶进化吧！`);
                this.triggerPetJump();
            } else {
                alert(data.message || '领养失败');
            }
        } catch (e) {
            console.error('领养初始伙伴失败', e);
        }
    }

    // ── 物种图鉴与衣橱 ──────────────────────────────────────
    openSkinCloset() {
        this.openModal('modal-closet');
        const container = document.getElementById('closet-skins-container');
        const state = this.student.pet || {};
        const unlocked = state.unlockedSkins || ['default_cat'];
        const current = state.currentSkin || 'default_cat';
        const myLevel = state.level || 1;

        let html = '';
        window.SKINS_CATALOG.forEach(skin => {
            const isUnlocked = unlocked.includes(skin.id);
            const isCurrent = current === skin.id;
            const levelLocked = (skin.reqLevel || 1) > myLevel;
            const stageTitle = this.getSkinStageName(skin, myLevel);
            const evoHint = Array.isArray(skin.stages)
                ? `<div style="font-size:10px; color:#EA580C; font-weight:700;">进化路线: ${skin.stages.join(' → ')}</div>`
                : '';

            let btnText = '';
            let btnAction = '';
            let disabledAttr = '';

            if (isCurrent) {
                btnText = '✓ 使用中';
                disabledAttr = 'disabled';
            } else if (isUnlocked) {
                btnText = '切换';
                btnAction = `window.studentApp.equipSkin('${skin.id}')`;
            } else if (levelLocked) {
                btnText = `🔒 Lv.${skin.reqLevel}`;
                disabledAttr = 'disabled';
            } else {
                btnText = `💰 ${skin.price}`;
                btnAction = `window.studentApp.buySkin('${skin.id}')`;
            }

            html += `
                <div class="plaza-card" style="border-color:${isCurrent ? 'var(--primary)' : 'var(--border-soft)'};">
                    <div class="plaza-pet-box">
                        ${window.PetRenderer.renderSvg(skin.id, [], 0, 105, { level: myLevel })}
                    </div>
                    <div style="font-weight:800; font-size:15px;">${skin.icon} ${stageTitle}</div>
                    <div style="font-size:11px; font-weight:700; color:var(--primary); background:#ECFDF5; padding:2px 8px; border-radius:99px;">
                        🏡 ${skin.sceneName}
                    </div>
                    <button class="btn-dock ${isUnlocked && !isCurrent ? 'highlight' : ''}" style="margin-top:6px; font-size:12px; padding:6px 14px;" ${disabledAttr} onclick="${btnAction}">
                        ${btnText}
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    async equipSkin(skinId) {
        try {
            const res = await fetch('/api/student/skin/equip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skinId })
            });
            const data = await res.json();
            if (data.success) {
                this.student.pet.currentSkin = skinId;
                this.exitVisitMode();
                this.updateUi();
                this.openSkinCloset();
            } else {
                alert(data.message);
            }
        } catch (e) {
            console.error('切换皮肤失败', e);
        }
    }

    async buySkin(skinId) {
        try {
            const res = await fetch('/api/student/skin/buy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skinId })
            });
            const data = await res.json();
            if (data.success) {
                this.student = data.student;
                this.exitVisitMode();
                this.updateUi();
                this.openSkinCloset();
                this.playAudioReward();
                alert('🎉 恭喜解锁新物种伙伴与专属主题庭院！');
            } else {
                alert(data.message);
            }
        } catch (e) {
            console.error('兑换皮肤失败', e);
        }
    }

    // ── 装扮与五官捏脸工坊 ────────────────────────────────────
    openOutfitEditor() {
        if (this.permissions.currentMode !== 'outfit_create') {
            alert('当前未在装扮创作开放时间内，请等待任课老师开启「装扮时间」！');
            return;
        }

        const pet = this.student.pet || {};
        const skinCfg = this.getSkinConfig(pet.currentSkin || 'default_cat');
        const skinId = pet.currentSkin || 'default_cat';
        const is3DStarter = Boolean(window.PetRenderer?.isStarterSpecies?.(skinId));
        this.editorTemp = {
            skinId,
            accessories: Array.from(pet.accessories || []),
            colorHue: pet.colorHue || 0,
            activeTab: is3DStarter ? 'head' : 'face'
        };

        const faceTabBtn = document.querySelector('#editor-category-tabs .editor-tab[data-cat="face"]');
        if (faceTabBtn) {
            faceTabBtn.style.display = is3DStarter ? 'none' : '';
        }

        document.getElementById('editor-preview-skinname').textContent = `${skinCfg.icon} ${this.getSkinStageName(skinCfg, pet.level || 1)}`;
        document.getElementById('editor-preview-evotext').textContent = this.getEvoStageLabel(pet.level || 1);
        document.getElementById('input-hue-range').value = this.editorTemp.colorHue;
        document.getElementById('hue-val-display').textContent = `${this.editorTemp.colorHue}°`;
        document.getElementById('input-outfit-name').value = this.lastOutfitName || '';
        document.getElementById('ai-review-feedback').style.display = 'none';

        const editorExportBtn = document.getElementById('btn-editor-export');
        if (editorExportBtn) {
            editorExportBtn.style.display = this.hasSavedOutfit ? 'inline-flex' : 'none';
        }

        this.switchEditorTab(this.editorTemp.activeTab);
        this.updateEditorPreview();
        this.openModal('modal-editor');
    }

    switchEditorTab(category) {
        this.editorTemp.activeTab = category;
        document.querySelectorAll('#editor-category-tabs .editor-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.cat === category);
        });
        this.renderEditorCategoryItems();
    }

    renderEditorCategoryItems() {
        const container = document.getElementById('editor-acc-grid');
        const cat = this.editorTemp.activeTab;

        if (cat === 'face') {
            if (window.PetRenderer?.isStarterSpecies?.(this.editorTemp.skinId)) {
                container.innerHTML = `<div style="padding:18px 14px; text-align:center; background:#FFFBEB; border:2px dashed #F59E0B; border-radius:16px; color:#92400E; font-size:13px; line-height:1.7;">
                    <strong>3D 潮玩伙伴已自带立体五官与高光眼神 ✨</strong><br>
                    可在上方选择「头饰帽冠」「眼饰面具」「颈饰背翼」「手持道具」「伴生光效」为它穿戴立体配饰；<br>
                    （其他经典手绘物种仍支持五官捏脸切换）
                </div>`;
                return;
            }
            // 渲染五官捏脸三大模块（眼神、嘴型、腮红面纹）
            const faces = window.FACES_CATALOG || {};
            const curEye = this.editorTemp.accessories.find(a => a.startsWith('face_eye_')) || 'face_eye_round';
            const curMouth = this.editorTemp.accessories.find(a => a.startsWith('face_mouth_')) || 'face_mouth_cat';
            const curCheek = this.editorTemp.accessories.find(a => a.startsWith('face_cheek_')) || 'face_cheek_peach';

            let html = `<div class="face-section-title">👀 眼部神态</div><div class="acc-grid">`;
            (faces.eyes || []).forEach(item => {
                const active = curEye === item.id;
                html += `
                    <div class="acc-card ${active ? 'active' : ''}" onclick="window.studentApp.selectFacePart('face_eye_', '${item.id}')">
                        <span style="font-size:20px;">${item.icon}</span>
                        <span>${item.name}</span>
                    </div>
                `;
            });
            html += `</div><div class="face-section-title">😺 嘴型表情</div><div class="acc-grid">`;
            (faces.mouth || []).forEach(item => {
                const active = curMouth === item.id;
                html += `
                    <div class="acc-card ${active ? 'active' : ''}" onclick="window.studentApp.selectFacePart('face_mouth_', '${item.id}')">
                        <span style="font-size:20px;">${item.icon}</span>
                        <span>${item.name}</span>
                    </div>
                `;
            });
            html += `</div><div class="face-section-title">🍑 腮红与面纹</div><div class="acc-grid">`;
            (faces.cheeks || []).forEach(item => {
                const active = curCheek === item.id;
                html += `
                    <div class="acc-card ${active ? 'active' : ''}" onclick="window.studentApp.selectFacePart('face_cheek_', '${item.id}')">
                        <span style="font-size:20px;">${item.icon}</span>
                        <span>${item.name}</span>
                    </div>
                `;
            });
            html += `</div>`;
            container.innerHTML = html;
            return;
        }

        // 渲染对应分类的穿戴饰品（同槽位自动互斥，支持进阶饰品金币解锁）
        const ownedSet = new Set(this.student?.pet?.unlockedAccessories || []);
        const list = (window.ACCESSORIES_CATALOG || []).filter(a => a.category === cat);
        let html = `<div class="acc-grid">`;
        const is3DStarter = Boolean(window.PetRenderer?.isStarterSpecies?.(this.editorTemp.skinId));
        const curLevel = Number(this.student?.pet?.level) || 1;
        list.forEach(acc => {
            const isPremium = (acc.price || 0) > 0;
            const isOwned = !isPremium || ownedSet.has(acc.id);
            const conflictReason = window.PetRenderer?.getStarterAccConflict?.(this.editorTemp.skinId, curLevel, acc.id);
            const isSelected = !conflictReason && this.editorTemp.accessories.includes(acc.id);
            const styleBadge = acc.styleTag ? `<span class="acc-style-tag">${acc.styleTag}</span>` : '';
            let priceBadge = isPremium
                ? (isOwned
                    ? `<span class="acc-price-tag owned">✓ 已解锁</span>`
                    : `<span class="acc-price-tag" onclick="event.stopPropagation(); window.studentApp.buyAccessory('${acc.id}')" title="点击购买解锁">${isSelected ? '试穿·' : ''}💰 ${acc.price}</span>`)
                : '';
            if (conflictReason) {
                priceBadge = `<span class="acc-conflict-tag">${conflictReason}</span>`;
            }
            const clickHandler = conflictReason
                ? `window.studentApp.notifyAccConflict('${acc.name.replace(/'/g, "\\'")}', '${conflictReason.replace(/'/g, "\\'")}')`
                : `window.studentApp.toggleAccessory('${acc.id}')`;
            const use3DThumb = is3DStarter && window.PetRenderer?.has3DAsset?.(acc.id);
            const iconHtml = use3DThumb
                ? `<img class="acc-thumb-3d" src="/shared/assets/acc/${acc.id}.png" alt="${acc.name}" loading="lazy">`
                : `<span style="font-size:24px;">${acc.icon}</span>`;

            html += `
                <div class="acc-card ${isSelected ? 'active' : ''} ${!isOwned ? 'locked' : ''} ${conflictReason ? 'incompatible' : ''}" onclick="${clickHandler}" title="${conflictReason ? `当前形态暂不穿戴：${conflictReason}` : ''}">
                    ${iconHtml}
                    <span>${acc.name}</span>
                    ${styleBadge}
                    ${priceBadge}
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;
    }

    selectFacePart(prefix, partId) {
        this.editorTemp.accessories = this.editorTemp.accessories.filter(a => !a.startsWith(prefix));
        this.editorTemp.accessories.push(partId);
        this.renderEditorCategoryItems();
        this.updateEditorPreview();
    }

    notifyAccConflict(accName, reason) {
        const feedback = document.getElementById('ai-review-feedback');
        if (feedback) {
            feedback.style.display = 'block';
            feedback.style.background = '#FFFBEB';
            feedback.style.color = '#92400E';
            feedback.textContent = `ℹ️ 「${accName}」暂不适配当前形态（${reason}），已为你自动避让穿模。`;
        }
    }

    toggleAccessory(accId) {
        const targetAcc = (window.ACCESSORIES_CATALOG || []).find(a => a.id === accId);
        if (!targetAcc) return;
        const curLevel = Number(this.student?.pet?.level) || 1;
        const conflictReason = window.PetRenderer?.getStarterAccConflict?.(this.editorTemp.skinId, curLevel, accId);
        if (conflictReason) {
            this.notifyAccConflict(targetAcc.name, conflictReason);
            return;
        }

        const alreadyHas = this.editorTemp.accessories.includes(accId);
        if (alreadyHas) {
            this.editorTemp.accessories = this.editorTemp.accessories.filter(id => id !== accId);
        } else {
            // 移除同一互斥槽位 (slot) 的旧饰品，防止帽子叠皇冠穿模
            const sameSlotIds = (window.ACCESSORIES_CATALOG || [])
                .filter(a => a.slot === targetAcc.slot)
                .map(a => a.id);
            this.editorTemp.accessories = this.editorTemp.accessories.filter(id => !sameSlotIds.includes(id));
            this.editorTemp.accessories.push(accId);
        }

        const ownedSet = new Set(this.student?.pet?.unlockedAccessories || []);
        const isLockedPreview = !alreadyHas && (targetAcc.price || 0) > 0 && !ownedSet.has(accId);
        const feedback = document.getElementById('ai-review-feedback');
        if (feedback) {
            if (isLockedPreview) {
                feedback.style.display = 'block';
                feedback.style.background = '#EFF6FF';
                feedback.style.color = '#1E40AF';
                feedback.textContent = `✨ 正在试穿「${targetAcc.name}」（需 ${targetAcc.price} 课堂币，点击卡片金币标签解锁后可保存穿戴）`;
            } else if (feedback.textContent.includes('正在试穿') || feedback.textContent.includes('尚未解锁')) {
                feedback.style.display = 'none';
            }
        }

        this.renderEditorCategoryItems();
        this.updateEditorPreview();
    }

    async buyAccessory(accId) {
        const acc = (window.ACCESSORIES_CATALOG || []).find(a => a.id === accId);
        if (!acc) return;
        const coins = this.student?.pet?.coins || 0;
        if (coins < (acc.price || 0)) {
            alert(`课堂币不足！解锁「${acc.name}」需要 ${acc.price} 课堂币，你当前只有 ${coins} 枚。多完成课堂互动赚金币吧！`);
            return;
        }
        if (!confirm(`确定花费 ${acc.price} 课堂币永久解锁「${acc.name}」吗？（解锁后可随时自由穿戴，并可导出到 Mind+）`)) {
            return;
        }
        try {
            const res = await fetch('/api/student/accessories/buy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accId })
            });
            const data = await res.json();
            if (data.success) {
                this.student = data.student;
                const sameSlotIds = (window.ACCESSORIES_CATALOG || [])
                    .filter(a => a.slot === acc.slot)
                    .map(a => a.id);
                this.editorTemp.accessories = this.editorTemp.accessories.filter(id => !sameSlotIds.includes(id));
                this.editorTemp.accessories.push(accId);
                this.playAudioReward();
                this.updateUi();
                this.renderEditorCategoryItems();
                this.updateEditorPreview();
            } else {
                alert(data.message || '解锁饰品失败');
            }
        } catch (e) {
            console.error('解锁饰品失败', e);
        }
    }

    resetEditorAccessories() {
        this.editorTemp.accessories = [];
        this.editorTemp.colorHue = 0;
        document.getElementById('input-hue-range').value = 0;
        document.getElementById('hue-val-display').textContent = '原色 0°';
        this.renderEditorCategoryItems();
        this.updateEditorPreview();
    }

    onHueChange(val) {
        this.editorTemp.colorHue = Number(val);
        document.getElementById('input-hue-range').value = val;
        document.getElementById('hue-val-display').textContent = `${val}°`;
        this.updateEditorPreview();
    }

    updateEditorPreview() {
        const stage = document.getElementById('editor-preview-stage');
        const level = this.student?.pet?.level || 1;
        stage.innerHTML = window.PetRenderer.renderSvg(
            this.editorTemp.skinId,
            this.editorTemp.accessories,
            this.editorTemp.colorHue,
            165,
            { level }
        );
    }

    getUnownedPreviewNames() {
        const ownedSet = new Set(this.student?.pet?.unlockedAccessories || []);
        return this.editorTemp.accessories
            .map(id => (window.ACCESSORIES_CATALOG || []).find(a => a.id === id))
            .filter(acc => acc && (acc.price || 0) > 0 && !ownedSet.has(acc.id))
            .map(acc => acc.name);
    }

    async saveOutfitLocal() {
        const unowned = this.getUnownedPreviewNames();
        if (unowned.length > 0) {
            const feedback = document.getElementById('ai-review-feedback');
            if (feedback) {
                feedback.style.display = 'block';
                feedback.style.background = '#FFFBEB';
                feedback.style.color = '#92400E';
                feedback.textContent = `🔒 试穿中的「${unowned.join('、')}」尚未解锁，请先点击金币标签购买，或再次点击取消试穿后再保存。`;
            }
            return;
        }
        const inputName = (document.getElementById('input-outfit-name')?.value || '').trim();
        if (inputName) {
            this.lastOutfitName = inputName;
        }
        try {
            const res = await fetch('/api/student/accessories/equip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessories: this.editorTemp.accessories,
                    colorHue: this.editorTemp.colorHue
                })
            });
            const data = await res.json();
            if (data.success) {
                this.student.pet = data.pet;
                this.hasSavedOutfit = true;
                this.updateUi();
                this.closeModal('modal-editor');
                this.triggerPetJump();
                this.highlightExportButton();
                this.triggerBubble('✨ 新造型穿戴成功！点底部「🎮 导出Mind+」即可导入编程~');
            } else {
                alert(data.message);
            }
        } catch (e) {
            console.error('保存装扮失败', e);
        }
    }

    async submitOutfitToPlaza() {
        const unowned = this.getUnownedPreviewNames();
        if (unowned.length > 0) {
            const feedback = document.getElementById('ai-review-feedback');
            if (feedback) {
                feedback.style.display = 'block';
                feedback.style.background = '#FFFBEB';
                feedback.style.color = '#92400E';
                feedback.textContent = `🔒 试穿中的「${unowned.join('、')}」尚未解锁，请先购买或取消试穿后再投稿。`;
            }
            return;
        }
        const name = document.getElementById('input-outfit-name').value.trim();
        const feedback = document.getElementById('ai-review-feedback');
        const btn = document.getElementById('btn-submit-outfit');

        if (!name) {
            alert('请先为你的作品起一个好听的造型名称！');
            return;
        }

        if (!this.canTriggerAction()) return;
        this.startActionCooldown(2000);

        this.lastOutfitName = name;
        this.hasSavedOutfit = true;

        feedback.style.display = 'block';
        feedback.style.background = '#EFF6FF';
        feedback.style.color = '#1D4ED8';
        feedback.textContent = '🤖 AI审核员正在对造型名称与搭配进行合规预审...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/outfits/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    components: {
                        skinId: this.editorTemp.skinId,
                        accessories: this.editorTemp.accessories,
                        colorHue: this.editorTemp.colorHue
                    }
                })
            });
            const data = await res.json();
            btn.disabled = false;

            if (data.success) {
                if (data.student) {
                    this.student = data.student;
                    this.updateUi();
                } else {
                    await this.fetchMe();
                }
                feedback.style.background = '#ECFDF5';
                feedback.style.color = '#047857';
                feedback.textContent = `✅ ${data.message}`;
                setTimeout(() => {
                    this.closeModal('modal-editor');
                    this.highlightExportButton();
                    this.triggerBubble('🚀 造型已保存并送审！可点击「🎮 导出Mind+」带入编程舞台~');
                }, 900);
            } else {
                feedback.style.background = '#FEF2F2';
                feedback.style.color = '#B91C1C';
                feedback.textContent = `❌ ${data.message}`;
            }
        } catch (e) {
            btn.disabled = false;
            feedback.style.background = '#FEF2F2';
            feedback.style.color = '#B91C1C';
            feedback.textContent = '❌ 提交失败，请检查网络连接';
        }
    }

    highlightExportButton() {
        const btnExport = document.getElementById('btn-action-export');
        if (!btnExport) return;
        btnExport.classList.remove('export-ready');
        void btnExport.offsetWidth;
        btnExport.classList.add('export-ready');
        setTimeout(() => btnExport.classList.remove('export-ready'), 4500);
    }

    async exportFromEditor() {
        const inputName = (document.getElementById('input-outfit-name')?.value || '').trim();
        if (inputName) {
            this.lastOutfitName = inputName;
        }
        try {
            const res = await fetch('/api/student/accessories/equip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessories: this.editorTemp.accessories,
                    colorHue: this.editorTemp.colorHue
                })
            });
            const data = await res.json();
            if (!data.success) {
                alert(data.message || '保存装扮失败，请重试');
                return;
            }
            this.student.pet = data.pet;
            this.hasSavedOutfit = true;
            this.updateUi();
            this.exportPetToMindPlus(inputName);
        } catch (e) {
            console.error('保存并导出失败', e);
            alert('保存装扮失败，请检查网络连接');
        }
    }

    exportPetToMindPlus(customNickname = '') {
        const mode = this.permissions.currentMode || 'class';
        if (mode !== 'interactive' && mode !== 'outfit_create') {
            alert('当前课堂模式尚未开放导出功能，请等待任课老师开启「自由互动」或「装扮时间」！');
            return;
        }
        if (mode === 'outfit_create' && !this.hasSavedOutfit) {
            alert('请先进入「装扮与捏脸」完成搭配并保存穿戴，再导出为 Mind+ 角色包！');
            return;
        }
        if (!window.Sprite3Exporter) {
            alert('导出组件正在加载中，请稍后再试');
            return;
        }

        const pet = this.student?.pet || {};
        const skinId = pet.currentSkin || 'default_cat';
        const skinCfg = this.getSkinConfig(skinId);
        const rawDisplay = (this.student?.displayName || '').replace(/^\d+号\s*/, '').trim();
        const petNickname = (customNickname || this.lastOutfitName || rawDisplay || skinCfg.name).trim();

        try {
            const pkg = window.Sprite3Exporter.exportAndDownload({
                studentUsername: this.student?.username || 'student',
                petNickname,
                speciesName: skinCfg.name || '我的萌宠',
                skinId,
                accessories: pet.accessories || [],
                colorHue: pet.colorHue || 0,
                level: pet.level || 1
            });

            this.playAudioReward();
            this.triggerPetJump();
            this.triggerBubble(`🎮 已导出 ${pkg.filename}！在 Mind+ 点「上传角色」即可使用~`);
        } catch (err) {
            console.error('导出 .sprite3 失败', err);
            alert(`导出失败: ${err.message}`);
        }
    }

    // ── 互动 3：班级邻里街串门与装扮广场 ──────────────────────
    openPlaza(defaultTab = 'neighbors') {
        this.openModal('modal-plaza');
        this.switchPlazaTab(defaultTab);
    }

    switchPlazaTab(tab) {
        const btnNeighbors = document.getElementById('tab-btn-neighbors');
        const btnOutfits = document.getElementById('tab-btn-outfits');
        const neighborsGrid = document.getElementById('neighbors-items-container');
        const outfitsGrid = document.getElementById('plaza-items-container');

        if (tab === 'neighbors') {
            if (btnNeighbors) btnNeighbors.classList.add('active');
            if (btnOutfits) btnOutfits.classList.remove('active');
            if (neighborsGrid) neighborsGrid.style.display = 'grid';
            if (outfitsGrid) outfitsGrid.style.display = 'none';
            this.loadNeighborsList();
        } else {
            if (btnNeighbors) btnNeighbors.classList.remove('active');
            if (btnOutfits) btnOutfits.classList.add('active');
            if (neighborsGrid) neighborsGrid.style.display = 'none';
            if (outfitsGrid) outfitsGrid.style.display = 'grid';
            this.loadOutfitsPlaza();
        }
    }

    async loadNeighborsList() {
        const container = document.getElementById('neighbors-items-container');
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px;">正在加载班级同学的小窝...</div>';

        try {
            const res = await fetch('/api/student/classmates');
            const data = await res.json();
            this.classmates = data.classmates || [];

            let html = '';
            this.classmates.forEach(c => {
                if (c.id === this.student.id) return;
                const pet = c.pet || {};
                const skinCfg = this.getSkinConfig(pet.currentSkin || 'default_cat');
                html += `
                    <div class="plaza-card">
                        <div class="plaza-pet-box">
                            ${window.PetRenderer.renderSvg(pet.currentSkin, pet.accessories, pet.colorHue, 100, { level: pet.level || 1 })}
                        </div>
                        <div style="font-weight:800; font-size:15px;">${c.displayName}</div>
                        <div style="font-size:12px; color:var(--ink-sub);">
                            ${skinCfg.icon} ${skinCfg.name} · <strong>Lv.${pet.level || 1}</strong>
                        </div>
                        <div style="font-size:11px; color:var(--ink-muted);">饱腹度: ${pet.fullness ?? 80}%</div>
                        <button class="btn-visit" style="margin-top:6px; width:100%;" onclick="window.studentApp.enterVisitMode(${c.id})">
                            🏡 去TA家小窝串门
                        </button>
                    </div>
                `;
            });
            container.innerHTML = html || '<div style="grid-column:1/-1; text-align:center; padding:30px;">暂无其他同学在线</div>';
        } catch (e) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#DC2626;">加载同学列表失败</div>';
        }
    }

    enterVisitMode(targetStudentId) {
        const target = this.classmates.find(c => c.id === Number(targetStudentId));
        if (!target) return;
        this.visitingHost = target;
        this.closeModal('modal-plaza');
        this.updateUi();
        this.playAudioPurr();
    }

    exitVisitMode() {
        this.visitingHost = null;
        this.updateUi();
    }

    async handleVisitInteract(actionType = 'highfive') {
        if (!this.visitingHost) return;
        if (!this.canTriggerAction()) return;
        this.startActionCooldown(2000);

        try {
            const res = await fetch('/api/student/visit-interact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetStudentId: this.visitingHost.id,
                    actionType
                })
            });
            const data = await res.json();
            if (!data.success) {
                if (res.status === 429) {
                    this.triggerBubble(data.message);
                } else {
                    alert(data.message);
                }
                return;
            }

            this.student = data.student;
            this.visitingHost = data.targetStudent;

            const hostWrap = document.getElementById('pet-hero-wrap');
            const visitorWrap = document.getElementById('visitor-pet-wrap');

            if (actionType === 'highfive') {
                this.updateUi();
                // 两只小宠物向中间靠拢并同时欢呼跃起
                hostWrap.style.left = '56%';
                visitorWrap.style.left = '44%';
                hostWrap.classList.add('is-jumping');
                visitorWrap.classList.add('is-jumping');
                this.triggerBubble(data.message || '🤝 贴贴击掌成功！');
                this.playAudioReward();
                setTimeout(() => {
                    hostWrap.classList.remove('is-jumping');
                    visitorWrap.classList.remove('is-jumping');
                }, 900);
            } else {
                // 投喂爱心零食
                this.launchFoodProjectile('🎁', () => {
                    this.updateUi();
                    hostWrap.classList.add('is-eating');
                    this.triggerBubble('🎁 谢谢你的美味零食！太开心啦~');
                    this.playAudioEat();
                    setTimeout(() => hostWrap.classList.remove('is-eating'), 1100);
                });
            }
        } catch (e) {
            console.error('串门互动失败', e);
        }
    }

    async loadOutfitsPlaza() {
        const container = document.getElementById('plaza-items-container');
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px;">正在加载装扮展廊...</div>';

        try {
            const res = await fetch('/api/outfits/plaza');
            const data = await res.json();
            const outfits = data.outfits || [];

            if (outfits.length === 0) {
                container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--ink-sub);">展廊暂无已上架作品，快在装扮时间提交第一个创意造型吧！</div>';
                return;
            }

            let html = '';
            outfits.forEach(o => {
                const comp = o.components || {};
                const hasLiked = o.likedUserIds && o.likedUserIds.includes(this.student.id);

                html += `
                    <div class="plaza-card">
                        <div class="plaza-pet-box">
                            ${window.PetRenderer.renderSvg(comp.skinId, comp.accessories, comp.colorHue, 105)}
                        </div>
                        <div style="font-weight:800; font-size:15px;">${o.name}</div>
                        <div style="font-size:12px; color:var(--ink-sub);">
                            设计师: <strong>${o.authorName}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-top:6px;">
                            <span style="font-size:12px; font-weight:800; color:#D97706;">❤️ ${o.likes || 0} 赞</span>
                            <button class="btn-like" onclick="window.studentApp.likeOutfit('${o.id}')" ${hasLiked ? 'disabled style="opacity:0.55;"' : ''}>
                                ${hasLiked ? '已赞赏' : '👍 赞赏(+2币)'}
                            </button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#DC2626;">广场加载失败</div>';
        }
    }

    async likeOutfit(outfitId) {
        if (!this.canTriggerAction()) return;
        this.startActionCooldown(2000);

        try {
            const res = await fetch('/api/outfits/like', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ outfitId })
            });
            const data = await res.json();
            if (data.success) {
                this.playAudioPurr();
                this.loadOutfitsPlaza();
            } else if (res.status === 429) {
                this.triggerBubble(data.message);
            } else {
                alert(data.message);
            }
        } catch (e) {
            console.error('点赞失败', e);
        }
    }

    // ── 修改密码与成长日志 ────────────────────────────────────
    openPasswordModal() {
        document.getElementById('pwd-old').value = '';
        document.getElementById('pwd-new').value = '';
        document.getElementById('pwd-feedback').style.display = 'none';
        this.openModal('modal-password');
    }

    async submitChangePassword() {
        const oldPassword = document.getElementById('pwd-old').value.trim();
        const newPassword = document.getElementById('pwd-new').value.trim();
        const fb = document.getElementById('pwd-feedback');

        if (!oldPassword || !newPassword) {
            fb.textContent = '请完整填写原密码与新密码';
            fb.style.color = '#DC2626';
            fb.style.display = 'block';
            return;
        }

        try {
            const res = await fetch('/api/auth/student/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword, newPassword })
            });
            const data = await res.json();
            if (data.success) {
                alert('密码修改成功，下次登录请使用新密码！');
                this.closeModal('modal-password');
            } else {
                fb.textContent = data.message || '修改失败';
                fb.style.color = '#DC2626';
                fb.style.display = 'block';
            }
        } catch (e) {
            fb.textContent = '网络异常';
            fb.style.color = '#DC2626';
            fb.style.display = 'block';
        }
    }

    async openLogsModal() {
        this.openModal('modal-logs');
        const container = document.getElementById('student-logs-list');
        container.innerHTML = '<div style="text-align:center; padding:20px;">正在获取成长足迹...</div>';

        try {
            const res = await fetch('/api/student/logs');
            const data = await res.json();
            const logs = data.logs || [];

            if (logs.length === 0) {
                container.innerHTML = '<div style="text-align:center; color:var(--ink-sub); padding:20px;">暂无足迹记录</div>';
                return;
            }

            let html = '';
            logs.forEach(l => {
                html += `
                    <div style="background:#FFFFFF; border:2px solid var(--border-soft); padding:10px 14px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:13px; font-weight:600;">${l.detail}</span>
                        <span style="font-size:11px; font-weight:700; color:#D97706;">${l.time}</span>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = '<div style="color:#DC2626; text-align:center;">加载失败</div>';
        }
    }

    async handleLogout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {}
        window.location.replace('/student/login.html');
    }

    // ── 动效气泡与合成音效 ────────────────────────────────────
    triggerBubble(text) {
        const wrap = document.getElementById('pet-hero-wrap');
        if (!wrap) return;

        const bubble = document.createElement('div');
        bubble.className = 'pet-floating-bubble';
        bubble.textContent = text;
        wrap.appendChild(bubble);
        setTimeout(() => bubble.remove(), 2200);
    }

    playAudioPurr() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(160, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.28);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.32);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.32);
        } catch (e) {}
    }

    playAudioEat() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(360, ctx.currentTime);
            osc.frequency.setValueAtTime(520, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.16, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        } catch (e) {}
    }

    playAudioReward() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
                gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.08);
                gain.gain.linearRampToValueAtTime(0, ctx.currentTime + (idx + 1) * 0.08 + 0.1);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.08);
                osc.stop(ctx.currentTime + (idx + 1) * 0.08 + 0.1);
            });
        } catch (e) {}
    }

    openModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }

    closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    }

    bindEvents() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
            }
        });
    }
}

window.studentApp = new StudentApp();
