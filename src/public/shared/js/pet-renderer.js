// 统一宠物高精多层光影矢量骨骼与装扮/捏脸/进化渲染引擎 (v2.0 潮玩手办级)
const PetRenderer = {
    uidCounter: 0,

    /**
     * 生成完整的宠物 SVG
     * @param {string} skinId 物种皮肤ID
     * @param {Array<string>} accessories 饰品与五官ID数组
     * @param {number} colorHue 本体毛色色相微调 (0-360，仅作用于身体层，不影响配饰)
     * @param {number} size 容器尺寸
     * @param {Object} options 附加参数 { level: 1, mood: 'normal' }
     */
    renderSvg(skinId = 'default_cat', accessories = [], colorHue = 0, size = 120, options = {}) {
        const uid = ++this.uidCounter;
        const accList = Array.isArray(accessories) ? accessories : [];
        const accSet = new Set(accList);
        const rawLv = options && options.level !== undefined && options.level !== null ? Number(options.level) : 1;
        const level = isNaN(rawLv) ? 1 : rawLv;
        const hueStyle = colorHue ? `filter: hue-rotate(${colorHue}deg);` : '';

        // 1. 解析物种配色与特征方案
        const species = this.getSpeciesTheme(skinId);
        const stage = this.getEvolutionStage(level);

        if (stage === 0) {
            return this.renderEggSvg(species, size, Boolean(options && options.isCracked), uid);
        }

        // 三大御三家启用 3D 潮玩手办分层渲染管线（纯进化阶段，不再叠加冲突配饰）
        if (this.isStarterSpecies(skinId) && (!options || !options.forceVector)) {
            return this.renderStarter3DRig(skinId, stage, [], colorHue, level, uid);
        }

        // 2. 解析五官捏脸配置（支持装扮工坊自由定制）
        const eyeType = accList.find(a => a.startsWith('face_eye_')) || species.defaultEye || 'face_eye_round';
        const mouthType = accList.find(a => a.startsWith('face_mouth_')) || species.defaultMouth || 'face_mouth_cat';
        const cheekType = accList.find(a => a.startsWith('face_cheek_')) || species.defaultCheek || 'face_cheek_peach';

        // 3. 等级进化视觉层 (Lv.4+ 进阶星纹, Lv.7+ 觉醒神环)
        const evolutionBack = this.renderEvolutionBack(level, species, uid);
        const evolutionFront = this.renderEvolutionFront(level, species, uid);

        // 4. 伴生光效与背部饰品
        const auraSvg = this.renderAuraLayer(accSet, uid);
        const backAccSvg = this.renderBackAccessories(accSet, uid);

        // 5. 物种专属尾部、耳朵/角、身体纹理、四肢
        let tailSvg;
        let headBackSvg;
        let torsoInnerSvg;
        let limbsSvg;
        let headTopSpeciesSvg;
        let anchors = null;

        if (this.isStarterSpecies(skinId)) {
            const parts = this.renderStarterParts(skinId, stage, species, uid, 'idle');
            tailSvg = parts.tailSvg;
            headBackSvg = parts.headBackSvg;
            torsoInnerSvg = parts.torsoSvg;
            limbsSvg = parts.limbsSvg;
            headTopSpeciesSvg = parts.headTopSvg;
            anchors = parts.anchors;
        } else {
            tailSvg = this.renderSpeciesTail(skinId, species, uid);
            headBackSvg = this.renderSpeciesHeadBack(skinId, species, uid);
            const bodyDecorSvg = this.renderSpeciesBodyDecor(skinId, species, uid);
            torsoInnerSvg = `
                        <!-- 身体底座圆润胶囊形 -->
                        <path class="svg-body" d="M36,72 C34,44 47,33 70,33 C93,33 106,44 104,72 C103,98 91,110 70,110 C49,110 37,98 36,72 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                        <!-- 手办顶部柔和高光 -->
                        <ellipse cx="58" cy="43" rx="16" ry="6" fill="#ffffff" opacity="0.28" transform="rotate(-10 58 43)" />
                        <!-- 肚皮 -->
                        <ellipse class="svg-belly" cx="70" cy="84" rx="22" ry="19" fill="url(#bellyGrad-${uid})" />
                        <!-- 物种专属身体花纹/装甲/斑纹 -->
                        ${bodyDecorSvg}
            `;
            limbsSvg = this.renderSpeciesLimbs(skinId, species, uid);
            headTopSpeciesSvg = this.renderSpeciesHeadTop(skinId, species, uid);
        }

        const wrapAnchor = (svg, tf) => (svg && tf ? `<g transform="${tf}">${svg}</g>` : (svg || ''));

        // 6. 捏脸五官层
        const eyesSvg = this.renderEyes(eyeType, skinId, species, uid);
        const noseMouthSvg = this.renderNoseAndMouth(mouthType, skinId, species, uid);
        const cheeksSvg = this.renderCheeks(cheekType, skinId, species, uid);

        // 7. 颈饰、眼饰、头饰、手持物（处于色相滤镜之外，保持纯正色彩）
        const neckAccSvg = wrapAnchor(this.renderNeckAccessories(accSet, uid), anchors?.neck);
        const eyeAccSvg = wrapAnchor(this.renderEyeAccessories(accSet, uid), anchors?.face);
        const headAccSvg = wrapAnchor(this.renderHeadAccessories(accSet, uid), anchors?.headAcc);
        const handAccSvg = wrapAnchor(this.renderHandAccessories(accSet, uid), anchors?.hand);
        const alignedBackAccSvg = wrapAnchor(backAccSvg, anchors?.back);
        const alignedEvoFront = wrapAnchor(evolutionFront, anchors?.evoFront);

        return `
            <svg class="pet-svg skin-${skinId} evo-stage-${stage}" viewBox="0 0 140 140" style="width: 100%; height: 100%; overflow: visible;">
                <defs>
                    <!-- 3D 潮玩手办立体渐变 -->
                    <radialGradient id="bodyGrad-${uid}" cx="38%" cy="28%" r="70%">
                        <stop offset="0%" stop-color="${species.bodyLight}" />
                        <stop offset="55%" stop-color="${species.bodyMain}" />
                        <stop offset="100%" stop-color="${species.bodyDark}" />
                    </radialGradient>
                    <linearGradient id="bellyGrad-${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="${species.bellyLight}" />
                        <stop offset="100%" stop-color="${species.bellyDark}" />
                    </linearGradient>
                    <linearGradient id="earInner-${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="${species.earInnerLight}" />
                        <stop offset="100%" stop-color="${species.earInnerDark}" />
                    </linearGradient>
                    <linearGradient id="goldGrad-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#FFE57F" />
                        <stop offset="50%" stop-color="#FFD740" />
                        <stop offset="100%" stop-color="#FF8F00" />
                    </linearGradient>
                    <radialGradient id="blushGrad-${uid}" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="#FF6B8B" stop-opacity="0.65" />
                        <stop offset="100%" stop-color="#FF6B8B" stop-opacity="0" />
                    </radialGradient>
                </defs>

                <!-- 0. 伴生光效与觉醒背景环 -->
                ${auraSvg}
                ${evolutionBack}

                <!-- 1. 背部饰品（翅膀/披风，不随毛色变色） -->
                ${alignedBackAccSvg}

                <!-- 2. 宠物本体染色层（仅此层应用毛色色相调节） -->
                <g class="pet-body-tint-group" style="${hueStyle}">
                    <!-- 尾巴组 -->
                    <g class="pet-tail-group">
                        ${tailSvg}
                    </g>

                    <!-- 后置耳朵/鹿角/龙角 -->
                    ${headBackSvg}

                    <!-- 躯干与头部立体手办主体 -->
                    <g class="pet-torso-group">
                        ${torsoInnerSvg}
                    </g>

                    <!-- 四肢与小爪子（支持行走摆动动画） -->
                    ${limbsSvg}

                    <!-- 物种头顶自带特征（如水豚的小橘子、宇航猫面罩、招财猫金纹） -->
                    ${headTopSpeciesSvg}
                </g>

                <!-- 3. 五官表情层（独立于色相，保证眼神明亮自然） -->
                <g class="pet-face-group">
                    ${anchors?.face ? `<g transform="${anchors.face}">${cheeksSvg}${eyesSvg}${noseMouthSvg}</g>` : `${cheeksSvg}${eyesSvg}${noseMouthSvg}`}
                    ${alignedEvoFront}
                </g>

                <!-- 4. 前景穿戴配饰层（颈饰、眼镜、帽子、手持道具） -->
                <g class="pet-accessories-front">
                    ${neckAccSvg}
                    ${eyeAccSvg}
                    ${headAccSvg}
                    ${handAccSvg}
                </g>
            </svg>
        `;
    },

    getSpeciesTheme(skinId) {
        const themes = {
            default_cat: {
                bodyLight: '#FFB74D', bodyMain: '#FF9800', bodyDark: '#E65100',
                bellyLight: '#FFFDF7', bellyDark: '#FFE0B2',
                earInnerLight: '#FFCDD2', earInnerDark: '#F48FB1',
                outline: '#8D4004', eyeColor: '#2B1E16',
                defaultEye: 'face_eye_round', defaultMouth: 'face_mouth_cat', defaultCheek: 'face_cheek_whiskers'
            },
            shiba_sunny: {
                bodyLight: '#FFD54F', bodyMain: '#F59E0B', bodyDark: '#B45309',
                bellyLight: '#FFFFFF', bellyDark: '#FEF3C7',
                earInnerLight: '#FDE68A', earInnerDark: '#D97706',
                outline: '#78350F', eyeColor: '#27170A',
                defaultEye: 'face_eye_happy', defaultMouth: 'face_mouth_grin', defaultCheek: 'face_cheek_peach'
            },
            capybara_zen: {
                bodyLight: '#D7A172', bodyMain: '#B47B44', bodyDark: '#7C4D25',
                bellyLight: '#E6BE9A', bellyDark: '#C89263',
                earInnerLight: '#8D5B34', earInnerDark: '#5D3A1A',
                outline: '#4E2F14', eyeColor: '#23160C',
                defaultEye: 'face_eye_cool', defaultMouth: 'face_mouth_calm', defaultCheek: 'face_cheek_peach'
            },
            mech_dog: {
                bodyLight: '#E0F7FA', bodyMain: '#78909C', bodyDark: '#37474F',
                bellyLight: '#80DEEA', bellyDark: '#00ACC1',
                earInnerLight: '#00E5FF', earInnerDark: '#00838F',
                outline: '#263238', eyeColor: '#00E5FF',
                defaultEye: 'face_eye_round', defaultMouth: 'face_mouth_cat', defaultCheek: 'face_cheek_bolt'
            },
            bamboo_panda: {
                bodyLight: '#FFFFFF', bodyMain: '#F8FAFC', bodyDark: '#CBD5E1',
                bellyLight: '#FFFFFF', bellyDark: '#F1F5F9',
                earInnerLight: '#334155', earInnerDark: '#0F172A',
                outline: '#1E293B', eyeColor: '#0F172A',
                defaultEye: 'face_eye_sparkle', defaultMouth: 'face_mouth_blep', defaultCheek: 'face_cheek_peach'
            },
            chubby_penguin: {
                bodyLight: '#7DD3FC', bodyMain: '#38BDF8', bodyDark: '#0284C7',
                bellyLight: '#FFFFFF', bellyDark: '#E0F2FE',
                earInnerLight: '#BAE6FD', earInnerDark: '#0369A1',
                outline: '#0C4A6E', eyeColor: '#0F172A',
                defaultEye: 'face_eye_round', defaultMouth: 'face_mouth_owo', defaultCheek: 'face_cheek_peach'
            },
            fire_dragon: {
                bodyLight: '#FF8A65', bodyMain: '#FF5722', bodyDark: '#BF360C',
                bellyLight: '#FFF59D', bellyDark: '#FBC02D',
                earInnerLight: '#FFD54F', earInnerDark: '#F57F17',
                outline: '#7F1D1D', eyeColor: '#B71C1C',
                defaultEye: 'face_eye_star', defaultMouth: 'face_mouth_fang', defaultCheek: 'face_cheek_bolt'
            },
            ice_spirit: {
                bodyLight: '#E0F7FA', bodyMain: '#80DEEA', bodyDark: '#0097A7',
                bellyLight: '#FFFFFF', bellyDark: '#B2EBF2',
                earInnerLight: '#B388FF', earInnerDark: '#4DD0E1',
                outline: '#006064', eyeColor: '#00695C',
                defaultEye: 'face_eye_sparkle', defaultMouth: 'face_mouth_cat', defaultCheek: 'face_cheek_stars'
            },
            magic_fox: {
                bodyLight: '#FBCFE8', bodyMain: '#F472B6', bodyDark: '#BE185D',
                bellyLight: '#FFF1F2', bellyDark: '#FCE7F3',
                earInnerLight: '#FEF08A', earInnerDark: '#F43F5E',
                outline: '#831843', eyeColor: '#881337',
                defaultEye: 'face_eye_wink', defaultMouth: 'face_mouth_cat', defaultCheek: 'face_cheek_hearts'
            },
            astro_cat: {
                bodyLight: '#F3E8FF', bodyMain: '#C084FC', bodyDark: '#6B21A8',
                bellyLight: '#FFFFFF', bellyDark: '#E9D5FF',
                earInnerLight: '#38BDF8', earInnerDark: '#7C3AED',
                outline: '#4C1D95', eyeColor: '#3B0764',
                defaultEye: 'face_eye_star', defaultMouth: 'face_mouth_grin', defaultCheek: 'face_cheek_stars'
            },
            lucky_cat: {
                bodyLight: '#FFF8E1', bodyMain: '#FFD54F', bodyDark: '#EF6C00',
                bellyLight: '#FFFFFF', bellyDark: '#FFECB3',
                earInnerLight: '#EF5350', earInnerDark: '#B71C1C',
                outline: '#9A3412', eyeColor: '#3E2723',
                defaultEye: 'face_eye_happy', defaultMouth: 'face_mouth_grin', defaultCheek: 'face_cheek_whiskers'
            },
            sky_dragon: {
                bodyLight: '#FFFDE7', bodyMain: '#FFD740', bodyDark: '#FF8F00',
                bellyLight: '#FFFFFF', bellyDark: '#FFF59D',
                earInnerLight: '#80D8FF', earInnerDark: '#00B0FF',
                outline: '#B45309', eyeColor: '#D97706',
                defaultEye: 'face_eye_star', defaultMouth: 'face_mouth_cat', defaultCheek: 'face_cheek_stars'
            },
            starter_fire_fox: {
                bodyLight: '#FFB38A', bodyMain: '#FF6B35', bodyDark: '#C2410C',
                bellyLight: '#FFFBEB', bellyDark: '#FDE68A',
                earInnerLight: '#FFF3E0', earInnerDark: '#FDBA74',
                outline: '#7C2D12', eyeColor: '#9A3412',
                defaultEye: 'face_eye_sparkle', defaultMouth: 'face_mouth_fang', defaultCheek: 'face_cheek_peach'
            },
            starter_water_penguin: {
                bodyLight: '#7DD3FC', bodyMain: '#0EA5E9', bodyDark: '#0369A1',
                bellyLight: '#FFFFFF', bellyDark: '#E0F2FE',
                earInnerLight: '#E0F2FE', earInnerDark: '#38BDF8',
                outline: '#0C4A6E', eyeColor: '#0F172A',
                defaultEye: 'face_eye_round', defaultMouth: 'face_mouth_grin', defaultCheek: 'face_cheek_peach'
            },
            starter_grass_dino: {
                bodyLight: '#86EFAC', bodyMain: '#22C55E', bodyDark: '#15803D',
                bellyLight: '#FEFCE8', bellyDark: '#D9F99D',
                earInnerLight: '#DCFCE7', earInnerDark: '#4ADE80',
                outline: '#14532D', eyeColor: '#14532D',
                defaultEye: 'face_eye_round', defaultMouth: 'face_mouth_grin', defaultCheek: 'face_cheek_peach'
            }
        };
        return themes[skinId] || themes.default_cat;
    },

    isStarterSpecies(skinId) {
        return skinId === 'starter_fire_fox' || skinId === 'starter_water_penguin' || skinId === 'starter_grass_dino';
    },

    getEvolutionStage(level = 1) {
        const lv = Number(level);
        if (isNaN(lv)) return 1;
        if (lv <= 0) return 0;
        return lv >= 7 ? 3 : (lv >= 4 ? 2 : 1);
    },

    renderEggSvg(species, size = 120, isCracked = false, uid = 1) {
        const mainColor = (species && species.bodyMain) || '#F59E0B';
        const lightColor = (species && species.bodyLight) || '#FDE68A';
        const darkColor = (species && species.bodyDark) || '#D97706';
        const outline = (species && species.outline) || '#78350F';
        const crackSvg = isCracked
            ? `<path d="M58,42 L68,55 L60,68 L74,82 L66,94" fill="none" stroke="${outline}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
               <path d="M68,55 L79,59" fill="none" stroke="${outline}" stroke-width="2.4" stroke-linecap="round" />`
            : '';
        return `
        <svg viewBox="0 0 140 140" width="${size}" height="${size}" class="pet-egg-svg">
            <defs>
                <radialGradient id="eggGrad-${uid}" cx="38%" cy="32%" r="68%">
                    <stop offset="0%" stop-color="#FFFBEB" />
                    <stop offset="55%" stop-color="${lightColor}" />
                    <stop offset="100%" stop-color="${mainColor}" />
                </radialGradient>
            </defs>
            <ellipse cx="70" cy="118" rx="34" ry="8" fill="#000000" opacity="0.14" />
            <path d="M70,26 C92,26 106,58 106,84 C106,105 90,116 70,116 C50,116 34,105 34,84 C34,58 48,26 70,26 Z"
                  fill="url(#eggGrad-${uid})" stroke="${outline}" stroke-width="3" />
            <circle cx="54" cy="56" r="7" fill="${darkColor}" opacity="0.32" />
            <circle cx="84" cy="70" r="9" fill="${darkColor}" opacity="0.28" />
            <circle cx="58" cy="92" r="5" fill="${darkColor}" opacity="0.26" />
            <ellipse cx="56" cy="46" rx="10" ry="5" fill="#FFFFFF" opacity="0.45" transform="rotate(-28 56 46)" />
            ${crackSvg}
        </svg>`;
    },

    /**
     * 三大初始伙伴 1~3 阶完全独立形态骨骼渲染器
     * 严格使用纯矢量路径与 Hex 配色，无 CSS filter / rgba / emoji，兼容 Mind+ .sprite3 导出
     */
    renderStarterParts(skinId, stage, species, uid, pose = 'idle') {
        const poseTf = {
            idle: { la: '', ra: '', ll: '', rl: '' },
            walk: {
                la: ' transform="rotate(-22 40 74)"',
                ra: ' transform="rotate(22 100 74)"',
                ll: ' transform="translate(-4, -5) rotate(16 55 108)"',
                rl: ' transform="translate(5, 2) rotate(-16 85 108)"'
            },
            jump: {
                la: ' transform="rotate(38 40 74) translate(-2, -5)"',
                ra: ' transform="rotate(-38 100 74) translate(2, -5)"',
                ll: ' transform="translate(-2, 4) rotate(-12 55 108)"',
                rl: ' transform="translate(2, 4) rotate(12 85 108)"'
            },
            cheer: {
                la: ' transform="rotate(110 40 74) translate(2, -4)"',
                ra: ' transform="rotate(-110 100 74) translate(-2, -4)"',
                ll: ' transform="translate(0, -3)"',
                rl: ' transform="translate(0, -3)"'
            },
            hurt: {
                la: ' transform="rotate(50 40 74)"',
                ra: ' transform="rotate(-50 100 74)"',
                ll: ' transform="rotate(-10 55 108)"',
                rl: ' transform="rotate(15 85 108)"'
            }
        }[pose] || { la: '', ra: '', ll: '', rl: '' };

        if (skinId === 'starter_fire_fox') {
            if (stage === 1) {
                return {
                    anchors: {
                        face: 'translate(0, 2)',
                        headAcc: 'translate(0, 2)',
                        neck: 'translate(0, 3)',
                        back: 'translate(0, 4)',
                        hand: 'translate(-2, 4)',
                        evoFront: 'translate(0, 6)'
                    },
                    tailSvg: `
                        <g class="pet-tail">
                            <path d="M38,94 C18,92 10,72 22,56 C27,63 32,74 42,83 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.9" />
                            <path d="M22,56 C14,48 16,37 24,43 C27,36 33,43 29,54 Z" fill="#FDE047" stroke="#EA580C" stroke-width="1.3" />
                        </g>`,
                    headBackSvg: `
                        <g class="pet-head-ears">
                            <path class="ear-left" d="M37,48 L27,13 L56,33 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linejoin="round" />
                            <path d="M40,44 L32,20 L51,35 Z" fill="url(#earInner-${uid})" />
                            <polygon points="27,13 31,23 39,20" fill="#EF4444" />
                            <path class="ear-right" d="M103,48 L113,13 L84,33 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linejoin="round" />
                            <path d="M100,44 L108,20 L89,35 Z" fill="url(#earInner-${uid})" />
                            <polygon points="113,13 109,23 101,20" fill="#EF4444" />
                        </g>`,
                    torsoSvg: `
                        <path class="svg-body" d="M37,72 C34,44 46,33 70,33 C94,33 106,44 103,72 L106,66 L101,80 C102,99 90,109 70,109 C50,109 38,99 39,80 L34,66 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linejoin="round" />
                        <ellipse cx="58" cy="43" rx="15" ry="5.5" fill="#FFFFFF" opacity="0.26" transform="rotate(-10 58 43)" />
                        <path d="M51,74 Q58,82 70,77 Q82,82 89,74 C92,89 83,104 70,104 C57,104 48,89 51,74 Z" fill="url(#bellyGrad-${uid})" stroke="${species.outline}" stroke-width="1.3" />`,
                    limbsSvg: `
                        <g${poseTf.la}><ellipse class="pet-arm-left" cx="38" cy="80" rx="6.5" ry="9" transform="rotate(18 38 80)" fill="#EA580C" stroke="${species.outline}" stroke-width="1.8" /></g>
                        <g${poseTf.ra}><ellipse class="pet-arm-right" cx="102" cy="80" rx="6.5" ry="9" transform="rotate(-18 102 80)" fill="#EA580C" stroke="${species.outline}" stroke-width="1.8" /></g>
                        <g class="pet-leg-left"${poseTf.ll}><ellipse cx="55" cy="108" rx="9" ry="5.5" fill="#C2410C" stroke="${species.outline}" stroke-width="1.8" /></g>
                        <g class="pet-leg-right"${poseTf.rl}><ellipse cx="85" cy="108" rx="9" ry="5.5" fill="#C2410C" stroke="${species.outline}" stroke-width="1.8" /></g>`,
                    headTopSvg: `<path d="M66,35 C65,24 70,19 72,27 C75,21 79,25 75,35 Z" fill="#FDE047" stroke="#EA580C" stroke-width="1.2" />`
                };
            }
            if (stage === 2) {
                return {
                    anchors: {
                        face: 'translate(70, 46) scale(0.86) translate(-70, -57)',
                        headAcc: 'translate(70, 46) scale(0.86) translate(-70, -57)',
                        neck: 'translate(70, 66) scale(0.84) translate(-70, -78)',
                        back: 'translate(70, 76) scale(0.88) translate(-70, -74)',
                        hand: 'translate(-4, -2)',
                        evoFront: 'translate(0, 2)'
                    },
                    tailSvg: `
                        <g class="pet-tail">
                            <path d="M48,88 C20,86 8,62 18,40 C26,52 34,62 50,78 Z" fill="#FF6B35" stroke="${species.outline}" stroke-width="1.9" />
                            <path d="M18,40 C12,32 18,22 25,30 C28,23 35,30 29,42 Z" fill="#FDE047" stroke="#EA580C" stroke-width="1.2" />
                            <path d="M92,88 C118,86 128,64 118,44 C112,56 104,66 90,78 Z" fill="#FF6B35" stroke="${species.outline}" stroke-width="1.9" />
                            <path d="M118,44 C124,36 118,26 111,34 C108,28 101,34 107,46 Z" fill="#FDE047" stroke="#EA580C" stroke-width="1.2" />
                        </g>`,
                    headBackSvg: `
                        <g class="pet-head-ears">
                            <path class="ear-left" d="M44,39 L24,10 L60,26 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linejoin="round" />
                            <path d="M46,36 L32,16 L56,28 Z" fill="#FEF3C7" />
                            <polygon points="24,10 30,21 38,16" fill="#DC2626" />
                            <path class="ear-right" d="M96,39 L116,10 L80,26 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linejoin="round" />
                            <path d="M94,36 L108,16 L84,28 Z" fill="#FEF3C7" />
                            <polygon points="116,10 110,21 102,16" fill="#DC2626" />
                        </g>`,
                    torsoSvg: `
                        <path class="svg-body" d="M48,66 C45,84 48,104 70,104 C92,104 95,84 92,66 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                        <path d="M52,66 Q60,79 70,73 Q80,79 88,66 L83,96 Q70,101 57,96 Z" fill="url(#bellyGrad-${uid})" />
                        <path d="M49,85 Q70,91 91,85 L90,91 Q70,96 50,91 Z" fill="#DC2626" stroke="${species.outline}" stroke-width="1.2" />
                        <path d="M42,46 C42,27 54,22 70,22 C86,22 98,27 98,46 L103,50 L96,55 C92,65 82,69 70,69 C58,69 48,65 44,55 L37,50 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linejoin="round" />
                        <ellipse cx="60" cy="30" rx="12" ry="4" fill="#FFFFFF" opacity="0.25" transform="rotate(-10 60 30)" />`,
                    limbsSvg: `
                        <g${poseTf.la}>
                            <path class="pet-arm-left" d="M49,68 C37,72 34,84 40,90 C44,92 49,84 50,76 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                            <circle cx="40" cy="87" r="4" fill="#B91C1C" stroke="${species.outline}" stroke-width="1.2" />
                        </g>
                        <g${poseTf.ra}>
                            <path class="pet-arm-right" d="M91,68 C103,72 106,84 100,90 C96,92 91,84 90,76 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                            <circle cx="100" cy="87" r="4" fill="#B91C1C" stroke="${species.outline}" stroke-width="1.2" />
                        </g>
                        <g class="pet-leg-left"${poseTf.ll}>
                            <path d="M54,99 L51,113 L62,113 L64,101 Z" fill="#9A3412" stroke="${species.outline}" stroke-width="1.8" />
                            <ellipse cx="55" cy="114" rx="8" ry="4" fill="#FEF3C7" stroke="${species.outline}" stroke-width="1.4" />
                        </g>
                        <g class="pet-leg-right"${poseTf.rl}>
                            <path d="M86,99 L89,113 L78,113 L76,101 Z" fill="#9A3412" stroke="${species.outline}" stroke-width="1.8" />
                            <ellipse cx="85" cy="114" rx="8" ry="4" fill="#FEF3C7" stroke="${species.outline}" stroke-width="1.4" />
                        </g>`,
                    headTopSvg: `<path d="M62,25 L68,12 L72,22 L77,11 L80,25 Z" fill="#FDE047" stroke="#DC2626" stroke-width="1.3" stroke-linejoin="round" />`
                };
            }
            // Stage 3: 炽天九曜灵狐
            return {
                anchors: {
                    face: 'translate(70, 40) scale(0.79) translate(-70, -57)',
                    headAcc: 'translate(70, 40) scale(0.79) translate(-70, -57)',
                    neck: 'translate(70, 60) scale(0.82) translate(-70, -78)',
                    back: 'translate(70, 70) scale(0.88) translate(-70, -74)',
                    hand: 'translate(-3, -4)',
                    evoFront: 'translate(0, -4)'
                },
                tailSvg: `
                    <g class="pet-tail">
                        <path d="M56,90 C22,96 8,70 16,52 C28,58 42,74 56,84 Z" fill="#EF4444" stroke="${species.outline}" stroke-width="1.6" />
                        <path d="M56,84 C16,74 10,44 26,28 C34,42 46,62 58,80 Z" fill="#FF6B35" stroke="${species.outline}" stroke-width="1.6" />
                        <path d="M62,78 C36,52 34,24 52,16 C56,34 62,56 66,76 Z" fill="#F97316" stroke="${species.outline}" stroke-width="1.6" />
                        <path d="M78,78 C104,52 106,24 88,16 C84,34 78,56 74,76 Z" fill="#F97316" stroke="${species.outline}" stroke-width="1.6" />
                        <path d="M84,84 C124,74 130,44 114,28 C106,42 94,62 82,80 Z" fill="#FF6B35" stroke="${species.outline}" stroke-width="1.6" />
                        <path d="M84,90 C118,96 132,70 124,52 C112,58 98,74 84,84 Z" fill="#EF4444" stroke="${species.outline}" stroke-width="1.6" />
                        <circle cx="19" cy="54" r="4" fill="#FDE047" /><circle cx="28" cy="31" r="4.5" fill="#FDE047" />
                        <circle cx="51" cy="19" r="4" fill="#FDE047" /><circle cx="89" cy="19" r="4" fill="#FDE047" />
                        <circle cx="112" cy="31" r="4.5" fill="#FDE047" /><circle cx="121" cy="54" r="4" fill="#FDE047" />
                    </g>`,
                headBackSvg: `
                    <g class="pet-head-ears">
                        <path class="ear-left" d="M48,34 L30,7 L60,22 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.9" stroke-linejoin="round" />
                        <path d="M49,31 L36,13 L57,24 Z" fill="#FEF3C7" />
                        <polygon points="30,7 35,17 42,13" fill="#FDE047" stroke="#DC2626" stroke-width="0.9" />
                        <path class="ear-right" d="M92,34 L110,7 L80,22 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.9" stroke-linejoin="round" />
                        <path d="M91,31 L104,13 L83,24 Z" fill="#FEF3C7" />
                        <polygon points="110,7 105,17 98,13" fill="#FDE047" stroke="#DC2626" stroke-width="0.9" />
                    </g>`,
                torsoSvg: `
                    <path class="svg-body" d="M47,58 C44,82 47,104 70,104 C93,104 96,82 93,58 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                    <path d="M43,60 Q56,74 70,66 Q84,74 97,60 L90,78 Q70,84 50,78 Z" fill="#FFFBEB" stroke="#D97706" stroke-width="1.4" />
                    <path d="M53,82 Q70,89 87,82 L85,91 Q70,96 55,91 Z" fill="#B91C1C" stroke="#7C2D12" stroke-width="1.2" />
                    <circle cx="70" cy="87" r="4.5" fill="url(#goldGrad-${uid})" stroke="#92400E" stroke-width="1" />
                    <path d="M45,40 C45,23 56,18 70,18 C84,18 95,23 95,40 L100,45 L93,49 C89,58 80,62 70,62 C60,62 51,58 47,49 L40,45 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linejoin="round" />`,
                limbsSvg: `
                    <g${poseTf.la}>
                        <path class="pet-arm-left" d="M48,62 C36,68 33,82 39,88 C43,90 48,80 49,71 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                        <rect x="35" y="81" width="9" height="4" rx="2" fill="#FDE047" stroke="#B45309" stroke-width="1" />
                    </g>
                    <g${poseTf.ra}>
                        <path class="pet-arm-right" d="M92,62 C104,68 107,82 101,88 C97,90 92,80 91,71 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                        <rect x="96" y="81" width="9" height="4" rx="2" fill="#FDE047" stroke="#B45309" stroke-width="1" />
                    </g>
                    <g class="pet-leg-left"${poseTf.ll}>
                        <path d="M55,100 L52,115 L63,115 L65,102 Z" fill="#9A3412" stroke="${species.outline}" stroke-width="1.8" />
                        <ellipse cx="56" cy="116" rx="8" ry="4" fill="#FDE047" stroke="#92400E" stroke-width="1.3" />
                    </g>
                    <g class="pet-leg-right"${poseTf.rl}>
                        <path d="M85,100 L88,115 L77,115 L75,102 Z" fill="#9A3412" stroke="${species.outline}" stroke-width="1.8" />
                        <ellipse cx="84" cy="116" rx="8" ry="4" fill="#FDE047" stroke="#92400E" stroke-width="1.3" />
                    </g>`,
                headTopSvg: `
                    <polygon points="70,19 74,25 70,31 66,25" fill="#FDE047" stroke="#B91C1C" stroke-width="1.1" />
                    <path d="M62,21 L67,10 L70,18 L73,10 L78,21 Z" fill="#F97316" stroke="#7C2D12" stroke-width="1.1" />`
            };
        }

        if (skinId === 'starter_water_penguin') {
            if (stage === 1) {
                return {
                    anchors: {
                        face: 'translate(0, 3)',
                        headAcc: 'translate(0, 3)',
                        neck: 'translate(0, 3)',
                        back: 'translate(0, 4)',
                        hand: 'translate(-2, 4)',
                        evoFront: 'translate(0, 7)'
                    },
                    tailSvg: `
                        <g class="pet-tail">
                            <polygon points="37,92 24,96 37,102" fill="#0369A1" stroke="${species.outline}" stroke-width="1.6" />
                            <circle cx="20" cy="78" r="5.5" fill="#E0F2FE" stroke="#38BDF8" stroke-width="1.4" />
                            <circle cx="18.5" cy="76.5" r="1.5" fill="#FFFFFF" />
                            <circle cx="14" cy="64" r="3.5" fill="#E0F2FE" stroke="#38BDF8" stroke-width="1.2" />
                        </g>`,
                    headBackSvg: `<g class="pet-head-ears"></g>`,
                    torsoSvg: `
                        <path class="svg-body" d="M36,74 C35,44 48,34 70,34 C92,34 105,44 104,74 C104,98 92,108 70,108 C48,108 36,98 36,74 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                        <path class="svg-belly" d="M44,58 C44,47 54,44 63,48 L70,53 L77,48 C86,44 96,47 96,58 C96,67 91,72 88,75 C94,81 95,94 88,101 C83,106 57,106 52,101 C45,94 46,81 52,75 C49,72 44,67 44,58 Z" fill="url(#bellyGrad-${uid})" stroke="#7DD3FC" stroke-width="1" />
                        <ellipse cx="58" cy="40" rx="13" ry="4.5" fill="#FFFFFF" opacity="0.28" transform="rotate(-8 58 40)" />`,
                    limbsSvg: `
                        <g${poseTf.la}><ellipse class="pet-arm-left" cx="35" cy="77" rx="7" ry="13" transform="rotate(24 35 77)" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" /></g>
                        <g${poseTf.ra}><ellipse class="pet-arm-right" cx="105" cy="77" rx="7" ry="13" transform="rotate(-24 105 77)" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" /></g>
                        <g class="pet-leg-left"${poseTf.ll}><ellipse cx="54" cy="109" rx="10" ry="5" fill="#F59E0B" stroke="#B45309" stroke-width="1.6" /></g>
                        <g class="pet-leg-right"${poseTf.rl}><ellipse cx="86" cy="109" rx="10" ry="5" fill="#F59E0B" stroke="#B45309" stroke-width="1.6" /></g>`,
                    headTopSvg: `<path d="M64,36 C61,27 67,23 70,30 C74,23 80,26 76,36 Z" fill="#38BDF8" stroke="${species.outline}" stroke-width="1.4" />`
                };
            }
            if (stage === 2) {
                return {
                    anchors: {
                        face: 'translate(70, 46) scale(0.86) translate(-70, -57)',
                        headAcc: 'translate(70, 46) scale(0.86) translate(-70, -57)',
                        neck: 'translate(70, 67) scale(0.84) translate(-70, -78)',
                        back: 'translate(70, 76) scale(0.88) translate(-70, -74)',
                        hand: 'translate(-4, -2)',
                        evoFront: 'translate(0, 2)'
                    },
                    tailSvg: `
                        <g class="pet-tail">
                            <path d="M46,90 C20,90 12,72 22,58 C27,68 35,76 48,82 Z" fill="#0284C7" stroke="${species.outline}" stroke-width="1.8" />
                            <path d="M22,58 C17,51 24,45 28,53 C32,46 37,53 33,61 Z" fill="#E0F2FE" stroke="#0EA5E9" stroke-width="1.2" />
                        </g>`,
                    headBackSvg: `
                        <g class="pet-head-ears">
                            <path d="M44,44 L31,34 L46,36 Z" fill="#0284C7" stroke="${species.outline}" stroke-width="1.5" />
                            <path d="M96,44 L109,34 L94,36 Z" fill="#0284C7" stroke="${species.outline}" stroke-width="1.5" />
                        </g>`,
                    torsoSvg: `
                        <path class="svg-body" d="M46,64 C41,84 46,105 70,105 C94,105 99,84 94,64 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                        <path class="svg-belly" d="M52,66 Q70,74 88,66 L85,99 Q70,104 55,99 Z" fill="url(#bellyGrad-${uid})" />
                        <path d="M46,84 Q70,91 94,84 L92,90 Q70,96 48,90 Z" fill="#38BDF8" stroke="#0369A1" stroke-width="1.2" />
                        <path d="M45,47 C45,28 56,22 70,22 C84,22 95,28 95,47 C95,60 85,68 70,68 C55,68 45,60 45,47 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                        <path d="M49,49 C49,38 58,36 65,40 L70,45 L75,40 C82,36 91,38 91,49 C91,58 82,65 70,65 C58,65 49,58 49,49 Z" fill="#FFFFFF" />`,
                    limbsSvg: `
                        <g${poseTf.la}>
                            <path class="pet-arm-left" d="M47,66 C32,74 26,90 34,94 C39,96 46,84 48,74 Z" fill="#0369A1" stroke="${species.outline}" stroke-width="1.8" />
                            <path d="M35,88 L42,76" stroke="#E0F2FE" stroke-width="1.8" stroke-linecap="round" />
                        </g>
                        <g${poseTf.ra}>
                            <path class="pet-arm-right" d="M93,66 C108,74 114,90 106,94 C101,96 94,84 92,74 Z" fill="#0369A1" stroke="${species.outline}" stroke-width="1.8" />
                            <path d="M105,88 L98,76" stroke="#E0F2FE" stroke-width="1.8" stroke-linecap="round" />
                        </g>
                        <g class="pet-leg-left"${poseTf.ll}><ellipse cx="55" cy="110" rx="10" ry="5" fill="#F59E0B" stroke="#B45309" stroke-width="1.6" /></g>
                        <g class="pet-leg-right"${poseTf.rl}><ellipse cx="85" cy="110" rx="10" ry="5" fill="#F59E0B" stroke="#B45309" stroke-width="1.6" /></g>`,
                    headTopSvg: `
                        <path d="M58,27 L55,14 L67,22 L70,10 L75,22 L85,15 L81,27 Z" fill="#38BDF8" stroke="${species.outline}" stroke-width="1.5" stroke-linejoin="round" />
                        <path d="M58,33 Q70,29 82,33" fill="none" stroke="#FBBF24" stroke-width="2.4" stroke-linecap="round" />`
                };
            }
            // Stage 3: 极光苍翼皇企鹅
            return {
                anchors: {
                    face: 'translate(70, 40) scale(0.80) translate(-70, -57)',
                    headAcc: 'translate(70, 40) scale(0.80) translate(-70, -57)',
                    neck: 'translate(70, 61) scale(0.82) translate(-70, -78)',
                    back: 'translate(70, 70) scale(0.88) translate(-70, -74)',
                    hand: 'translate(-2, -4)',
                    evoFront: 'translate(0, -3)'
                },
                tailSvg: `
                    <g class="pet-tail">
                        <polygon points="48,88 18,74 34,94 14,104 48,102" fill="#67E8F9" stroke="#0369A1" stroke-width="1.5" stroke-linejoin="round" />
                        <polygon points="92,88 122,74 106,94 126,104 92,102" fill="#67E8F9" stroke="#0369A1" stroke-width="1.5" stroke-linejoin="round" />
                    </g>`,
                headBackSvg: `
                    <g class="pet-head-ears">
                        <path d="M56,28 C44,18 30,14 22,20 C34,24 44,29 52,35 Z" fill="#FBBF24" stroke="#B45309" stroke-width="1.4" stroke-linejoin="round" />
                        <path d="M84,28 C96,18 110,14 118,20 C106,24 96,29 88,35 Z" fill="#FBBF24" stroke="#B45309" stroke-width="1.4" stroke-linejoin="round" />
                    </g>`,
                torsoSvg: `
                    <path class="svg-body" d="M45,58 C38,84 44,107 70,107 C96,107 102,84 95,58 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                    <path class="svg-belly" d="M52,61 L88,61 L84,102 Q70,106 56,102 Z" fill="url(#bellyGrad-${uid})" />
                    <path d="M44,59 Q58,72 70,64 Q82,72 96,59 L91,72 Q70,79 49,72 Z" fill="#075985" stroke="#FBBF24" stroke-width="1.5" />
                    <polygon points="70,66 75,73 70,81 65,73" fill="#22D3EE" stroke="#0C4A6E" stroke-width="1.2" />
                    <path d="M47,42 C47,23 57,18 70,18 C83,18 93,23 93,42 C93,54 84,61 70,61 C56,61 47,54 47,42 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                    <path d="M51,43 C51,33 59,31 66,35 L70,39 L74,35 C81,31 89,33 89,43 C89,51 81,58 70,58 C59,58 51,51 51,43 Z" fill="#FFFFFF" />`,
                limbsSvg: `
                    <g${poseTf.la}>
                        <path class="pet-arm-left" d="M47,60 C24,66 12,86 24,96 C32,102 44,86 48,72 Z" fill="#0284C7" stroke="${species.outline}" stroke-width="1.8" />
                        <path d="M22,90 C30,82 38,74 44,68" fill="none" stroke="#E0F2FE" stroke-width="2" stroke-linecap="round" />
                    </g>
                    <g${poseTf.ra}>
                        <path class="pet-arm-right" d="M93,60 C116,66 128,86 116,96 C108,102 96,86 92,72 Z" fill="#0284C7" stroke="${species.outline}" stroke-width="1.8" />
                        <path d="M118,90 C110,82 102,74 96,68" fill="none" stroke="#E0F2FE" stroke-width="2" stroke-linecap="round" />
                    </g>
                    <g class="pet-leg-left"${poseTf.ll}><ellipse cx="55" cy="112" rx="10" ry="5" fill="#F59E0B" stroke="#92400E" stroke-width="1.6" /></g>
                    <g class="pet-leg-right"${poseTf.rl}><ellipse cx="85" cy="112" rx="10" ry="5" fill="#F59E0B" stroke="#92400E" stroke-width="1.6" /></g>`,
                headTopSvg: `
                    <path d="M62,21 L65,10 L70,16 L75,10 L78,21 Z" fill="url(#goldGrad-${uid})" stroke="#B45309" stroke-width="1.2" />
                    <polygon points="70,19 73,24 70,29 67,24" fill="#38BDF8" stroke="#0C4A6E" stroke-width="0.9" />`
            };
        }

        // starter_grass_dino
        if (stage === 1) {
            return {
                anchors: {
                    face: 'translate(0, 3)',
                    headAcc: 'translate(0, 3)',
                    neck: 'translate(0, 3)',
                    back: 'translate(0, 4)',
                    hand: 'translate(-3, 4)',
                    evoFront: 'translate(0, 6)'
                },
                tailSvg: `
                    <g class="pet-tail">
                        <path d="M38,94 C20,94 14,82 22,72 C27,77 33,82 40,86 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                        <path d="M22,72 C14,66 19,58 26,65 C29,60 34,66 28,74 Z" fill="#4ADE80" stroke="#15803D" stroke-width="1.2" />
                    </g>`,
                headBackSvg: `<g class="pet-head-ears"></g>`,
                torsoSvg: `
                    <path class="svg-body" d="M36,74 C36,44 48,34 70,34 C92,34 104,44 104,74 C106,99 93,109 70,109 C47,109 34,99 36,74 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                    <ellipse cx="58" cy="43" rx="14" ry="5" fill="#FFFFFF" opacity="0.25" transform="rotate(-10 58 43)" />
                    <ellipse class="svg-belly" cx="70" cy="86" rx="22" ry="18" fill="url(#bellyGrad-${uid})" stroke="#A3E635" stroke-width="1.1" />
                    <path d="M55,81 Q70,84 85,81 M53,90 Q70,93 87,90" fill="none" stroke="#84CC16" stroke-width="1.4" opacity="0.7" />`,
                limbsSvg: `
                    <g${poseTf.la}><ellipse class="pet-arm-left" cx="38" cy="80" rx="6" ry="8.5" transform="rotate(16 38 80)" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" /></g>
                    <g${poseTf.ra}><ellipse class="pet-arm-right" cx="102" cy="80" rx="6" ry="8.5" transform="rotate(-16 102 80)" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" /></g>
                    <g class="pet-leg-left"${poseTf.ll}>
                        <ellipse cx="54" cy="108" rx="9.5" ry="5.5" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                        <polygon points="48,111 50,115 53,111" fill="#FEFCE8" /><polygon points="55,112 57,115 59,112" fill="#FEFCE8" />
                    </g>
                    <g class="pet-leg-right"${poseTf.rl}>
                        <ellipse cx="86" cy="108" rx="9.5" ry="5.5" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                        <polygon points="81,112 83,115 85,112" fill="#FEFCE8" /><polygon points="87,111 90,115 92,111" fill="#FEFCE8" />
                    </g>`,
                headTopSvg: `
                    <g class="dino-sprout">
                        <path d="M70,35 Q70,22 70,18" fill="none" stroke="#15803D" stroke-width="2.6" stroke-linecap="round" />
                        <path d="M70,20 C56,12 52,25 69,24 Z" fill="#4ADE80" stroke="#15803D" stroke-width="1.3" />
                        <path d="M70,20 C84,12 88,25 71,24 Z" fill="#22C55E" stroke="#15803D" stroke-width="1.3" />
                    </g>`
            };
        }
        if (stage === 2) {
            return {
                anchors: {
                    face: 'translate(70, 46) scale(0.86) translate(-70, -57)',
                    headAcc: 'translate(70, 46) scale(0.86) translate(-70, -57)',
                    neck: 'translate(70, 67) scale(0.84) translate(-70, -78)',
                    back: 'translate(70, 76) scale(0.88) translate(-70, -74)',
                    hand: 'translate(-4, -2)',
                    evoFront: 'translate(0, 2)'
                },
                tailSvg: `
                    <g class="pet-tail">
                        <path d="M48,92 C24,92 12,72 18,52 C26,64 34,74 50,82 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.9" />
                        <path d="M18,52 C10,44 16,32 24,42 C28,34 36,42 26,54 Z" fill="#84CC16" stroke="#14532D" stroke-width="1.3" />
                        <path d="M48,68 Q34,58 30,44" fill="none" stroke="#15803D" stroke-width="2.6" stroke-linecap="round" />
                        <path d="M92,68 Q106,58 110,44" fill="none" stroke="#15803D" stroke-width="2.6" stroke-linecap="round" />
                    </g>`,
                headBackSvg: `
                    <g class="pet-head-ears">
                        <polygon class="ear-left" points="45,42 30,24 53,28" fill="#16A34A" stroke="${species.outline}" stroke-width="1.6" stroke-linejoin="round" />
                        <polygon class="ear-right" points="95,42 110,24 87,28" fill="#16A34A" stroke="${species.outline}" stroke-width="1.6" stroke-linejoin="round" />
                    </g>`,
                torsoSvg: `
                    <path class="svg-body" d="M47,64 C43,84 47,104 70,104 C93,104 97,84 93,64 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                    <path class="svg-belly" d="M55,68 L85,68 L82,99 Q70,103 58,99 Z" fill="url(#bellyGrad-${uid})" />
                    <path d="M45,64 L54,74 L63,66 L70,75 L77,66 L86,74 L95,64 Q70,60 45,64 Z" fill="#4ADE80" stroke="#15803D" stroke-width="1.4" stroke-linejoin="round" />
                    <path d="M45,46 C45,27 56,22 70,22 C84,22 95,27 95,46 C95,58 85,66 70,66 C55,66 45,58 45,46 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />`,
                limbsSvg: `
                    <g${poseTf.la}>
                        <path class="pet-arm-left" d="M48,68 C36,73 34,84 40,89 C44,91 48,83 50,76 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                        <polygon points="38,87 36,92 41,89" fill="#FEFCE8" />
                    </g>
                    <g${poseTf.ra}>
                        <path class="pet-arm-right" d="M92,68 C104,73 106,84 100,89 C96,91 92,83 90,76 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                        <polygon points="102,87 104,92 99,89" fill="#FEFCE8" />
                    </g>
                    <g class="pet-leg-left"${poseTf.ll}>
                        <path d="M53,99 L51,113 L63,113 L64,101 Z" fill="#15803D" stroke="${species.outline}" stroke-width="1.8" />
                        <ellipse cx="55" cy="114" rx="8" ry="4" fill="#22C55E" stroke="${species.outline}" stroke-width="1.5" />
                    </g>
                    <g class="pet-leg-right"${poseTf.rl}>
                        <path d="M87,99 L89,113 L77,113 L76,101 Z" fill="#15803D" stroke="${species.outline}" stroke-width="1.8" />
                        <ellipse cx="85" cy="114" rx="8" ry="4" fill="#22C55E" stroke="${species.outline}" stroke-width="1.5" />
                    </g>`,
                headTopSvg: `<path d="M62,25 L66,11 L70,19 L76,10 L79,25 Z" fill="#84CC16" stroke="#14532D" stroke-width="1.3" stroke-linejoin="round" />`
            };
        }
        // Stage 3: 森之翼龙王
        return {
            anchors: {
                face: 'translate(70, 40) scale(0.79) translate(-70, -57)',
                headAcc: 'translate(70, 40) scale(0.79) translate(-70, -57)',
                neck: 'translate(70, 60) scale(0.82) translate(-70, -78)',
                back: 'translate(70, 70) scale(0.88) translate(-70, -74)',
                hand: 'translate(-3, -4)',
                evoFront: 'translate(0, -3)'
            },
            tailSvg: `
                <g class="pet-tail">
                    <path d="M46,66 L10,28 Q12,62 24,84 L48,78 Z" fill="#4ADE80" stroke="#14532D" stroke-width="1.8" stroke-linejoin="round" />
                    <path d="M44,68 L14,34 M38,73 L18,56 M38,76 L24,74" stroke="#FDE047" stroke-width="1.4" stroke-linecap="round" />
                    <path d="M94,66 L130,28 Q128,62 116,84 L92,78 Z" fill="#4ADE80" stroke="#14532D" stroke-width="1.8" stroke-linejoin="round" />
                    <path d="M96,68 L126,34 M102,73 L122,56 M102,76 L116,74" stroke="#FDE047" stroke-width="1.4" stroke-linecap="round" />
                    <path d="M48,94 C20,96 10,74 20,56 C27,68 37,78 52,86 Z" fill="#16A34A" stroke="${species.outline}" stroke-width="1.8" />
                    <polygon points="20,56 16,46 24,49 28,42 30,52" fill="#FDE047" stroke="#B45309" stroke-width="1" />
                </g>`,
            headBackSvg: `
                <g class="pet-head-ears">
                    <path d="M54,24 C45,12 32,8 26,15 C36,19 44,24 50,31 Z" fill="#84CC16" stroke="#14532D" stroke-width="1.6" />
                    <path d="M86,24 C95,12 108,8 114,15 C104,19 96,24 90,31 Z" fill="#84CC16" stroke="#14532D" stroke-width="1.6" />
                </g>`,
            torsoSvg: `
                <path class="svg-body" d="M46,58 C41,84 46,105 70,105 C94,105 99,84 94,58 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                <path class="svg-belly" d="M55,63 L85,63 L82,100 Q70,104 58,100 Z" fill="url(#bellyGrad-${uid})" />
                <path d="M43,58 L54,70 L64,61 L70,71 L76,61 L86,70 L97,58 Q70,54 43,58 Z" fill="#15803D" stroke="#FDE047" stroke-width="1.3" />
                <polygon points="70,68 75,75 70,82 65,75" fill="#FDE047" stroke="#92400E" stroke-width="1.1" />
                <path d="M46,41 C46,23 56,18 70,18 C84,18 94,23 94,41 C94,53 84,60 70,60 C56,60 46,53 46,41 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />`,
            limbsSvg: `
                <g${poseTf.la}>
                    <path class="pet-arm-left" d="M48,63 C35,69 34,82 40,88 C44,90 48,80 50,71 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                    <rect x="35" y="79" width="9" height="4" rx="2" fill="#84CC16" stroke="#14532D" stroke-width="1" />
                </g>
                <g${poseTf.ra}>
                    <path class="pet-arm-right" d="M92,63 C105,69 106,82 100,88 C96,90 92,80 90,71 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                    <rect x="96" y="79" width="9" height="4" rx="2" fill="#84CC16" stroke="#14532D" stroke-width="1" />
                </g>
                <g class="pet-leg-left"${poseTf.ll}>
                    <path d="M54,99 L51,115 L63,115 L65,101 Z" fill="#15803D" stroke="${species.outline}" stroke-width="1.8" />
                    <ellipse cx="55" cy="116" rx="8.5" ry="4" fill="#84CC16" stroke="#14532D" stroke-width="1.4" />
                </g>
                <g class="pet-leg-right"${poseTf.rl}>
                    <path d="M86,99 L89,115 L77,115 L75,101 Z" fill="#15803D" stroke="${species.outline}" stroke-width="1.8" />
                    <ellipse cx="85" cy="116" rx="8.5" ry="4" fill="#84CC16" stroke="#14532D" stroke-width="1.4" />
                </g>`,
            headTopSvg: `
                <path d="M62,21 L66,9 L70,15 L74,9 L78,21 Z" fill="url(#goldGrad-${uid})" stroke="#14532D" stroke-width="1.2" />
                <polygon points="70,18 73,23 70,28 67,23" fill="#A3E635" stroke="#14532D" stroke-width="0.9" />`
        };
    },

    renderSpeciesTail(skinId, species, uid) {
        switch (skinId) {
            case 'shiba_sunny':
                // 柴犬卷卷甜甜圈尾巴
                return `<path class="pet-tail" d="M36,88 C18,84 14,62 28,56 C38,52 42,66 34,72 C28,76 26,68 32,65" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linecap="round" />`;
            case 'capybara_zen':
                // 卡皮巴拉呆萌小短圆臀（几乎无尾，有个小圆球）
                return `<circle class="pet-tail" cx="35" cy="94" r="5" fill="${species.bodyDark}" stroke="${species.outline}" stroke-width="1.5" />`;
            case 'mech_dog':
                // 赛博机械闪电能量尾
                return `
                    <g class="pet-tail">
                        <polyline points="36,88 20,76 26,68 14,54" fill="none" stroke="#00E5FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
                        <circle cx="14" cy="54" r="4" fill="#80DEEA" stroke="#00838F" stroke-width="1.5" />
                    </g>
                `;
            case 'bamboo_panda':
                // 熊猫黑色小圆球尾
                return `<circle class="pet-tail" cx="34" cy="92" r="7" fill="#1E293B" />`;
            case 'chubby_penguin':
                // 企鹅小短三角尾
                return `<polygon class="pet-tail" points="36,92 24,96 36,102" fill="${species.bodyDark}" stroke="${species.outline}" stroke-width="1.5" />`;
            case 'fire_dragon':
                // 飞龙火焰尾
                return `
                    <g class="pet-tail">
                        <path d="M38,92 C20,90 12,74 18,58 C22,68 28,76 38,82 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                        <path d="M18,58 C10,50 14,36 22,42 C26,34 32,44 26,54 Z" fill="#FFEB3B" stroke="#F57F17" stroke-width="1.2" />
                    </g>
                `;
            case 'ice_spirit':
                // 雪鹿蓬松雪花尾
                return `
                    <g class="pet-tail">
                        <path d="M36,88 Q16,78 22,64 Q32,68 38,80 Z" fill="#E0F7FA" stroke="${species.outline}" stroke-width="1.5" />
                        <circle cx="21" cy="65" r="3" fill="#FFFFFF" />
                    </g>
                `;
            case 'magic_fox':
                // 九尾狐华丽三瓣蓬松灵尾
                return `
                    <g class="pet-tail">
                        <path d="M38,92 C12,84 6,56 22,48 C30,44 36,60 38,76 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.5" />
                        <path d="M36,96 C8,96 4,74 18,66 C26,62 34,74 36,88 Z" fill="#F472B6" stroke="${species.outline}" stroke-width="1.5" />
                        <path d="M22,48 C16,52 16,60 24,60 C28,56 26,50 22,48 Z" fill="#FFF1F2" />
                        <path d="M18,66 C12,70 14,78 20,76 C24,72 22,68 18,66 Z" fill="#FFF1F2" />
                    </g>
                `;
            case 'sky_dragon':
                // 圣霄龙云纹修长龙尾
                return `
                    <g class="pet-tail">
                        <path d="M36,90 C14,86 8,60 22,46 C28,40 34,50 28,64 C24,72 30,80 36,84 Z" fill="url(#goldGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                        <path d="M22,46 C14,38 22,28 28,36 C34,30 36,42 26,48 Z" fill="#80D8FF" />
                    </g>
                `;
            default:
                // 猫咪家族经典灵动翘尾
                return `<path class="pet-tail svg-tail" d="M36,90 C18,84 12,62 24,54 C30,50 36,58 32,70 C30,76 32,82 36,86 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />`;
        }
    },

    renderSpeciesHeadBack(skinId, species, uid) {
        switch (skinId) {
            case 'capybara_zen':
                // 卡皮巴拉圆润小侧耳
                return `
                    <ellipse class="ear-left" cx="42" cy="42" rx="7" ry="5" transform="rotate(-25 42 42)" fill="${species.bodyDark}" stroke="${species.outline}" stroke-width="1.8" />
                    <ellipse class="ear-right" cx="98" cy="42" rx="7" ry="5" transform="rotate(25 98 42)" fill="${species.bodyDark}" stroke="${species.outline}" stroke-width="1.8" />
                `;
            case 'bamboo_panda':
                // 大熊猫标志性黑圆耳
                return `
                    <circle class="ear-left" cx="44" cy="36" r="11" fill="#1E293B" stroke="#0F172A" stroke-width="2" />
                    <circle class="ear-left" cx="44" cy="36" r="5" fill="#475569" />
                    <circle class="ear-right" cx="96" cy="36" r="11" fill="#1E293B" stroke="#0F172A" stroke-width="2" />
                    <circle class="ear-right" cx="96" cy="36" r="5" fill="#475569" />
                `;
            case 'chubby_penguin':
                // 企鹅没有外耳，两侧有可爱的小翅膀拍动
                return `
                    <path class="ear-left" d="M36,64 C22,70 20,90 30,94 C36,96 38,82 38,72 Z" fill="${species.bodyDark}" stroke="${species.outline}" stroke-width="1.8" />
                    <path class="ear-right" d="M104,64 C118,70 120,90 110,94 C104,96 102,82 102,72 Z" fill="${species.bodyDark}" stroke="${species.outline}" stroke-width="1.8" />
                `;
            case 'mech_dog':
                // 赛博机械犬装甲折耳与信号天线
                return `
                    <g class="ear-left">
                        <polygon points="38,48 34,20 56,36" fill="#455A64" stroke="${species.outline}" stroke-width="2" />
                        <polygon points="40,44 38,26 52,36" fill="#00E5FF" />
                    </g>
                    <g class="ear-right">
                        <polygon points="102,48 106,20 84,36" fill="#455A64" stroke="${species.outline}" stroke-width="2" />
                        <polygon points="100,44 102,26 88,36" fill="#00E5FF" />
                    </g>
                `;
            case 'fire_dragon':
                // 炽焰飞龙：弯曲金龙角 + 背部小火翼
                return `
                    <path d="M36,68 C16,52 12,72 26,82 C20,88 30,94 38,86 Z" fill="#FFAB00" stroke="${species.outline}" stroke-width="1.6" />
                    <path d="M104,68 C124,52 128,72 114,82 C120,88 110,94 102,86 Z" fill="#FFAB00" stroke="${species.outline}" stroke-width="1.6" />
                    <path class="ear-left" d="M48,38 C40,22 44,12 54,18 C52,26 56,32 58,36 Z" fill="url(#goldGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                    <path class="ear-right" d="M92,38 C100,22 96,12 86,18 C88,26 84,32 82,36 Z" fill="url(#goldGrad-${uid})" stroke="${species.outline}" stroke-width="1.8" />
                `;
            case 'ice_spirit':
                // 极光雪鹿姬：珊瑚冰晶鹿角 + 修长精灵耳
                return `
                    <ellipse class="ear-left" cx="36" cy="46" rx="10" ry="4.5" transform="rotate(-20 36 46)" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.6" />
                    <ellipse class="ear-right" cx="104" cy="46" rx="10" ry="4.5" transform="rotate(20 104 46)" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="1.6" />
                    <path class="ear-left" d="M54,36 L44,14 M48,24 L38,20 M50,18 L56,12" fill="none" stroke="#E0F7FA" stroke-width="4" stroke-linecap="round" />
                    <path class="ear-right" d="M86,36 L96,14 M92,24 L102,20 M90,18 L84,12" fill="none" stroke="#E0F7FA" stroke-width="4" stroke-linecap="round" />
                `;
            case 'magic_fox':
                // 九尾狐修长高耸狐耳
                return `
                    <g class="ear-left">
                        <path d="M36,48 C32,24 42,10 60,36 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                        <path d="M40,44 C38,28 44,18 56,36 Z" fill="url(#earInner-${uid})" />
                    </g>
                    <g class="ear-right">
                        <path d="M104,48 C108,24 98,10 80,36 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" />
                        <path d="M100,44 C102,28 96,18 84,36 Z" fill="url(#earInner-${uid})" />
                    </g>
                `;
            case 'sky_dragon':
                // 云端圣霄龙：神圣龙角与流云耳翼
                return `
                    <path class="ear-left" d="M40,46 C22,38 20,26 36,32 C32,40 38,44 42,46 Z" fill="#FFF8E1" stroke="${species.outline}" stroke-width="1.6" />
                    <path class="ear-right" d="M100,46 C118,38 120,26 104,32 C108,40 102,44 98,46 Z" fill="#FFF8E1" stroke="${species.outline}" stroke-width="1.6" />
                    <path d="M56,35 L46,12 L54,20 L60,14 L62,34 Z" fill="url(#goldGrad-${uid})" stroke="${species.outline}" stroke-width="1.5" />
                    <path d="M84,35 L94,12 L86,20 L80,14 L78,34 Z" fill="url(#goldGrad-${uid})" stroke="${species.outline}" stroke-width="1.5" />
                `;
            default:
                // 猫咪/柴犬圆润三角耳
                return `
                    <g class="ear-left">
                        <path d="M38,48 Q42,16 48,18 Q60,22 64,36 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linejoin="round" />
                        <path d="M42,44 Q45,24 49,25 Q57,28 60,36 Z" fill="url(#earInner-${uid})" />
                    </g>
                    <g class="ear-right">
                        <path d="M102,48 Q98,16 92,18 Q80,22 76,36 Z" fill="url(#bodyGrad-${uid})" stroke="${species.outline}" stroke-width="2" stroke-linejoin="round" />
                        <path d="M98,44 Q95,24 91,25 Q83,28 80,36 Z" fill="url(#earInner-${uid})" />
                    </g>
                `;
        }
    },

    renderSpeciesBodyDecor(skinId, species, uid) {
        switch (skinId) {
            case 'default_cat':
                // 橘猫额头王字虎斑纹
                return `
                    <path d="M63,38 L77,38 M65,42 L75,42 M70,35 L70,45" stroke="#D84315" stroke-width="2.2" stroke-linecap="round" opacity="0.65" />
                `;
            case 'shiba_sunny':
                // 柴犬标志性白脸颊与圆豆眉
                return `
                    <path d="M38,68 Q52,58 62,68 Q70,74 78,68 Q88,58 102,68 C100,94 88,108 70,108 C52,108 40,94 38,68 Z" fill="#FFFDF7" opacity="0.92" />
                    <ellipse cx="55" cy="46" rx="4.5" ry="2.5" fill="#FFFDF7" />
                    <ellipse cx="85" cy="46" rx="4.5" ry="2.5" fill="#FFFDF7" />
                `;
            case 'capybara_zen':
                // 卡皮巴拉大鼻子嘴巴敦实区域
                return `
                    <ellipse cx="70" cy="64" rx="16" ry="12" fill="#8D5B34" opacity="0.45" />
                `;
            case 'mech_dog':
                // 赛博机械犬胸口能量核心与机甲装甲线
                return `
                    <path d="M44,50 L56,44 M96,50 L84,44" stroke="#00E5FF" stroke-width="2" stroke-linecap="round" />
                    <circle cx="70" cy="84" r="9" fill="#00E5FF" stroke="#FFFFFF" stroke-width="2" />
                    <circle cx="70" cy="84" r="4" fill="#FFFFFF" />
                `;
            case 'bamboo_panda':
                // 大熊猫肩部黑挂带与黑眼圈基底
                return `
                    <path d="M37,68 Q70,78 103,68 L104,78 Q70,88 36,78 Z" fill="#1E293B" />
                    <ellipse cx="54" cy="57" rx="9" ry="11" transform="rotate(-15 54 57)" fill="#1E293B" />
                    <ellipse cx="86" cy="57" rx="9" ry="11" transform="rotate(15 86 57)" fill="#1E293B" />
                `;
            case 'chubby_penguin':
                // 企鹅心形白脸膛
                return `
                    <path d="M44,58 C44,44 58,44 70,54 C82,44 96,44 96,58 C96,86 86,106 70,106 C54,106 44,86 44,58 Z" fill="#FFFFFF" />
                `;
            case 'fire_dragon':
                // 小飞龙肚皮横纹
                return `
                    <path d="M54,78 Q70,82 86,78 M52,86 Q70,90 88,86 M56,94 Q70,98 84,94" fill="none" stroke="#F57F17" stroke-width="1.6" stroke-linecap="round" opacity="0.6" />
                `;
            case 'ice_spirit':
                // 雪鹿额头冰晶棱镜与梅花雪点
                return `
                    <polygon points="70,37 74,43 70,49 66,43" fill="#E0F7FA" stroke="#00BCD4" stroke-width="1.2" />
                    <circle cx="44" cy="80" r="2.5" fill="#FFFFFF" opacity="0.8" />
                    <circle cx="50" cy="86" r="2" fill="#FFFFFF" opacity="0.8" />
                    <circle cx="96" cy="80" r="2.5" fill="#FFFFFF" opacity="0.8" />
                    <circle cx="90" cy="86" r="2" fill="#FFFFFF" opacity="0.8" />
                `;
            case 'magic_fox':
                // 九尾狐额间红梅花钿
                return `
                    <path d="M70,38 C72,42 74,44 70,48 C66,44 68,42 70,38 Z" fill="#E11D48" />
                    <circle cx="65" cy="43" r="1.5" fill="#FB7185" />
                    <circle cx="75" cy="43" r="1.5" fill="#FB7185" />
                `;
            case 'lucky_cat':
                // 招财猫额头金判与红金项圈
                return `
                    <ellipse cx="70" cy="41" rx="6" ry="3.5" fill="#FFD700" stroke="#B45309" stroke-width="1.2" />
                    <path d="M42,74 Q70,82 98,74" fill="none" stroke="#DC2626" stroke-width="4" stroke-linecap="round" />
                    <circle cx="70" cy="78" r="5" fill="#FFD700" stroke="#B45309" stroke-width="1.2" />
                `;
            case 'sky_dragon':
                // 圣霄龙额头龙珠与祥云纹
                return `
                    <circle cx="70" cy="41" r="4.5" fill="#80D8FF" stroke="#0288D1" stroke-width="1.2" />
                    <path d="M56,82 Q70,76 84,82 M54,90 Q70,84 86,90" fill="none" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round" opacity="0.5" />
                `;
            default:
                return '';
        }
    },

    renderSpeciesLimbs(skinId, species, uid, pose = 'idle') {
        const pawFill = skinId === 'bamboo_panda' ? '#1E293B' : (skinId === 'chubby_penguin' ? '#FF9800' : `url(#bodyGrad-${uid})`);
        const pawStroke = skinId === 'bamboo_panda' ? '#0F172A' : species.outline;

        // 招财猫左爪高举摇动
        const leftArm = skinId === 'lucky_cat'
            ? `<ellipse class="pet-arm-left" cx="36" cy="64" rx="7" ry="10" transform="rotate(-25 36 64)" fill="${pawFill}" stroke="${pawStroke}" stroke-width="1.8" />`
            : `<ellipse class="pet-arm-left" cx="38" cy="78" rx="6" ry="9" transform="rotate(15 38 78)" fill="${pawFill}" stroke="${pawStroke}" stroke-width="1.8" />`;

        const rightArm = `<ellipse class="pet-arm-right" cx="102" cy="78" rx="6" ry="9" transform="rotate(-15 102 78)" fill="${pawFill}" stroke="${pawStroke}" stroke-width="1.8" />`;

        const poseTransforms = {
            idle: { la: '', ra: '', ll: '', rl: '' },
            walk: {
                la: ' transform="rotate(-24 38 72)"',
                ra: ' transform="rotate(24 102 72)"',
                ll: ' transform="translate(-4, -5) rotate(18 54 108)"',
                rl: ' transform="translate(5, 2) rotate(-18 86 108)"'
            },
            jump: {
                la: ' transform="rotate(42 38 72) translate(-2, -6)"',
                ra: ' transform="rotate(-42 102 72) translate(2, -6)"',
                ll: ' transform="translate(-2, 4) rotate(-12 54 108)"',
                rl: ' transform="translate(2, 4) rotate(12 86 108)"'
            },
            cheer: {
                la: ' transform="rotate(115 38 72) translate(2, -4)"',
                ra: ' transform="rotate(-115 102 72) translate(-2, -4)"',
                ll: ' transform="translate(0, -3)"',
                rl: ' transform="translate(0, -3)"'
            },
            hurt: {
                la: ' transform="rotate(55 38 72)"',
                ra: ' transform="rotate(-55 102 72)"',
                ll: ' transform="rotate(-10 54 108)"',
                rl: ' transform="rotate(15 86 108)"'
            }
        }[pose] || { la: '', ra: '', ll: '', rl: '' };

        return `
            <g${poseTransforms.la}>${leftArm}</g>
            <g${poseTransforms.ra}>${rightArm}</g>
            <g class="pet-leg-left"${poseTransforms.ll}>
                <ellipse class="pet-paw-front" cx="54" cy="108" rx="9" ry="5.5" fill="${pawFill}" stroke="${pawStroke}" stroke-width="1.8" />
                <ellipse cx="54" cy="109" rx="4" ry="2.2" fill="#FFCDD2" opacity="0.6" />
            </g>
            <g class="pet-leg-right"${poseTransforms.rl}>
                <ellipse class="pet-paw-back" cx="86" cy="108" rx="9" ry="5.5" fill="${pawFill}" stroke="${pawStroke}" stroke-width="1.8" />
                <ellipse cx="86" cy="109" rx="4" ry="2.2" fill="#FFCDD2" opacity="0.6" />
            </g>
        `;
    },

    renderSpeciesHeadTop(skinId, species, uid) {
        if (skinId === 'capybara_zen') {
            // 卡皮巴拉头顶标志性温泉小橘子
            return `
                <g class="capy-orange">
                    <ellipse cx="70" cy="27" rx="9" ry="7" fill="#FF9800" stroke="#E65100" stroke-width="1.5" />
                    <path d="M70,20 Q76,15 78,20 Q74,23 70,20 Z" fill="#4CAF50" stroke="#2E7D32" stroke-width="1" />
                </g>
            `;
        }
        if (skinId === 'astro_cat') {
            // 星际领航喵透明宇航头罩高光环
            return `
                <g class="astro-helmet" pointer-events="none">
                    <circle cx="70" cy="56" r="39" fill="#E0F7FA" fill-opacity="0.14" stroke="#80DEEA" stroke-width="2.2" stroke-dasharray="180 20" />
                    <path d="M44,36 Q56,24 76,26" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.65" />
                </g>
            `;
        }
        return '';
    },

    renderEyes(eyeType, skinId, species, uid) {
        const eyeFill = species.eyeColor || '#1E1E1E';
        switch (eyeType) {
            case 'face_eye_star':
                return `
                    <g class="pet-eye">
                        <ellipse cx="54" cy="57" rx="6.5" ry="7.5" fill="${eyeFill}" />
                        <polygon points="54,51 55.5,55 59.5,55 56.5,57.5 57.5,61.5 54,59 50.5,61.5 51.5,57.5 48.5,55 52.5,55" fill="#FFD740" />
                        <circle cx="51" cy="53" r="1.8" fill="#FFFFFF" />
                    </g>
                    <g class="pet-eye">
                        <ellipse cx="86" cy="57" rx="6.5" ry="7.5" fill="${eyeFill}" />
                        <polygon points="86,51 87.5,55 91.5,55 88.5,57.5 89.5,61.5 86,59 82.5,61.5 83.5,57.5 80.5,55 84.5,55" fill="#FFD740" />
                        <circle cx="83" cy="53" r="1.8" fill="#FFFFFF" />
                    </g>
                `;
            case 'face_eye_happy':
                return `
                    <g class="pet-eye">
                        <path d="M47,58 Q54,49 61,58" fill="none" stroke="${eyeFill}" stroke-width="3.2" stroke-linecap="round" />
                    </g>
                    <g class="pet-eye">
                        <path d="M79,58 Q86,49 93,58" fill="none" stroke="${eyeFill}" stroke-width="3.2" stroke-linecap="round" />
                    </g>
                `;
            case 'face_eye_wink':
                return `
                    <g class="pet-eye">
                        <ellipse cx="54" cy="57" rx="6" ry="7" fill="${eyeFill}" />
                        <circle cx="52" cy="54" r="2.4" fill="#FFFFFF" />
                        <circle cx="56" cy="59" r="1.2" fill="#FFFFFF" />
                    </g>
                    <g class="pet-eye">
                        <path d="M79,55 L88,58 L79,61" fill="none" stroke="${eyeFill}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                    </g>
                `;
            case 'face_eye_cool':
                return `
                    <g class="pet-eye">
                        <path d="M47,55 L61,55" stroke="${eyeFill}" stroke-width="3.2" stroke-linecap="round" />
                        <path d="M49,55 A5,5 0 0,0 59,55 Z" fill="${eyeFill}" />
                    </g>
                    <g class="pet-eye">
                        <path d="M79,55 L93,55" stroke="${eyeFill}" stroke-width="3.2" stroke-linecap="round" />
                        <path d="M81,55 A5,5 0 0,0 91,55 Z" fill="${eyeFill}" />
                    </g>
                `;
            case 'face_eye_sparkle':
                return `
                    <g class="pet-eye">
                        <ellipse cx="54" cy="57" rx="7" ry="8" fill="${eyeFill}" />
                        <circle cx="51.5" cy="53.5" r="3" fill="#FFFFFF" />
                        <circle cx="56.5" cy="59.5" r="1.8" fill="#FFFFFF" />
                        <circle cx="52" cy="60" r="1" fill="#80D8FF" />
                    </g>
                    <g class="pet-eye">
                        <ellipse cx="86" cy="57" rx="7" ry="8" fill="${eyeFill}" />
                        <circle cx="83.5" cy="53.5" r="3" fill="#FFFFFF" />
                        <circle cx="88.5" cy="59.5" r="1.8" fill="#FFFFFF" />
                        <circle cx="84" cy="60" r="1" fill="#80D8FF" />
                    </g>
                `;
            default:
                return `
                    <g class="pet-eye">
                        <ellipse cx="54" cy="57" rx="5.8" ry="6.8" fill="${eyeFill}" />
                        <circle cx="52" cy="54.5" r="2.2" fill="#FFFFFF" />
                        <circle cx="56" cy="59" r="1.1" fill="#FFFFFF" opacity="0.8" />
                    </g>
                    <g class="pet-eye">
                        <ellipse cx="86" cy="57" rx="5.8" ry="6.8" fill="${eyeFill}" />
                        <circle cx="84" cy="54.5" r="2.2" fill="#FFFFFF" />
                        <circle cx="88" cy="59" r="1.1" fill="#FFFFFF" opacity="0.8" />
                    </g>
                `;
        }
    },

    renderNoseAndMouth(mouthType, skinId, species, uid) {
        // 企鹅专属黄扁嘴喙
        if (skinId === 'chubby_penguin' || skinId === 'starter_water_penguin') {
            return `
                <g class="pet-mouth">
                    <ellipse cx="70" cy="64" rx="6" ry="3.5" fill="#FFB300" stroke="#E65100" stroke-width="1.2" />
                    ${mouthType === 'face_mouth_grin' || mouthType === 'face_mouth_blep' ? '<path d="M66,66 Q70,71 74,66 Z" fill="#FF5252" />' : ''}
                </g>
            `;
        }

        const nose = skinId === 'starter_grass_dino'
            ? `<circle cx="66.5" cy="64" r="1.3" fill="#14532D" /><circle cx="73.5" cy="64" r="1.3" fill="#14532D" />`
            : `<polygon points="67,63 73,63 70,66" fill="${skinId === 'starter_fire_fox' ? '#431407' : '#FF7043'}" />`;
        switch (mouthType) {
            case 'face_mouth_grin':
                return `
                    <g class="pet-mouth">
                        ${nose}
                        <path d="M63,67 Q70,75 77,67 Z" fill="#FF5252" stroke="#5D4037" stroke-width="1.5" stroke-linejoin="round" />
                        <path d="M66,70 Q70,73 74,70" fill="#FF8A80" />
                    </g>
                `;
            case 'face_mouth_blep':
                return `
                    <g class="pet-mouth">
                        ${nose}
                        <path d="M63,67 Q66.5,70 70,67 Q73.5,70 77,67" fill="none" stroke="#5D4037" stroke-width="1.8" stroke-linecap="round" />
                        <path d="M68,68 C68,74 74,74 74,68 Z" fill="#FF6B8B" stroke="#C2185B" stroke-width="1.2" />
                    </g>
                `;
            case 'face_mouth_owo':
                return `
                    <g class="pet-mouth">
                        ${nose}
                        <ellipse cx="70" cy="70" rx="3.5" ry="4" fill="#FF5252" stroke="#5D4037" stroke-width="1.5" />
                    </g>
                `;
            case 'face_mouth_fang':
                return `
                    <g class="pet-mouth">
                        ${nose}
                        <path d="M63,67 Q70,71 77,66" fill="none" stroke="#5D4037" stroke-width="1.8" stroke-linecap="round" />
                        <polygon points="73,68 75,72 76.5,67.5" fill="#FFFFFF" stroke="#5D4037" stroke-width="1" />
                    </g>
                `;
            case 'face_mouth_calm':
                return `
                    <g class="pet-mouth">
                        ${nose}
                        <path d="M65,68 Q70,70 75,68" fill="none" stroke="#5D4037" stroke-width="1.8" stroke-linecap="round" />
                    </g>
                `;
            default:
                return `
                    <g class="pet-mouth">
                        ${nose}
                        <path d="M63,67 Q66.5,71 70,67 Q73.5,71 77,67" fill="none" stroke="#5D4037" stroke-width="1.8" stroke-linecap="round" />
                    </g>
                `;
        }
    },

    renderCheeks(cheekType, skinId, species, uid) {
        const baseBlush = `
            <ellipse cx="44" cy="65" rx="6" ry="3.5" fill="url(#blushGrad-${uid})" />
            <ellipse cx="96" cy="65" rx="6" ry="3.5" fill="url(#blushGrad-${uid})" />
        `;
        switch (cheekType) {
            case 'face_cheek_whiskers':
                return `
                    ${baseBlush}
                    <path d="M32,62 L41,64 M31,67 L41,67 M108,62 L99,64 M109,67 L99,67" stroke="${species.outline}" stroke-width="1.5" stroke-linecap="round" opacity="0.65" />
                `;
            case 'face_cheek_stars':
                return `
                    ${baseBlush}
                    <polygon points="41,61 42.3,63.7 45.2,64.1 43.1,66.1 43.6,69 41,67.6 38.4,69 38.9,66.1 36.8,64.1 39.7,63.7" fill="#FBBF24" stroke="#D97706" stroke-width="0.6" />
                    <polygon points="99,61 100.3,63.7 103.2,64.1 101.1,66.1 101.6,69 99,67.6 96.4,69 96.9,66.1 94.8,64.1 97.7,63.7" fill="#FBBF24" stroke="#D97706" stroke-width="0.6" />
                `;
            case 'face_cheek_hearts':
                return `
                    ${baseBlush}
                    <path d="M44,64 C42,62 40,64 44,67 C48,64 46,62 44,64 Z" fill="#EC407A" />
                    <path d="M96,64 C94,62 92,64 96,67 C100,64 98,62 96,64 Z" fill="#EC407A" />
                `;
            case 'face_cheek_bandaid':
                return `
                    ${baseBlush}
                    <rect x="78" y="61" width="12" height="5" rx="2" transform="rotate(-18 84 63.5)" fill="#FFCCBC" stroke="#D84315" stroke-width="1" />
                    <line x1="82" y1="61" x2="83" y2="65" stroke="#D84315" stroke-width="0.8" />
                `;
            case 'face_cheek_bolt':
                return `
                    ${baseBlush}
                    <polyline points="41,62 45,65 42,66 46,69" fill="none" stroke="#00E5FF" stroke-width="1.6" stroke-linecap="round" />
                    <polyline points="99,62 95,65 98,66 94,69" fill="none" stroke="#00E5FF" stroke-width="1.6" stroke-linecap="round" />
                `;
            default:
                return baseBlush;
        }
    },

    renderEvolutionBack(level, species, uid) {
        if (level < 7) return '';
        // Lv.7~10 觉醒期神圣星环
        return `
            <g class="evo-awakened-halo" opacity="0.85">
                <circle cx="70" cy="70" r="56" fill="none" stroke="url(#goldGrad-${uid})" stroke-width="2" stroke-dasharray="8 6" />
                <circle cx="70" cy="70" r="50" fill="none" stroke="#FFF59D" stroke-width="1" opacity="0.6" />
            </g>
        `;
    },

    renderEvolutionFront(level, species, uid) {
        if (level < 4) return '';
        // Lv.4+ 进阶荣耀星芒印记（位于胸前小勋章）
        return `
            <g class="evo-crest" title="进阶成长印记">
                <polygon points="70,92 72,96 76,96 73,99 74,103 70,100.5 66,103 67,99 64,96 68,96" fill="url(#goldGrad-${uid})" stroke="#B45309" stroke-width="0.8" />
            </g>
        `;
    },

    renderAuraLayer(accSet, uid) {
        let html = '';
        const drawSparkle = (cx, cy, r = 5, fill = '#FDE047') =>
            `<path d="M${cx},${cy - r} Q${cx},${cy} ${cx + r},${cy} Q${cx},${cy} ${cx},${cy + r} Q${cx},${cy} ${cx - r},${cy} Q${cx},${cy} ${cx},${cy - r} Z" fill="${fill}" stroke="#F59E0B" stroke-width="0.6" />`;
        const drawSakura = (cx, cy, s = 1) => `
            <g transform="translate(${cx},${cy}) scale(${s})">
                <ellipse cx="0" cy="-4.5" rx="2.4" ry="3.8" fill="#F9A8D4" stroke="#EC4899" stroke-width="0.6" />
                <ellipse cx="4.2" cy="-1.4" rx="2.4" ry="3.8" transform="rotate(72 4.2 -1.4)" fill="#FBCFE8" stroke="#EC4899" stroke-width="0.6" />
                <ellipse cx="2.6" cy="3.6" rx="2.4" ry="3.8" transform="rotate(144 2.6 3.6)" fill="#F9A8D4" stroke="#EC4899" stroke-width="0.6" />
                <ellipse cx="-2.6" cy="3.6" rx="2.4" ry="3.8" transform="rotate(-144 -2.6 3.6)" fill="#FBCFE8" stroke="#EC4899" stroke-width="0.6" />
                <ellipse cx="-4.2" cy="-1.4" rx="2.4" ry="3.8" transform="rotate(-72 -4.2 -1.4)" fill="#F9A8D4" stroke="#EC4899" stroke-width="0.6" />
                <circle cx="0" cy="0" r="1.8" fill="#FEF08A" />
            </g>`;
        const drawNote = (cx, cy, color = '#8B5CF6') => `
            <g transform="translate(${cx},${cy})">
                <ellipse cx="-2.5" cy="4" rx="3" ry="2.2" transform="rotate(-20 -2.5 4)" fill="${color}" />
                <path d="M0,4 L0,-6 L6,-4 L6,-1 L0,-3" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </g>`;
        const drawSnow = (cx, cy, r = 5) => `
            <g transform="translate(${cx},${cy})" stroke="#7DD3FC" stroke-width="1.5" stroke-linecap="round">
                <line x1="0" y1="${-r}" x2="0" y2="${r}" />
                <line x1="${-r * 0.86}" y1="${-r * 0.5}" x2="${r * 0.86}" y2="${r * 0.5}" />
                <line x1="${-r * 0.86}" y1="${r * 0.5}" x2="${r * 0.86}" y2="${-r * 0.5}" />
                <circle cx="0" cy="0" r="1.6" fill="#E0F2FE" stroke="none" />
            </g>`;

        if (accSet.has('aura_stars')) {
            html += `
                <g class="acc-aura-layer">
                    <ellipse cx="70" cy="74" rx="56" ry="20" transform="rotate(-16 70 74)" fill="none" stroke="#FFD54F" stroke-width="2" stroke-dasharray="10 6" />
                    ${drawSparkle(20, 38, 6.5, '#FDE047')}
                    ${drawSparkle(116, 36, 5.5, '#FEF08A')}
                    ${drawSparkle(118, 96, 5, '#FDE047')}
                </g>
            `;
        }
        if (accSet.has('aura_sakura')) {
            html += `
                <g class="acc-aura-layer">
                    ${drawSakura(20, 36, 0.95)}
                    ${drawSakura(118, 42, 0.85)}
                    ${drawSakura(22, 98, 0.8)}
                    ${drawSakura(116, 100, 0.9)}
                </g>
            `;
        }
        if (accSet.has('aura_notes')) {
            html += `
                <g class="acc-aura-layer">
                    ${drawNote(20, 40, '#8B5CF6')}
                    ${drawNote(118, 36, '#EC4899')}
                    ${drawNote(116, 94, '#3B82F6')}
                </g>
            `;
        }
        if (accSet.has('aura_fire')) {
            html += `
                <g class="acc-aura-layer">
                    <path d="M22,102 Q10,70 28,44 Q24,72 34,94 Z" fill="#FF7043" fill-opacity="0.7" />
                    <path d="M118,102 Q130,70 112,44 Q116,72 106,94 Z" fill="#FFCA28" fill-opacity="0.7" />
                    <path d="M22,42 C18,50 20,56 24,56 C28,56 30,50 26,44 C25,47 23,46 22,42 Z" fill="#FF5722" stroke="#FBBF24" stroke-width="0.8" />
                    <path d="M116,42 C112,50 114,56 118,56 C122,56 124,50 120,44 C119,47 117,46 116,42 Z" fill="#FF5722" stroke="#FBBF24" stroke-width="0.8" />
                </g>
            `;
        }
        if (accSet.has('aura_snow')) {
            html += `
                <g class="acc-aura-layer">
                    ${drawSnow(20, 38, 6)}
                    ${drawSnow(118, 42, 5.5)}
                    ${drawSnow(22, 96, 4.8)}
                    ${drawSnow(116, 98, 5.5)}
                </g>
            `;
        }
        return html;
    },

    renderBackAccessories(accSet, uid) {
        let html = '';
        if (accSet.has('wings')) {
            html += `
                <g class="acc-wings">
                    <path d="M36,72 C10,56 6,32 22,28 C32,26 36,44 40,58 Z" fill="#FFFFFF" stroke="#90A4AE" stroke-width="1.8" />
                    <path d="M104,72 C130,56 134,32 118,28 C108,26 104,44 100,58 Z" fill="#FFFFFF" stroke="#90A4AE" stroke-width="1.8" />
                </g>
            `;
        }
        if (accSet.has('wings_fairy')) {
            html += `
                <g class="acc-wings">
                    <path d="M38,68 C6,42 12,18 32,32 C22,52 14,76 38,82 Z" fill="#F472B6" fill-opacity="0.75" stroke="#DB2777" stroke-width="1.8" />
                    <path d="M102,68 C134,42 128,18 108,32 C118,52 126,76 102,82 Z" fill="#38BDF8" fill-opacity="0.75" stroke="#0284C7" stroke-width="1.8" />
                </g>
            `;
        }
        if (accSet.has('cape_royal')) {
            html += `
                <g class="acc-cape">
                    <path d="M38,70 L20,110 Q70,118 120,110 L102,70 Z" fill="#E11D48" stroke="#881337" stroke-width="2" />
                    <path d="M20,106 Q70,114 120,106" fill="none" stroke="#FFD700" stroke-width="3" />
                </g>
            `;
        }
        if (accSet.has('back_mecha_jet')) {
            html += `
                <g class="acc-wings">
                    <path d="M22,52 L42,60 L38,88 L18,80 Z" fill="#475569" stroke="#1E293B" stroke-width="1.8" />
                    <path d="M118,52 L98,60 L102,88 L122,80 Z" fill="#475569" stroke="#1E293B" stroke-width="1.8" />
                    <rect x="23" y="56" width="12" height="10" rx="2" fill="#94A3B8" />
                    <rect x="105" y="56" width="12" height="10" rx="2" fill="#94A3B8" />
                    <path d="M20,82 L25,103 L35,86 Z" fill="#38BDF8" stroke="#0284C7" stroke-width="1" />
                    <path d="M23,84 L26,96 L32,86 Z" fill="#FEF08A" />
                    <path d="M120,82 L115,103 L105,86 Z" fill="#38BDF8" stroke="#0284C7" stroke-width="1" />
                    <path d="M117,84 L114,96 L108,86 Z" fill="#FEF08A" />
                </g>
            `;
        }
        if (accSet.has('back_fairy_butterfly')) {
            html += `
                <g class="acc-wings">
                    <path d="M40,66 C8,22 2,52 24,68 C10,78 16,102 42,84 Z" fill="#F0ABFC" fill-opacity="0.78" stroke="#C026D3" stroke-width="1.8" />
                    <path d="M100,66 C132,22 138,52 116,68 C130,78 124,102 98,84 Z" fill="#7DD3FC" fill-opacity="0.78" stroke="#0284C7" stroke-width="1.8" />
                    <circle cx="23" cy="52" r="4" fill="#FEF08A" fill-opacity="0.85" />
                    <circle cx="117" cy="52" r="4" fill="#FEF08A" fill-opacity="0.85" />
                    <path d="M36,68 Q22,52 16,46 M104,68 Q118,52 124,46" fill="none" stroke="#FFFFFF" stroke-width="1.2" opacity="0.75" />
                </g>
            `;
        }
        if (accSet.has('back_knight_cape')) {
            html += `
                <g class="acc-cape">
                    <path d="M36,68 L14,112 Q45,104 70,114 Q95,104 126,112 L104,68 Z" fill="#B91C1C" stroke="#450A0A" stroke-width="2" stroke-linejoin="round" />
                    <path d="M24,106 Q70,113 116,106" fill="none" stroke="#FBBF24" stroke-width="2.6" />
                    <circle cx="42" cy="70" r="4.5" fill="#FBBF24" stroke="#92400E" stroke-width="1.2" />
                    <circle cx="98" cy="70" r="4.5" fill="#FBBF24" stroke="#92400E" stroke-width="1.2" />
                </g>
            `;
        }
        if (accSet.has('back_school_bag')) {
            html += `
                <g class="acc-cape">
                    <rect x="26" y="60" width="88" height="44" rx="12" fill="#3B82F6" stroke="#1E3A8A" stroke-width="2" />
                    <rect x="30" y="62" width="80" height="16" rx="8" fill="#60A5FA" stroke="#1E3A8A" stroke-width="1.5" />
                    <circle cx="34" cy="70" r="4" fill="#FACC15" stroke="#B45309" stroke-width="1" />
                    <circle cx="106" cy="70" r="4" fill="#FACC15" stroke="#B45309" stroke-width="1" />
                </g>
            `;
        }
        return html;
    },

    renderNeckAccessories(accSet, uid) {
        let html = '';
        if (accSet.has('scarf')) {
            html += `
                <g class="acc-scarf">
                    <path d="M44,74 Q70,84 96,74 Q98,83 70,89 Q42,83 44,74 Z" fill="#EF4444" stroke="#991B1B" stroke-width="1.5" />
                    <rect x="78" y="78" width="11" height="20" rx="4" fill="#DC2626" stroke="#991B1B" stroke-width="1.5" />
                    <line x1="80" y1="93" x2="87" y2="93" stroke="#FEF08A" stroke-width="2" />
                </g>
            `;
        }
        if (accSet.has('bow_tie')) {
            html += `
                <g class="acc-bowtie">
                    <polygon points="58,76 58,86 70,81" fill="#F43F5E" stroke="#9F1239" stroke-width="1.2" />
                    <polygon points="82,76 82,86 70,81" fill="#F43F5E" stroke="#9F1239" stroke-width="1.2" />
                    <circle cx="70" cy="81" r="3.5" fill="#FFE4E6" stroke="#9F1239" stroke-width="1.2" />
                </g>
            `;
        }
        if (accSet.has('bell_collar')) {
            html += `
                <g class="acc-collar">
                    <path d="M46,75 Q70,84 94,75" fill="none" stroke="#10B981" stroke-width="4.5" stroke-linecap="round" />
                    <circle cx="70" cy="81" r="6" fill="url(#goldGrad-${uid})" stroke="#B45309" stroke-width="1.5" />
                    <circle cx="70" cy="82" r="1.5" fill="#78350F" />
                </g>
            `;
        }
        return html;
    },

    renderEyeAccessories(accSet, uid) {
        let html = '';
        if (accSet.has('glasses_round')) {
            html += `
                <g class="acc-glasses">
                    <circle cx="54" cy="57" r="10" fill="#FFFFFF" fill-opacity="0.15" stroke="#F59E0B" stroke-width="2.5" />
                    <circle cx="86" cy="57" r="10" fill="#FFFFFF" fill-opacity="0.15" stroke="#F59E0B" stroke-width="2.5" />
                    <line x1="64" y1="57" x2="76" y2="57" stroke="#F59E0B" stroke-width="2.5" />
                </g>
            `;
        }
        if (accSet.has('glasses_sun')) {
            html += `
                <g class="acc-glasses">
                    <rect x="42" y="50" width="24" height="13" rx="3" fill="#1E293B" stroke="#0F172A" stroke-width="2" />
                    <rect x="74" y="50" width="24" height="13" rx="3" fill="#1E293B" stroke="#0F172A" stroke-width="2" />
                    <line x1="66" y1="54" x2="74" y2="54" stroke="#0F172A" stroke-width="3" />
                    <line x1="46" y1="53" x2="52" y2="60" stroke="#FFFFFF" stroke-width="2" opacity="0.6" />
                    <line x1="78" y1="53" x2="84" y2="60" stroke="#FFFFFF" stroke-width="2" opacity="0.6" />
                </g>
            `;
        }
        if (accSet.has('glasses_cyber')) {
            html += `
                <g class="acc-glasses">
                    <path d="M40,51 L100,51 L96,63 L74,63 L70,58 L66,63 L44,63 Z" fill="#00E5FF" fill-opacity="0.55" stroke="#00B8D4" stroke-width="2" />
                    <line x1="46" y1="55" x2="94" y2="55" stroke="#FFFFFF" stroke-width="1.5" opacity="0.8" />
                </g>
            `;
        }
        if (accSet.has('glasses_star')) {
            html += `
                <g class="acc-glasses">
                    <polygon points="54,45 57,53 65,53 59,58 61,66 54,61 47,66 49,58 43,53 51,53" fill="#F43F5E" fill-opacity="0.5" stroke="#FFE4E6" stroke-width="2" />
                    <polygon points="86,45 89,53 97,53 91,58 93,66 86,61 79,66 81,58 75,53 83,53" fill="#F43F5E" fill-opacity="0.5" stroke="#FFE4E6" stroke-width="2" />
                    <line x1="62" y1="56" x2="78" y2="56" stroke="#FFE4E6" stroke-width="2" />
                </g>
            `;
        }
        if (accSet.has('mask_sleep')) {
            html += `
                <g class="acc-glasses">
                    <rect x="42" y="34" width="56" height="14" rx="7" fill="#93C5FD" stroke="#2563EB" stroke-width="1.8" />
                    <path d="M48,41 Q54,45 60,41 M80,41 Q86,45 92,41" fill="none" stroke="#1E3A8A" stroke-width="1.8" stroke-linecap="round" />
                </g>
            `;
        }
        if (accSet.has('eye_holo_visor')) {
            html += `
                <g class="acc-glasses">
                    <path d="M39,49 L101,49 L97,64 L76,64 L70,58 L64,64 L43,64 Z" fill="#06B6D4" fill-opacity="0.45" stroke="#67E8F9" stroke-width="2" />
                    <line x1="45" y1="53" x2="62" y2="53" stroke="#ECFEFF" stroke-width="1.8" />
                    <circle cx="88" cy="56" r="4.5" fill="none" stroke="#FEF08A" stroke-width="1.3" />
                    <line x1="88" y1="50" x2="88" y2="62" stroke="#FEF08A" stroke-width="1" />
                </g>
            `;
        }
        if (accSet.has('eye_star_gold')) {
            html += `
                <g class="acc-glasses">
                    <polygon points="54,44 57.5,52 66,52 59.5,57.5 61.5,66 54,61 46.5,66 48.5,57.5 42,52 50.5,52" fill="#FDE047" fill-opacity="0.4" stroke="#F59E0B" stroke-width="2" />
                    <polygon points="86,44 89.5,52 98,52 91.5,57.5 93.5,66 86,61 78.5,66 80.5,57.5 74,52 82.5,52" fill="#FDE047" fill-opacity="0.4" stroke="#F59E0B" stroke-width="2" />
                    <line x1="62" y1="56" x2="78" y2="56" stroke="#F59E0B" stroke-width="2.2" />
                </g>
            `;
        }
        if (accSet.has('eye_heart_tint')) {
            html += `
                <g class="acc-glasses">
                    <path d="M54,64 C44,58 42,48 49,48 C52,48 54,51 54,51 C54,51 56,48 59,48 C66,48 64,58 54,64 Z" fill="#FB7185" fill-opacity="0.5" stroke="#E11D48" stroke-width="2" />
                    <path d="M86,64 C76,58 74,48 81,48 C84,48 86,51 86,51 C86,51 88,48 91,48 C98,48 96,58 86,64 Z" fill="#FB7185" fill-opacity="0.5" stroke="#E11D48" stroke-width="2" />
                    <line x1="63" y1="53" x2="77" y2="53" stroke="#E11D48" stroke-width="2" />
                </g>
            `;
        }
        if (accSet.has('eye_battle_patch')) {
            html += `
                <g class="acc-glasses">
                    <path d="M36,46 L67,63 M62,48 L36,57" stroke="#0F172A" stroke-width="2.2" stroke-linecap="round" />
                    <path d="M44,51 L63,51 Q64,63 54,64 Q44,63 44,51 Z" fill="#1E293B" stroke="#64748B" stroke-width="1.8" />
                    <path d="M51,54 L57,60 M57,54 L51,60" stroke="#38BDF8" stroke-width="1.6" stroke-linecap="round" />
                </g>
            `;
        }
        return html;
    },

    renderHeadAccessories(accSet, uid) {
        let html = '';
        if (accSet.has('halo')) {
            html += `<ellipse cx="70" cy="14" rx="24" ry="6.5" fill="none" stroke="#FFD700" stroke-width="4" />`;
        }
        if (accSet.has('crown')) {
            html += `
                <g class="acc-crown">
                    <path d="M52,35 L56,17 L70,27 L84,17 L88,35 Z" fill="url(#goldGrad-${uid})" stroke="#B45309" stroke-width="1.8" stroke-linejoin="round" />
                    <circle cx="56" cy="17" r="2.5" fill="#F43F5E" />
                    <circle cx="70" cy="26" r="2.8" fill="#38BDF8" />
                    <circle cx="84" cy="17" r="2.5" fill="#10B981" />
                </g>
            `;
        }
        if (accSet.has('hat_cap')) {
            html += `
                <g class="acc-hat">
                    <path d="M45,36 C45,20 95,20 95,36 Z" fill="#3B82F6" stroke="#1D4ED8" stroke-width="1.8" />
                    <path d="M42,35 Q70,40 104,33 Q96,29 70,32 Z" fill="#1E40AF" />
                    <circle cx="70" cy="23" r="3" fill="#FBBF24" />
                </g>
            `;
        }
        if (accSet.has('hat_wizard')) {
            html += `
                <g class="acc-hat">
                    <ellipse cx="70" cy="34" rx="32" ry="7" fill="#4C1D95" stroke="#2E1065" stroke-width="1.8" />
                    <path d="M48,33 L68,6 L82,12 L74,18 L92,33 Z" fill="#6D28D9" stroke="#2E1065" stroke-width="1.8" stroke-linejoin="round" />
                    <path d="M50,31 Q70,36 90,31" fill="none" stroke="#FBBF24" stroke-width="3.5" />
                    <polygon points="69,18 70.6,21.3 74.2,21.8 71.6,24.3 72.2,27.9 69,26.2 65.8,27.9 66.4,24.3 63.8,21.8 67.4,21.3" fill="#FDE047" stroke="#D97706" stroke-width="0.6" />
                </g>
            `;
        }
        if (accSet.has('hat_beret')) {
            html += `
                <g class="acc-hat">
                    <ellipse cx="73" cy="28" rx="25" ry="10" transform="rotate(-10 73 28)" fill="#F43F5E" stroke="#9F1239" stroke-width="1.8" />
                    <path d="M72,18 L75,13" stroke="#9F1239" stroke-width="2.5" stroke-linecap="round" />
                </g>
            `;
        }
        if (accSet.has('head_sprout')) {
            html += `
                <g class="acc-hat">
                    <path d="M70,34 Q70,20 68,16" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round" />
                    <path d="M68,17 C58,12 56,22 68,21 Z" fill="#4ADE80" stroke="#16A34A" stroke-width="1.2" />
                    <path d="M68,17 C78,10 82,20 68,21 Z" fill="#22C55E" stroke="#16A34A" stroke-width="1.2" />
                </g>
            `;
        }
        if (accSet.has('head_headphone')) {
            html += `
                <g class="acc-hat">
                    <path d="M33,60 C33,24 107,24 107,60" fill="none" stroke="#F472B6" stroke-width="5" stroke-linecap="round" />
                    <ellipse cx="33" cy="60" rx="6" ry="10" fill="#EC4899" stroke="#9D174D" stroke-width="1.5" />
                    <ellipse cx="107" cy="60" rx="6" ry="10" fill="#EC4899" stroke="#9D174D" stroke-width="1.5" />
                </g>
            `;
        }
        if (accSet.has('head_cyber_helmet')) {
            html += `
                <g class="acc-hat">
                    <path d="M37,43 C38,18 102,18 103,43 L96,38 Q70,33 44,38 Z" fill="#334155" stroke="#0F172A" stroke-width="2" />
                    <path d="M54,26 L86,26 L82,33 L58,33 Z" fill="#00E5FF" stroke="#0284C7" stroke-width="1.2" />
                    <line x1="94" y1="24" x2="104" y2="12" stroke="#64748B" stroke-width="2.2" stroke-linecap="round" />
                    <circle cx="104" cy="12" r="2.8" fill="#00E5FF" />
                </g>
            `;
        }
        if (accSet.has('head_sakura_crown')) {
            const drawFlower = (cx, cy, s = 1) => `
                <g transform="translate(${cx},${cy}) scale(${s})">
                    <circle cx="0" cy="-4.5" r="3.2" fill="#FBCFE8" stroke="#EC4899" stroke-width="0.9" />
                    <circle cx="4.2" cy="-1.4" r="3.2" fill="#F9A8D4" stroke="#EC4899" stroke-width="0.9" />
                    <circle cx="2.6" cy="3.6" r="3.2" fill="#FBCFE8" stroke="#EC4899" stroke-width="0.9" />
                    <circle cx="-2.6" cy="3.6" r="3.2" fill="#F9A8D4" stroke="#EC4899" stroke-width="0.9" />
                    <circle cx="-4.2" cy="-1.4" r="3.2" fill="#FBCFE8" stroke="#EC4899" stroke-width="0.9" />
                    <circle cx="0" cy="0" r="2" fill="#FDE047" />
                </g>`;
            html += `
                <g class="acc-hat">
                    <path d="M44,36 Q70,27 96,36" fill="none" stroke="#16A34A" stroke-width="3.2" stroke-linecap="round" />
                    <path d="M52,31 Q46,24 54,24 Z M88,31 Q94,24 86,24 Z" fill="#4ADE80" stroke="#15803D" stroke-width="0.8" />
                    ${drawFlower(52, 31, 0.85)}
                    ${drawFlower(70, 28, 1.05)}
                    ${drawFlower(88, 31, 0.85)}
                </g>
            `;
        }
        if (accSet.has('head_bamboo_hat')) {
            html += `
                <g class="acc-hat">
                    <path d="M24,38 L70,13 L116,38 Q70,44 24,38 Z" fill="#FDE68A" stroke="#B45309" stroke-width="2" stroke-linejoin="round" />
                    <path d="M36,34 Q70,39 104,34 M48,27 Q70,31 92,27" fill="none" stroke="#D97706" stroke-width="1.3" />
                    <path d="M52,25 L70,13 L88,25" fill="none" stroke="#DC2626" stroke-width="2.4" />
                </g>
            `;
        }
        if (accSet.has('head_cat_headphones')) {
            html += `
                <g class="acc-hat">
                    <path d="M32,60 C32,22 108,22 108,60" fill="none" stroke="#1E293B" stroke-width="5.5" stroke-linecap="round" />
                    <polygon points="44,30 48,14 60,26" fill="#1E293B" stroke="#A855F7" stroke-width="1.8" stroke-linejoin="round" />
                    <polygon points="48,27 50,18 57,25" fill="#F472B6" />
                    <polygon points="96,30 92,14 80,26" fill="#1E293B" stroke="#A855F7" stroke-width="1.8" stroke-linejoin="round" />
                    <polygon points="92,27 90,18 83,25" fill="#F472B6" />
                    <ellipse cx="32" cy="60" rx="6.5" ry="10.5" fill="#334155" stroke="#A855F7" stroke-width="2" />
                    <ellipse cx="108" cy="60" rx="6.5" ry="10.5" fill="#334155" stroke="#A855F7" stroke-width="2" />
                </g>
            `;
        }
        return html;
    },

    renderHandAccessories(accSet, uid) {
        let html = '';
        if (accSet.has('hand_wand')) {
            html += `
                <g class="acc-hand">
                    <line x1="104" y1="84" x2="120" y2="56" stroke="#F59E0B" stroke-width="3" stroke-linecap="round" />
                    <polygon points="120,46 123,53 130,53 124,57 126,64 120,60 114,64 116,57 110,53 117,53" fill="#FDE047" stroke="#CA8A04" stroke-width="1.2" />
                </g>
            `;
        }
        if (accSet.has('hand_book')) {
            html += `
                <g class="acc-hand">
                    <rect x="94" y="72" width="18" height="22" rx="3" transform="rotate(10 103 83)" fill="#3B82F6" stroke="#1E3A8A" stroke-width="1.5" />
                    <text x="103" y="87" font-family="Arial, Helvetica, sans-serif" font-size="9" fill="#FFFFFF" font-weight="bold" text-anchor="middle">A+</text>
                </g>
            `;
        }
        if (accSet.has('hand_bamboo')) {
            html += `
                <g class="acc-hand">
                    <line x1="100" y1="90" x2="118" y2="54" stroke="#16A34A" stroke-width="3.5" stroke-linecap="round" />
                    <path d="M114,62 Q126,58 122,66 Z" fill="#4ADE80" />
                    <path d="M108,72 Q96,66 102,75 Z" fill="#22C55E" />
                </g>
            `;
        }
        if (accSet.has('hand_balloon')) {
            html += `
                <g class="acc-hand">
                    <path d="M104,78 Q114,56 114,38" fill="none" stroke="#94A3B8" stroke-width="1.5" />
                    <ellipse cx="114" cy="26" rx="11" ry="13" fill="#FB7185" stroke="#E11D48" stroke-width="1.5" />
                    <ellipse cx="110" cy="22" rx="3" ry="5" fill="#FFFFFF" opacity="0.5" />
                </g>
            `;
        }
        if (accSet.has('hand_boba')) {
            html += `
                <g class="acc-hand">
                    <line x1="108" y1="64" x2="112" y2="76" stroke="#EC4899" stroke-width="2.5" stroke-linecap="round" />
                    <path d="M98,74 L116,74 L113,94 L101,94 Z" fill="#FDE68A" stroke="#92400E" stroke-width="1.5" />
                    <path d="M96,74 L118,74" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" />
                    <circle cx="104" cy="90" r="1.8" fill="#451A03" />
                    <circle cx="108" cy="91" r="1.8" fill="#451A03" />
                    <circle cx="111" cy="89" r="1.8" fill="#451A03" />
                </g>
            `;
        }
        if (accSet.has('hand_energy_sword')) {
            html += `
                <g class="acc-hand">
                    <line x1="100" y1="90" x2="106" y2="78" stroke="#334155" stroke-width="4.5" stroke-linecap="round" />
                    <line x1="101" y1="77" x2="110" y2="81" stroke="#FBBF24" stroke-width="3" stroke-linecap="round" />
                    <path d="M106,77 L125,40 L127,45 L110,79 Z" fill="#00E5FF" stroke="#0284C7" stroke-width="1.2" />
                    <line x1="108" y1="77" x2="124" y2="44" stroke="#ECFEFF" stroke-width="1.8" stroke-linecap="round" />
                </g>
            `;
        }
        if (accSet.has('hand_moon_wand')) {
            html += `
                <g class="acc-hand">
                    <line x1="101" y1="92" x2="118" y2="56" stroke="#F472B6" stroke-width="3.2" stroke-linecap="round" />
                    <path d="M123,41 A9,9 0 1,0 123,58 A7,7 0 1,1 123,41 Z" fill="#FDE047" stroke="#D97706" stroke-width="1.3" />
                    <circle cx="122" cy="49" r="2.2" fill="#F43F5E" />
                    <polygon points="113,62 118,65 111,67" fill="#EC4899" />
                    <polygon points="119,65 125,62 122,68" fill="#EC4899" />
                </g>
            `;
        }
        if (accSet.has('hand_jade_fan')) {
            html += `
                <g class="acc-hand">
                    <path d="M104,84 L100,56 Q118,52 128,70 Z" fill="#A7F3D0" stroke="#059669" stroke-width="1.6" stroke-linejoin="round" />
                    <line x1="104" y1="84" x2="108" y2="58" stroke="#047857" stroke-width="1" />
                    <line x1="104" y1="84" x2="118" y2="62" stroke="#047857" stroke-width="1" />
                    <line x1="104" y1="84" x2="101" y2="91" stroke="#92400E" stroke-width="2.5" stroke-linecap="round" />
                    <path d="M100,91 L98,98 M102,91 L104,97" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round" />
                </g>
            `;
        }
        if (accSet.has('hand_gamepad_boba')) {
            html += `
                <g class="acc-hand">
                    <path d="M92,76 C92,72 120,72 120,76 L123,88 C123,92 117,93 114,88 L98,88 C95,93 89,92 89,88 Z" fill="#6366F1" stroke="#312E81" stroke-width="1.6" stroke-linejoin="round" />
                    <path d="M97,79 L101,79 M99,77 L99,81" stroke="#22D3EE" stroke-width="2" stroke-linecap="round" />
                    <circle cx="111" cy="78" r="1.6" fill="#FDE047" />
                    <circle cx="115" cy="81" r="1.6" fill="#F472B6" />
                </g>
            `;
        }
        return html;
    },

    // ── 以下为 Mind+ / Scratch 3.0 导出专用矢量渲染扩展 ──────────────────

    /**
     * 基于 W3C feColorMatrix hueRotate 矩阵精确转换 Hex 颜色，
     * 保证导出的静态 SVG 颜色与浏览器 CSS filter: hue-rotate() 一致
     */
    rotateHexHue(hex, deg = 0) {
        const angle = Number(deg) || 0;
        if (angle % 360 === 0) return hex;
        let clean = String(hex).replace('#', '').trim();
        if (clean.length === 3) {
            clean = clean.split('').map(c => c + c).join('');
        }
        if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;

        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);

        const rad = (angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const rOut = r * (0.213 + 0.787 * cos - 0.213 * sin)
            + g * (0.715 - 0.715 * cos - 0.715 * sin)
            + b * (0.072 - 0.072 * cos + 0.928 * sin);
        const gOut = r * (0.213 - 0.213 * cos + 0.143 * sin)
            + g * (0.715 + 0.285 * cos + 0.140 * sin)
            + b * (0.072 - 0.072 * cos - 0.283 * sin);
        const bOut = r * (0.213 - 0.213 * cos - 0.787 * sin)
            + g * (0.715 - 0.715 * cos + 0.715 * sin)
            + b * (0.072 + 0.928 * cos + 0.072 * sin);

        const clampHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
        return `#${clampHex(rOut)}${clampHex(gOut)}${clampHex(bOut)}`;
    },

    bakeHueInFragment(fragment, deg = 0) {
        const angle = Number(deg) || 0;
        if (angle % 360 === 0 || !fragment) return fragment;
        return fragment.replace(/#[0-9a-fA-F]{3,6}\b/g, (match) => this.rotateHexHue(match, angle));
    },

    renderPoseHurtEyes(species) {
        const stroke = species.eyeColor || '#1E1E1E';
        return `
            <g class="pet-eye">
                <line x1="48" y1="52" x2="60" y2="62" stroke="${stroke}" stroke-width="3.2" stroke-linecap="round" />
                <line x1="60" y1="52" x2="48" y2="62" stroke="${stroke}" stroke-width="3.2" stroke-linecap="round" />
                <line x1="80" y1="52" x2="92" y2="62" stroke="${stroke}" stroke-width="3.2" stroke-linecap="round" />
                <line x1="92" y1="52" x2="80" y2="62" stroke="${stroke}" stroke-width="3.2" stroke-linecap="round" />
            </g>
        `;
    },

    renderPoseHurtMouth(skinId) {
        if (skinId === 'chubby_penguin' || skinId === 'starter_water_penguin') {
            return `
                <g class="pet-mouth">
                    <ellipse cx="70" cy="65" rx="6" ry="3.5" fill="#FFB300" stroke="#E65100" stroke-width="1.2" />
                    <path d="M64,67 Q67,70 70,67 Q73,70 76,67" fill="none" stroke="#5D4037" stroke-width="1.4" stroke-linecap="round" />
                </g>
            `;
        }
        return `
            <g class="pet-mouth">
                <polygon points="67,63 73,63 70,66" fill="#FF7043" />
                <path d="M61,70 Q64,66 67,70 Q70,74 73,70 Q76,66 79,70" fill="none" stroke="#5D4037" stroke-width="2" stroke-linecap="round" />
            </g>
        `;
    },

    renderPoseOverlay(pose) {
        if (pose === 'cheer') {
            return `
                <g class="pose-cheer-fx">
                    <path d="M18,46 Q18,52 24,52 Q18,52 18,58 Q18,52 12,52 Q18,52 18,46 Z" fill="#FDE047" stroke="#F59E0B" stroke-width="0.8" />
                    <path d="M122,42 Q122,48 128,48 Q122,48 122,54 Q122,48 116,48 Q122,48 122,42 Z" fill="#FDE047" stroke="#F59E0B" stroke-width="0.8" />
                </g>
            `;
        }
        if (pose === 'hurt') {
            return `
                <g class="pose-hurt-fx">
                    <path d="M56,14 C56,8 84,8 84,14 C84,19 60,19 60,14 C60,11 76,11 76,14" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" />
                    <line x1="16" y1="54" x2="26" y2="59" stroke="#FB7185" stroke-width="2.2" stroke-linecap="round" />
                    <line x1="14" y1="65" x2="25" y2="66" stroke="#FB7185" stroke-width="2.2" stroke-linecap="round" />
                </g>
            `;
        }
        return '';
    },

    /**
     * 渲染单个独立可用、兼容 Scratch 3.0 / Mind+ 的纯矢量动作造型 SVG
     * 画布尺寸固定 120x120，几何中心对齐 (60, 60)
     */
    renderExportPoseSvg(skinId = 'default_cat', accessories = [], colorHue = 0, pose = 'idle', options = {}) {
        const uid = `exp-${pose}`;
        const accList = Array.isArray(accessories) ? accessories : [];
        const accSet = new Set(accList);
        const level = Number(options.level) || 1;
        const hueDeg = Number(colorHue) || 0;

        // 1. 解析基础配色并烘焙色相旋转（用于本体渐变与线稿）
        const rawSpecies = this.getSpeciesTheme(skinId);
        const bakedSpecies = {
            ...rawSpecies,
            bodyLight: this.rotateHexHue(rawSpecies.bodyLight, hueDeg),
            bodyMain: this.rotateHexHue(rawSpecies.bodyMain, hueDeg),
            bodyDark: this.rotateHexHue(rawSpecies.bodyDark, hueDeg),
            bellyLight: this.rotateHexHue(rawSpecies.bellyLight, hueDeg),
            bellyDark: this.rotateHexHue(rawSpecies.bellyDark, hueDeg),
            earInnerLight: this.rotateHexHue(rawSpecies.earInnerLight, hueDeg),
            earInnerDark: this.rotateHexHue(rawSpecies.earInnerDark, hueDeg),
            outline: this.rotateHexHue(rawSpecies.outline, hueDeg)
        };

        // 2. 五官配置（欢呼与受击动作对应表情变化）
        let eyeType = accList.find(a => a.startsWith('face_eye_')) || rawSpecies.defaultEye || 'face_eye_round';
        let mouthType = accList.find(a => a.startsWith('face_mouth_')) || rawSpecies.defaultMouth || 'face_mouth_cat';
        const cheekType = accList.find(a => a.startsWith('face_cheek_')) || rawSpecies.defaultCheek || 'face_cheek_peach';

        if (pose === 'jump' && eyeType === 'face_eye_cool') {
            eyeType = 'face_eye_sparkle';
        } else if (pose === 'cheer') {
            eyeType = 'face_eye_happy';
            mouthType = 'face_mouth_grin';
        }

        // 3. 伴生与进化层（不受色相影响）
        const stage = this.getEvolutionStage(level);
        const evolutionBack = this.renderEvolutionBack(level, rawSpecies, uid);
        const evolutionFront = this.renderEvolutionFront(level, rawSpecies, uid);
        const auraSvg = this.renderAuraLayer(accSet, uid);
        const backAccSvg = this.renderBackAccessories(accSet, uid);

        // 4. 宠物本体染色层（烘焙颜色变化，去掉 CSS filter）
        let tailSvg;
        let headBackSvg;
        let torsoInnerSvg;
        let limbsSvg;
        let headTopSpeciesSvg;
        let anchors = null;

        if (this.isStarterSpecies(skinId)) {
            const parts = this.renderStarterParts(skinId, stage, rawSpecies, uid, pose);
            tailSvg = this.bakeHueInFragment(parts.tailSvg, hueDeg);
            headBackSvg = this.bakeHueInFragment(parts.headBackSvg, hueDeg);
            torsoInnerSvg = this.bakeHueInFragment(parts.torsoSvg, hueDeg);
            limbsSvg = this.bakeHueInFragment(parts.limbsSvg, hueDeg);
            headTopSpeciesSvg = this.bakeHueInFragment(parts.headTopSvg, hueDeg);
            anchors = parts.anchors;
        } else {
            tailSvg = this.bakeHueInFragment(this.renderSpeciesTail(skinId, rawSpecies, uid), hueDeg);
            headBackSvg = this.bakeHueInFragment(this.renderSpeciesHeadBack(skinId, rawSpecies, uid), hueDeg);
            const bodyDecorSvg = this.bakeHueInFragment(this.renderSpeciesBodyDecor(skinId, rawSpecies, uid), hueDeg);
            torsoInnerSvg = `
                    <path d="M36,72 C34,44 47,33 70,33 C93,33 106,44 104,72 C103,98 91,110 70,110 C49,110 37,98 36,72 Z" fill="url(#bodyGrad-${uid})" stroke="${bakedSpecies.outline}" stroke-width="2" />
                    <ellipse cx="58" cy="43" rx="16" ry="6" fill="#FFFFFF" opacity="0.28" transform="rotate(-10 58 43)" />
                    <ellipse cx="70" cy="84" rx="22" ry="19" fill="url(#bellyGrad-${uid})" />
                    ${bodyDecorSvg}
            `;
            limbsSvg = this.bakeHueInFragment(this.renderSpeciesLimbs(skinId, rawSpecies, uid, pose), hueDeg);
            headTopSpeciesSvg = this.bakeHueInFragment(this.renderSpeciesHeadTop(skinId, rawSpecies, uid), hueDeg);
        }

        const wrapAnchor = (svg, tf) => (svg && tf ? `<g transform="${tf}">${svg}</g>` : (svg || ''));

        // 5. 五官与前景配饰（不随毛色变色）
        const eyesSvg = pose === 'hurt'
            ? this.renderPoseHurtEyes(rawSpecies)
            : this.renderEyes(eyeType, skinId, rawSpecies, uid);
        const noseMouthSvg = pose === 'hurt'
            ? this.renderPoseHurtMouth(skinId)
            : this.renderNoseAndMouth(mouthType, skinId, rawSpecies, uid);
        const cheeksSvg = this.renderCheeks(cheekType, skinId, rawSpecies, uid);

        const neckAccSvg = wrapAnchor(this.renderNeckAccessories(accSet, uid), anchors?.neck);
        const eyeAccSvg = wrapAnchor(this.renderEyeAccessories(accSet, uid), anchors?.face);
        const headAccSvg = wrapAnchor(this.renderHeadAccessories(accSet, uid), anchors?.headAcc);
        const handAccRaw = wrapAnchor(this.renderHandAccessories(accSet, uid), anchors?.hand);
        const alignedBackAccSvg = wrapAnchor(backAccSvg, anchors?.back);
        const alignedEvoFront = wrapAnchor(evolutionFront, anchors?.evoFront);

        // 手持道具随动作手臂同步摆动
        const handTransform = pose === 'walk'
            ? ' transform="rotate(14 102 78)"'
            : (pose === 'cheer' ? ' transform="translate(-8, -22) rotate(-25 102 78)"' : (pose === 'hurt' ? ' transform="rotate(-24 102 78)"' : ''));
        const handAccSvg = handAccRaw ? `<g${handTransform}>${handAccRaw}</g>` : '';

        // 6. 全身动作姿势骨架变换（以中心 70,70 为基准）
        const bodyPoseTransformMap = {
            idle: '',
            walk: ' transform="translate(0, -2) rotate(4 70 85)"',
            jump: ' transform="translate(0, -11) scale(0.97 1.04)"',
            cheer: ' transform="translate(0, -5)"',
            hurt: ' transform="translate(-3, 2) rotate(-11 70 85)"'
        };
        const rootTransform = bodyPoseTransformMap[pose] || '';
        const tailTransform = pose === 'walk' ? ' transform="rotate(10 36 88)"' : '';
        const poseFxSvg = this.renderPoseOverlay(pose);

        const jumpShadow = pose === 'jump'
            ? '<ellipse cx="70" cy="116" rx="22" ry="4" fill="#334155" fill-opacity="0.18" />'
            : '';

        return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="120" height="120" viewBox="0 0 120 120">
    <defs>
        <radialGradient id="bodyGrad-${uid}" cx="38%" cy="28%" r="70%">
            <stop offset="0%" stop-color="${bakedSpecies.bodyLight}" />
            <stop offset="55%" stop-color="${bakedSpecies.bodyMain}" />
            <stop offset="100%" stop-color="${bakedSpecies.bodyDark}" />
        </radialGradient>
        <linearGradient id="bellyGrad-${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${bakedSpecies.bellyLight}" />
            <stop offset="100%" stop-color="${bakedSpecies.bellyDark}" />
        </linearGradient>
        <linearGradient id="earInner-${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${bakedSpecies.earInnerLight}" />
            <stop offset="100%" stop-color="${bakedSpecies.earInnerDark}" />
        </linearGradient>
        <linearGradient id="goldGrad-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFE57F" />
            <stop offset="50%" stop-color="#FFD740" />
            <stop offset="100%" stop-color="#FF8F00" />
        </linearGradient>
        <radialGradient id="blushGrad-${uid}" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#FF6B8B" stop-opacity="0.65" />
            <stop offset="100%" stop-color="#FF6B8B" stop-opacity="0" />
        </radialGradient>
    </defs>
    <g transform="translate(60, 60) scale(0.75) translate(-70, -70)">
        ${jumpShadow}
        <g${rootTransform}>
            ${auraSvg}
            ${evolutionBack}
            ${alignedBackAccSvg}
            <g>
                <g${tailTransform}>${tailSvg}</g>
                ${headBackSvg}
                <g>
                    ${torsoInnerSvg}
                </g>
                ${limbsSvg}
                ${headTopSpeciesSvg}
            </g>
            <g>
                ${anchors?.face ? `<g transform="${anchors.face}">${cheeksSvg}${eyesSvg}${noseMouthSvg}</g>` : `${cheeksSvg}${eyesSvg}${noseMouthSvg}`}
                ${alignedEvoFront}
            </g>
            <g>
                ${neckAccSvg}
                ${eyeAccSvg}
                ${headAccSvg}
                ${handAccSvg}
            </g>
            ${poseFxSvg}
        </g>
    </g>
</svg>`;
    },

    ACC_META_3D: {"back_fairy_butterfly":{"w":512,"h":388},"back_knight_cape":{"w":512,"h":476},"back_mecha_jet":{"w":512,"h":344},"back_school_bag":{"w":488,"h":512},"bell_collar":{"w":512,"h":486},"bow_tie":{"w":512,"h":287},"cape_royal":{"w":509,"h":512},"crown":{"w":512,"h":439},"eye_battle_patch":{"w":512,"h":323},"eye_heart_tint":{"w":512,"h":212},"eye_holo_visor":{"w":512,"h":253},"eye_star_gold":{"w":512,"h":213},"glasses_cyber":{"w":512,"h":290},"glasses_round":{"w":512,"h":236},"glasses_star":{"w":512,"h":233},"glasses_sun":{"w":512,"h":181},"halo":{"w":512,"h":287},"hand_balloon":{"w":396,"h":512},"hand_bamboo":{"w":294,"h":512},"hand_boba":{"w":290,"h":512},"hand_book":{"w":470,"h":512},"hand_energy_sword":{"w":203,"h":512},"hand_gamepad_boba":{"w":430,"h":512},"hand_jade_fan":{"w":512,"h":431},"hand_moon_wand":{"w":213,"h":512},"hand_wand":{"w":183,"h":512},"hat_beret":{"w":512,"h":412},"hat_cap":{"w":512,"h":404},"hat_wizard":{"w":512,"h":362},"head_bamboo_hat":{"w":512,"h":412},"head_cat_headphones":{"w":512,"h":498},"head_cyber_helmet":{"w":512,"h":428},"head_headphone":{"w":503,"h":512},"head_sakura_crown":{"w":512,"h":428},"head_sprout":{"w":512,"h":489},"mask_sleep":{"w":512,"h":297},"scarf":{"w":511,"h":512},"wings":{"w":512,"h":269},"wings_fairy":{"w":512,"h":326}},

    ACC_SPECS_3D: {
        head_cyber_helmet:   { slot: 'head', w: 52, ax: 0.50, ay: 0.52, dy: 4 },
        head_sakura_crown:   { slot: 'head', w: 46, ax: 0.50, ay: 0.58, dy: 0 },
        head_bamboo_hat:     { slot: 'head', w: 66, ax: 0.50, ay: 0.72, dy: 2 },
        head_cat_headphones: { slot: 'head', w: 80, sy: 0.58, ax: 0.50, ay: 0.20, dy: -3 },
        hat_cap:             { slot: 'head', w: 48, ax: 0.50, ay: 0.84, dy: 2 },
        crown:               { slot: 'head', w: 38, ax: 0.50, ay: 0.86, dy: 2 },
        halo:                { slot: 'head', w: 42, ax: 0.50, ay: 1.06, dy: 0, cls: 'acc-aura-layer' },
        hat_wizard:          { slot: 'head', w: 50, ax: 0.50, ay: 0.82, dy: 2 },
        hat_beret:           { slot: 'head', w: 44, ax: 0.50, ay: 0.76, dy: 4 },
        head_sprout:         { slot: 'head', w: 22, ax: 0.48, ay: 0.92, dy: 2 },
        head_headphone:      { slot: 'head', w: 78, sy: 0.58, ax: 0.50, ay: 0.20, dy: -3 },

        eye_holo_visor:      { slot: 'eyes', w: 40, ax: 0.50, ay: 0.50, dy: 0 },
        eye_star_gold:       { slot: 'eyes', w: 40, ax: 0.50, ay: 0.50, dy: 0 },
        eye_heart_tint:      { slot: 'eyes', w: 40, ax: 0.50, ay: 0.50, dy: 0 },
        eye_battle_patch:    { slot: 'eyes', w: 18, ax: 0.50, ay: 0.50, dx: -10.5, dy: 0 },
        glasses_round:       { slot: 'eyes', w: 40, ax: 0.50, ay: 0.50, dy: 0 },
        glasses_sun:         { slot: 'eyes', w: 40, ax: 0.50, ay: 0.50, dy: 0 },
        glasses_cyber:       { slot: 'eyes', w: 42, ax: 0.50, ay: 0.50, dy: 0 },
        glasses_star:        { slot: 'eyes', w: 40, ax: 0.50, ay: 0.50, dy: 0 },
        mask_sleep:          { slot: 'eyes', w: 42, ax: 0.50, ay: 0.50, dy: -12 },

        wings:                { slot: 'back', w: 100, ax: 0.50, ay: 0.50, dy: 2, cls: 'acc-wings' },
        wings_fairy:          { slot: 'back', w: 96,  ax: 0.50, ay: 0.50, dy: 0, cls: 'acc-wings' },
        back_fairy_butterfly: { slot: 'back', w: 100, ax: 0.50, ay: 0.50, dy: -2, cls: 'acc-wings' },
        back_mecha_jet:       { slot: 'back', w: 94,  ax: 0.50, ay: 0.45, dy: 2, cls: 'acc-wings' },
        back_knight_cape:     { slot: 'back', w: 68, sy: 0.74, ax: 0.50, ay: 0.10, dy: -12 },
        cape_royal:           { slot: 'back', w: 68, sy: 0.69, ax: 0.50, ay: 0.10, dy: -12 },
        back_school_bag:      { slot: 'back', w: 48,  ax: 0.50, ay: 0.48, dx: -22, dy: 2, rot: -10, flipX: true },

        bow_tie:             { slot: 'neck', w: 22, ax: 0.50, ay: 0.45, dy: 2 },
        scarf:               { slot: 'neck', w: 46, sy: 0.78, ax: 0.50, ay: 0.34, dy: 0, splitY: 0.34 },
        bell_collar:         { slot: 'neck', w: 34, sy: 0.80, ax: 0.50, ay: 0.28, dy: 0, splitY: 0.32 },

        hand_wand:           { slot: 'hand', fixH: 40, ax: 0.50, ay: 0.85, rot: 12, cls: 'pet-3d-hand' },
        hand_moon_wand:      { slot: 'hand', fixH: 42, ax: 0.50, ay: 0.85, rot: 12, cls: 'pet-3d-hand' },
        hand_energy_sword:   { slot: 'hand', fixH: 44, ax: 0.50, ay: 0.84, rot: 14, cls: 'pet-3d-hand' },
        hand_bamboo:         { slot: 'hand', fixH: 40, ax: 0.50, ay: 0.85, rot: 10, cls: 'pet-3d-hand' },
        hand_balloon:        { slot: 'hand', fixH: 46, ax: 0.50, ay: 0.88, rot: 6,  cls: 'pet-3d-hand' },
        hand_jade_fan:       { slot: 'hand', w: 34,    ax: 0.50, ay: 0.88, rot: 12, cls: 'pet-3d-hand' },
        hand_book:           { slot: 'hand', w: 23,    ax: 0.35, ay: 0.55, rot: 6,  cls: 'pet-3d-hand' },
        hand_gamepad_boba:   { slot: 'hand', w: 24,    ax: 0.35, ay: 0.55, rot: 6,  cls: 'pet-3d-hand' },
        hand_boba:           { slot: 'hand', fixH: 30, ax: 0.45, ay: 0.65, rot: 4,  cls: 'pet-3d-hand' }
    },

    PET_ANCHORS_3D: {
        // [x, y, scale, rotDeg?]
        starter_fire_fox_1:      { head: [66, 25, 0.86], eye: [58, 55, 0.94, -1], neck: [63, 77, 0.96], back: [68, 86, 1.00], hand: [80, 88, 0.84] },
        starter_fire_fox_2:      { head: [65, 25, 0.86], eye: [57, 53, 0.91, -2], neck: [64, 77, 0.96], back: [68, 86, 1.05], hand: [81, 88, 0.84] },
        starter_fire_fox_3:      { head: [67, 25, 0.85], eye: [61, 54, 0.92, -1], neck: [65, 80, 0.98], back: [69, 86, 1.18], hand: [83, 89, 0.84] },

        starter_water_penguin_1: { head: [65, 28, 0.96], eye: [58, 55, 0.91, -1], neck: [61, 75, 0.96], back: [67, 86, 0.98], hand: [79, 86, 0.84] },
        starter_water_penguin_2: { head: [64, 27, 0.94], eye: [58, 54, 0.90, -1], neck: [60, 75, 0.96], back: [66, 86, 1.02], hand: [80, 86, 0.84] },
        starter_water_penguin_3: { head: [66, 25, 0.95], eye: [60, 54, 0.90, -1], neck: [63, 77, 0.96], back: [67, 86, 1.08], hand: [82, 87, 0.84] },

        starter_grass_dino_1:    { head: [57, 35, 0.88], eye: [54, 56, 0.86, -3], neck: [56, 74, 0.94], back: [65, 86, 0.98], hand: [78, 86, 0.82] },
        starter_grass_dino_2:    { head: [55, 31, 0.88, -10], eye: [58, 57, 0.86, -3], neck: [60, 75, 0.94], back: [66, 86, 1.00], hand: [79, 86, 0.82] },
        starter_grass_dino_3:    { head: [65, 28, 0.95], eye: [63, 56, 0.86, -3], neck: [65, 76, 0.96], back: [68, 86, 1.06], hand: [80, 87, 0.82] }
    },

    /**
     * 判断指定御三家形态与配饰是否存在造型冲突（返回冲突提示文案，无冲突返回 null）
     */
    getStarterAccConflict(skinId, levelOrStage, accId, isStage = false) {
        if (!this.isStarterSpecies(skinId) || !accId) return null;
        const stage = isStage ? (Number(levelOrStage) || 1) : this.getEvolutionStage(levelOrStage);

        if (skinId === 'starter_fire_fox') {
            if (['head_cyber_helmet', 'head_bamboo_hat', 'head_cat_headphones', 'head_headphone', 'hat_wizard', 'hat_beret'].includes(accId)) {
                return '与双尖耳穿模';
            }
            if (accId === 'scarf') {
                return '已有自带围巾';
            }
            if (stage === 3) {
                if (this.ACC_SPECS_3D[accId]?.slot === 'neck') return '与三阶立领冲突';
                if (['back_knight_cape', 'cape_royal', 'back_school_bag'].includes(accId)) return '被九尾灵狐尾部遮挡';
            }
        }

        if (skinId === 'starter_water_penguin') {
            if (stage === 2 && ['head_cyber_helmet', 'head_sprout', 'head_cat_headphones', 'head_headphone', 'head_sakura_crown'].includes(accId)) {
                return '与二阶水花冠冲突';
            }
            if (stage === 3) {
                if (this.ACC_SPECS_3D[accId]?.slot === 'head' && accId !== 'halo') return '与三阶冰冠冲突';
                if (this.ACC_SPECS_3D[accId]?.slot === 'neck') return '与三阶冰晶领饰冲突';
            }
        }

        if (skinId === 'starter_grass_dino') {
            if (stage === 1) {
                if (accId === 'head_sprout') return '已有头顶小嫩芽';
                if (accId === 'head_cyber_helmet' || accId === 'eye_holo_visor') return '与幼龙头部轮廓不贴合';
            }
            if (stage === 2 && this.ACC_SPECS_3D[accId]?.slot === 'head' && accId !== 'halo') {
                return '与二阶叶冠冲突';
            }
            if (stage === 3) {
                if (this.ACC_SPECS_3D[accId]?.slot === 'head' && accId !== 'halo') return '与三阶叶冠冲突';
                if (this.ACC_SPECS_3D[accId]?.slot === 'neck') return '与三阶叶领冲突';
                if (this.ACC_SPECS_3D[accId]?.slot === 'back') return '与三阶背棘叶翼冲突';
            }
        }

        return null;
    },

    has3DAsset(accId) {
        return Boolean(this.ACC_SPECS_3D[accId] && this.ACC_META_3D[accId]);
    },

    renderSingle3DAcc(id, anchor, uid, layerRole = 'all') {
        const sp = this.ACC_SPECS_3D[id];
        const m = this.ACC_META_3D[id];
        if (!sp || !m || !anchor) return '';
        const base = (typeof window !== 'undefined' && window.__PET_ASSET_BASE__) ? window.__PET_ASSET_BASE__ : '/shared/assets/';
        const ratio = m.h / m.w;
        const sc = anchor[2] || 1;
        let w, h;
        if (sp.fixH) {
            h = sp.fixH * sc;
            w = h / ratio;
        } else {
            w = sp.w * sc;
            h = w * ratio * (sp.sy || 1);
        }
        const x = anchor[0] + (sp.dx || 0) * sc;
        const y = anchor[1] + (sp.dy || 0) * sc;
        const ix = -w * sp.ax;
        const iy = -h * sp.ay;
        // 光环和耳麦不跟随头冠旋转
        const anchorRot = (id !== 'halo' && anchor[3]) ? anchor[3] : 0;
        const totalRot = (sp.rot || 0) + anchorRot;
        const rot = totalRot ? ` rotate(${totalRot})` : '';
        const flip = sp.flipX ? ' scale(-1,1)' : '';
        const clsAttr = sp.cls ? ` class="${sp.cls}"` : '';
        const img = `<image${clsAttr} href="${base}acc/${id}.png" x="${ix.toFixed(2)}" y="${iy.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="none"/>`;

        if (!sp.splitY || layerRole === 'all') {
            return `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)})${rot}${flip}">${img}</g>`;
        }
        const cid = `acc-clip-${uid}-${id}-${layerRole}`;
        const splitPx = h * sp.splitY;
        const rectY = layerRole === 'backHalf' ? iy : (iy + splitPx);
        const rectH = layerRole === 'backHalf' ? (splitPx + 2) : (h - splitPx + 2);
        return `
            <g transform="translate(${x.toFixed(2)},${y.toFixed(2)})${rot}${flip}">
                <defs><clipPath id="${cid}"><rect x="${(ix - 2).toFixed(2)}" y="${rectY.toFixed(2)}" width="${(w + 4).toFixed(2)}" height="${rectH.toFixed(2)}"/></clipPath></defs>
                <g clip-path="url(#${cid})">${img}</g>
            </g>
        `;
    },

    /**
     * 三大御三家 3D 潮玩手办级分层渲染管线
     */
    renderStarter3DRig(skinId, stage, accList, colorHue, level, uid) {
        const base = (typeof window !== 'undefined' && window.__PET_ASSET_BASE__) ? window.__PET_ASSET_BASE__ : '/shared/assets/';
        const petKey = `${skinId}_${stage}`;
        const anchors = this.PET_ANCHORS_3D[petKey] || this.PET_ANCHORS_3D.starter_fire_fox_1;
        const safeList = (accList || []).filter(id => !this.getStarterAccConflict(skinId, stage, id, true));
        const accSet = new Set(safeList);
        const hueStyle = colorHue ? `filter: hue-rotate(${colorHue}deg);` : '';

        const auraSvg = this.renderAuraLayer(accSet, uid);
        const bySlot = { head: [], eyes: [], back: [], neck: [], hand: [] };
        for (const id of safeList) {
            const sp = this.ACC_SPECS_3D[id];
            if (sp && bySlot[sp.slot]) bySlot[sp.slot].push(id);
        }

        const backHtml = bySlot.back.map(id => this.renderSingle3DAcc(id, anchors.back, uid, 'all')).join('');
        const neckBackHtml = bySlot.neck
            .filter(id => this.ACC_SPECS_3D[id].splitY)
            .map(id => this.renderSingle3DAcc(id, anchors.neck, uid, 'backHalf'))
            .join('');
        const neckFrontHtml = bySlot.neck
            .map(id => this.renderSingle3DAcc(id, anchors.neck, uid, this.ACC_SPECS_3D[id].splitY ? 'frontHalf' : 'all'))
            .join('');
        const eyesHtml = bySlot.eyes.map(id => this.renderSingle3DAcc(id, anchors.eye, uid, 'all')).join('');
        const headHtml = bySlot.head.map(id => this.renderSingle3DAcc(id, anchors.head, uid, 'all')).join('');
        const handHtml = bySlot.hand.map(id => this.renderSingle3DAcc(id, anchors.hand, uid, 'all')).join('');

        return `
            <svg class="pet-svg pet-svg-3d skin-${skinId} evo-stage-${stage}" viewBox="0 0 140 140" style="width: 100%; height: 100%; overflow: visible;">
                ${auraSvg}
                <g class="pet-accessories-back">${backHtml}${neckBackHtml}</g>
                <g class="pet-body-tint-group" style="${hueStyle}">
                    <image class="pet-3d-body" href="${base}pets/${petKey}.png" x="0" y="0" width="140" height="140" />
                </g>
                <g class="pet-accessories-front">
                    ${neckFrontHtml}
                    ${eyesHtml}
                    ${headHtml}
                    ${handHtml}
                </g>
            </svg>
        `;
    },

    /**
     * 批量生成全套 5 帧动作造型，供 .sprite3 打包使用
     */
    renderExportCostumes(skinId = 'default_cat', accessories = [], colorHue = 0, options = {}) {
        const poses = [
            { id: 'idle', name: '01_待机_idle' },
            { id: 'walk', name: '02_行走_walk' },
            { id: 'jump', name: '03_跳跃_jump' },
            { id: 'cheer', name: '04_欢呼_cheer' },
            { id: 'hurt', name: '05_受击_hurt' }
        ];
        return poses.map(p => ({
            id: p.id,
            name: p.name,
            svg: this.renderExportPoseSvg(skinId, accessories, colorHue, p.id, options)
        }));
    }
};

if (typeof window !== 'undefined') {
    window.PetRenderer = PetRenderer;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PetRenderer;
}
