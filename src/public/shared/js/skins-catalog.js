// 全局共享：三大御三家三阶进化物种 + 12款经典物种、捏脸五官、基础与精品配饰库、8款美食目录
const SKINS_CATALOG = [
    {
        id: 'starter_fire_fox',
        name: '焰尾小火狐',
        type: '火系御三家 · 三阶进化',
        isStarter: true,
        stages: ['火星小狐', '疾风炎狐', '炽天九曜灵狐'],
        price: 70,
        reqLevel: 1,
        desc: '【三阶真形态进化】从系着奶黄围巾的萌系幼狐，成长为火云双尾炎狐，最终觉醒九曜流火灵狐！',
        themeClass: 'theme-volcano',
        sceneBg: '/shared/assets/scenes/magic_cloud.png',
        sceneName: '星云浮空仙岛',
        icon: '🦊',
        primaryColor: '#ff5722'
    },
    {
        id: 'starter_water_penguin',
        name: '泡泡小企鹅',
        type: '水系御三家 · 三阶进化',
        isStarter: true,
        stages: ['泡泡小企鹅', '破浪冲锋鹅', '极光苍翼皇企鹅'],
        price: 70,
        reqLevel: 1,
        desc: '【三阶真形态进化】从呆萌雪球企鹅宝宝，蜕变为踏浪滑水少年，最终展翼封王为极光冰雪皇企鹅！',
        themeClass: 'theme-aurora',
        sceneBg: '/shared/assets/scenes/aurora_snow.png',
        sceneName: '极光冰雪乐园',
        icon: '🐧',
        primaryColor: '#0ea5e9'
    },
    {
        id: 'starter_grass_dino',
        name: '翠叶小恐龙',
        type: '草系御三家 · 三阶进化',
        isStarter: true,
        stages: ['嫩芽小呆龙', '青藤迅猛龙', '森之翼龙王'],
        price: 70,
        reqLevel: 1,
        desc: '【三阶真形态进化】从头顶嫩芽的圆润小绿龙，成长为藤蔓迅猛龙，觉醒时展开巨型翡翠叶翼！',
        themeClass: 'theme-bamboo',
        sceneBg: '/shared/assets/scenes/bamboo_hotspring.png',
        sceneName: '翠竹温泉庭院',
        icon: '🦕',
        primaryColor: '#22c55e'
    },
    {
        id: 'default_cat',
        name: '暖萌小橘',
        type: '阳光橘喵',
        price: 0,
        reqLevel: 1,
        desc: '天真活泼的课堂小伙伴，圆滚滚的肚皮里装满了奇思妙想。',
        themeClass: 'theme-classroom',
        sceneBg: '/shared/assets/scenes/sunny_courtyard.png',
        sceneName: '阳光木屋庭院',
        icon: '🐱',
        primaryColor: '#ff9800'
    },
    {
        id: 'shiba_sunny',
        name: '元气小柴犬',
        type: '治愈汪星',
        price: 45,
        reqLevel: 1,
        desc: '永远挂着治愈笑容的豆柴犬，摇着卷卷尾巴为你加油打气。',
        themeClass: 'theme-classroom',
        sceneBg: '/shared/assets/scenes/sunny_courtyard.png',
        sceneName: '阳光木屋庭院',
        icon: '🐕',
        primaryColor: '#f59e0b'
    },
    {
        id: 'capybara_zen',
        name: '佛系卡皮巴拉',
        type: '温泉水豚',
        price: 65,
        reqLevel: 2,
        desc: '情绪极其稳定的温泉水豚，头顶小橘子，泰山崩于前而面不改色。',
        themeClass: 'theme-bamboo',
        sceneBg: '/shared/assets/scenes/bamboo_hotspring.png',
        sceneName: '翠竹温泉庭院',
        icon: '🍊',
        primaryColor: '#b47b44'
    },
    {
        id: 'mech_dog',
        name: '赛博机械犬',
        type: '科技智械',
        price: 75,
        reqLevel: 2,
        desc: '搭载量子芯片的未来机甲向导，光学目镜闪烁着理性求知的光芒。',
        themeClass: 'theme-cyber',
        sceneBg: '/shared/assets/scenes/cyber_lab.png',
        sceneName: '潮玩科幻太空舱',
        icon: '🤖',
        primaryColor: '#00b8d4'
    },
    {
        id: 'bamboo_panda',
        name: '竹林小阿宝',
        type: '国风萌宝',
        price: 90,
        reqLevel: 3,
        desc: '爱啃青竹的国宝大熊猫，软乎乎的黑眼圈带来宁静专注的课堂心境。',
        themeClass: 'theme-bamboo',
        sceneBg: '/shared/assets/scenes/bamboo_hotspring.png',
        sceneName: '翠竹温泉庭院',
        icon: '🐼',
        primaryColor: '#4caf50'
    },
    {
        id: 'chubby_penguin',
        name: '极地小企鹅',
        type: '冰雪绅士',
        price: 100,
        reqLevel: 3,
        desc: '来自极光冰原的圆润小企鹅，迈着小碎步摇摇摆摆，憨态可掬。',
        themeClass: 'theme-aurora',
        sceneBg: '/shared/assets/scenes/aurora_snow.png',
        sceneName: '极光冰雪乐园',
        icon: '🐧',
        primaryColor: '#38a3f8'
    },
    {
        id: 'fire_dragon',
        name: '炽焰小飞龙',
        type: '活力元素',
        price: 120,
        reqLevel: 4,
        desc: '头顶金角、尾燃星火的小飞龙，每一次精彩发言都让它斗志昂扬！',
        themeClass: 'theme-volcano',
        sceneBg: '/shared/assets/scenes/magic_cloud.png',
        sceneName: '星云浮空仙岛',
        icon: '🐲',
        primaryColor: '#ff5722'
    },
    {
        id: 'ice_spirit',
        name: '极光雪鹿姬',
        type: '梦幻灵兽',
        price: 120,
        reqLevel: 4,
        desc: '头顶冰晶珊瑚鹿角的森林灵鹿，踏雪无痕，带来清澈敏捷的思维。',
        themeClass: 'theme-aurora',
        sceneBg: '/shared/assets/scenes/aurora_snow.png',
        sceneName: '极光冰雪乐园',
        icon: '🦌',
        primaryColor: '#26c6da'
    },
    {
        id: 'magic_fox',
        name: '星芒九尾狐',
        type: '幻梦仙灵',
        price: 150,
        reqLevel: 5,
        desc: '蓬松灵尾流转着樱粉星光的瑞兽小狐，聪慧机敏，伴你攻克难题。',
        themeClass: 'theme-galaxy',
        sceneBg: '/shared/assets/scenes/magic_cloud.png',
        sceneName: '星云浮空仙岛',
        icon: '🦊',
        primaryColor: '#f472b6'
    },
    {
        id: 'astro_cat',
        name: '星际领航喵',
        type: '深空探索',
        price: 180,
        reqLevel: 6,
        desc: '佩戴全景太空头罩与推进背包的宇航喵，带全班漫游知识星海。',
        themeClass: 'theme-galaxy',
        sceneBg: '/shared/assets/scenes/cyber_lab.png',
        sceneName: '潮玩科幻太空舱',
        icon: '🚀',
        primaryColor: '#9b72f2'
    },
    {
        id: 'lucky_cat',
        name: '祥瑞招财猫',
        type: '福气国潮',
        price: 200,
        reqLevel: 7,
        desc: '额印金纹、系着红绸金铃的福气瑞猫，祝同学们学业进步、金榜题名。',
        themeClass: 'theme-fortune',
        sceneBg: '/shared/assets/scenes/sunny_courtyard.png',
        sceneName: '阳光木屋庭院',
        icon: '🏮',
        primaryColor: '#ffb300'
    },
    {
        id: 'sky_dragon',
        name: '云端圣霄龙',
        type: '传世神兽',
        price: 0,
        reqLevel: 10,
        desc: '【Lv.10满级觉醒】翱翔于九天云海的智慧圣龙，象征至高荣誉与勤学结晶！',
        themeClass: 'theme-skydragon',
        sceneBg: '/shared/assets/scenes/magic_cloud.png',
        sceneName: '星云浮空仙岛',
        icon: '👑',
        primaryColor: '#ffd54f'
    }
];

// 捏脸五官定制库（全部免费，存储在 accessories 数组中，以 face_ 前缀标识）
const FACES_CATALOG = {
    eyes: [
        { id: 'face_eye_round', name: '灵动圆眼', icon: '👀', default: true },
        { id: 'face_eye_star', name: '璀璨星眼', icon: '🤩' },
        { id: 'face_eye_happy', name: '弯月笑眼', icon: '😊' },
        { id: 'face_eye_wink', name: '俏皮眨眼', icon: '😉' },
        { id: 'face_eye_cool', name: '酷盖半眯', icon: '😎' },
        { id: 'face_eye_sparkle', name: '水汪汪眼', icon: '🥺' }
    ],
    mouth: [
        { id: 'face_mouth_cat', name: '甜美猫嘴', icon: '😺', default: true },
        { id: 'face_mouth_grin', name: '元气大笑', icon: '😄' },
        { id: 'face_mouth_blep', name: '调皮吐舌', icon: '😋' },
        { id: 'face_mouth_owo', name: '呆萌惊讶', icon: '😮' },
        { id: 'face_mouth_fang', name: '小虎牙笑', icon: '😏' },
        { id: 'face_mouth_calm', name: '佛系浅笑', icon: '🙂' }
    ],
    cheeks: [
        { id: 'face_cheek_peach', name: '蜜桃腮红', icon: '🍑', default: true },
        { id: 'face_cheek_whiskers', name: '灵动胡须', icon: '🐾' },
        { id: 'face_cheek_stars', name: '星光面贴', icon: '⭐' },
        { id: 'face_cheek_hearts', name: '甜心印记', icon: '💕' },
        { id: 'face_cheek_bandaid', name: '元气创可贴', icon: '🩹' },
        { id: 'face_cheek_bolt', name: '闪电战纹', icon: '⚡' }
    ]
};

// 5大装扮分类 · 基础免费配饰 + 16款男女生向高定精品配饰库（含互斥槽位 slot）
const ACCESSORY_CATEGORIES = [
    { id: 'head', name: '头饰帽冠', icon: '🎩' },
    { id: 'eyes', name: '眼饰面具', icon: '👓' },
    { id: 'neck_back', name: '颈饰背翼', icon: '🪽' },
    { id: 'hand', name: '手持道具', icon: '🪄' },
    { id: 'aura', name: '伴生光效', icon: '✨' }
];

const ACCESSORIES_CATALOG = [
    // 1. 头饰 (head 槽互斥)
    { id: 'head_cyber_helmet', name: '全息机甲盔', category: 'head', slot: 'head', icon: '🪖', price: 28, isPremium: true, styleTag: '酷炫科技' },
    { id: 'head_sakura_crown', name: '水晶樱花冠', category: 'head', slot: 'head', icon: '🌸', price: 28, isPremium: true, styleTag: '甜美魔法' },
    { id: 'head_bamboo_hat', name: '侠客红穗笠', category: 'head', slot: 'head', icon: '🎋', price: 22, isPremium: true, styleTag: '国风仙侠' },
    { id: 'head_cat_headphones', name: '发光猫耳机', category: 'head', slot: 'head', icon: '🎧', price: 25, isPremium: true, styleTag: '潮玩校园' },
    { id: 'hat_cap', name: '炫彩棒球帽', category: 'head', slot: 'head', icon: '🧢', price: 0, isPremium: false },
    { id: 'crown', name: '王者金皇冠', category: 'head', slot: 'head', icon: '👑', price: 0, isPremium: false },
    { id: 'halo', name: '纯洁金光环', category: 'head', slot: 'head', icon: '😇', price: 0, isPremium: false },
    { id: 'hat_wizard', name: '星辰巫师帽', category: 'head', slot: 'head', icon: '🧙', price: 0, isPremium: false },
    { id: 'hat_beret', name: '画家贝雷帽', category: 'head', slot: 'head', icon: '🎨', price: 0, isPremium: false },
    { id: 'head_sprout', name: '生机小豆芽', category: 'head', slot: 'head', icon: '🌱', price: 0, isPremium: false },
    { id: 'head_headphone', name: '经典耳麦', category: 'head', slot: 'head', icon: '🎵', price: 0, isPremium: false },

    // 2. 眼饰面饰 (eyes 槽互斥)
    { id: 'eye_holo_visor', name: '霓虹全息镜', category: 'eyes', slot: 'eyes', icon: '🥽', price: 20, isPremium: true, styleTag: '酷炫科技' },
    { id: 'eye_star_gold', name: '粉星圆金镜', category: 'eyes', slot: 'eyes', icon: '✨', price: 20, isPremium: true, styleTag: '甜美魔法' },
    { id: 'eye_heart_tint', name: '甜心桃心镜', category: 'eyes', slot: 'eyes', icon: '💖', price: 15, isPremium: true, styleTag: '甜美魔法' },
    { id: 'eye_battle_patch', name: '闪电战纹贴', category: 'eyes', slot: 'eyes', icon: '⚡', price: 12, isPremium: true, styleTag: '酷炫科技' },
    { id: 'glasses_round', name: '学霸圆金镜', category: 'eyes', slot: 'eyes', icon: '👓', price: 0, isPremium: false },
    { id: 'glasses_sun', name: '酷炫像素镜', category: 'eyes', slot: 'eyes', icon: '🕶️', price: 0, isPremium: false },
    { id: 'glasses_cyber', name: '赛博护目镜', category: 'eyes', slot: 'eyes', icon: '🔵', price: 0, isPremium: false },
    { id: 'glasses_star', name: '派对星星镜', category: 'eyes', slot: 'eyes', icon: '🤩', price: 0, isPremium: false },
    { id: 'mask_sleep', name: '云朵睡眠罩', category: 'eyes', slot: 'eyes', icon: '💤', price: 0, isPremium: false },

    // 3. 颈饰与背饰 (细分为 neck 槽与 back 槽，可同时佩戴1件颈饰+1件背饰)
    { id: 'back_mecha_jet', name: '量子推进翼', category: 'neck_back', slot: 'back', icon: '🚀', price: 35, isPremium: true, styleTag: '酷炫科技' },
    { id: 'back_fairy_butterfly', name: '幻彩仙蝶翼', category: 'neck_back', slot: 'back', icon: '🦋', price: 35, isPremium: true, styleTag: '甜美魔法' },
    { id: 'back_knight_cape', name: '赤金侠客袍', category: 'neck_back', slot: 'back', icon: '🧣', price: 34, isPremium: true, styleTag: '国风仙侠' },
    { id: 'back_school_bag', name: '星徽小书包', category: 'neck_back', slot: 'back', icon: '🎒', price: 20, isPremium: true, styleTag: '潮玩校园' },
    { id: 'bow_tie', name: '绅士红领结', category: 'neck_back', slot: 'neck', icon: '🎀', price: 0, isPremium: false },
    { id: 'scarf', name: '暖心红围巾', category: 'neck_back', slot: 'neck', icon: '🔴', price: 0, isPremium: false },
    { id: 'bell_collar', name: '招财金铃铛', category: 'neck_back', slot: 'neck', icon: '🔔', price: 0, isPremium: false },
    { id: 'wings', name: '天使白羽翼', category: 'neck_back', slot: 'back', icon: '🪽', price: 0, isPremium: false },
    { id: 'wings_fairy', name: '轻盈彩翼', category: 'neck_back', slot: 'back', icon: '🧚', price: 0, isPremium: false },
    { id: 'cape_royal', name: '荣耀星披风', category: 'neck_back', slot: 'back', icon: '🦸', price: 0, isPremium: false },

    // 4. 手持道具 (hand 槽互斥)
    { id: 'hand_energy_sword', name: '蓝光能量剑', category: 'hand', slot: 'hand', icon: '⚔️', price: 32, isPremium: true, styleTag: '酷炫科技' },
    { id: 'hand_moon_wand', name: '星月水晶棒', category: 'hand', slot: 'hand', icon: '🌙', price: 32, isPremium: true, styleTag: '甜美魔法' },
    { id: 'hand_jade_fan', name: '翠玉竹折扇', category: 'hand', slot: 'hand', icon: '🪭', price: 25, isPremium: true, styleTag: '国风仙侠' },
    { id: 'hand_gamepad_boba', name: '潮玩掌机', category: 'hand', slot: 'hand', icon: '🎮', price: 18, isPremium: true, styleTag: '潮玩校园' },
    { id: 'hand_wand', name: '星光仙女棒', category: 'hand', slot: 'hand', icon: '🪄', price: 0, isPremium: false },
    { id: 'hand_book', name: '满分学霸书', category: 'hand', slot: 'hand', icon: '📘', price: 0, isPremium: false },
    { id: 'hand_bamboo', name: '翠绿鲜竹枝', category: 'hand', slot: 'hand', icon: '🎍', price: 0, isPremium: false },
    { id: 'hand_balloon', name: '梦幻气球束', category: 'hand', slot: 'hand', icon: '🎈', price: 0, isPremium: false },
    { id: 'hand_boba', name: '快乐波霸奶', category: 'hand', slot: 'hand', icon: '🧋', price: 0, isPremium: false },

    // 5. 伴生光效 (aura 槽互斥)
    { id: 'aura_stars', name: '璀璨星轨环', category: 'aura', slot: 'aura', icon: '🌟', price: 0, isPremium: false },
    { id: 'aura_sakura', name: '浪漫樱花雨', category: 'aura', slot: 'aura', icon: '🌸', price: 0, isPremium: false },
    { id: 'aura_notes', name: '欢快音符律', category: 'aura', slot: 'aura', icon: '🎵', price: 0, isPremium: false },
    { id: 'aura_fire', name: '烈焰觉醒气', category: 'aura', slot: 'aura', icon: '🔥', price: 0, isPremium: false },
    { id: 'aura_snow', name: '晶莹雪花舞', category: 'aura', slot: 'aura', icon: '❄️', price: 0, isPremium: false }
];

// 多品类美食工坊目录
const FOODS_CATALOG = [
    {
        id: 'dried_fish',
        name: '美味小鱼干',
        icon: '🐟',
        cost: 2,
        fullnessBoost: 15,
        expBoost: 8,
        desc: '酥脆咸香的海味小零食，猫咪们的最爱。',
        reaction: '咔嚓咔嚓~ 小鱼干太香啦！🐟'
    },
    {
        id: 'fresh_bamboo',
        name: '鲜嫩甜竹笋',
        icon: '🎋',
        cost: 2,
        fullnessBoost: 18,
        expBoost: 10,
        desc: '清晨采摘的脆嫩春笋，清甜爽口。',
        reaction: '嘎嘣脆！满口都是竹林的清香~ 🎋'
    },
    {
        id: 'rainbow_candy',
        name: '跳跳彩虹糖',
        icon: '🍬',
        cost: 3,
        fullnessBoost: 12,
        expBoost: 18,
        desc: '在舌尖噼啪跳跃的魔法糖果，经验值大幅提升！',
        reaction: '哇！嘴巴里在放彩虹烟花！🌈'
    },
    {
        id: 'berry_cake',
        name: '草莓奶油蛋糕',
        icon: '🍰',
        cost: 3,
        fullnessBoost: 22,
        expBoost: 15,
        desc: '绵密奶油配新鲜红颜草莓，幸福感爆棚。',
        reaction: '软绵绵甜丝丝，心情瞬间满分！🍰'
    },
    {
        id: 'cyber_cube',
        name: '超能光子块',
        icon: '⚡',
        cost: 4,
        fullnessBoost: 25,
        expBoost: 20,
        desc: '浓缩高能智慧粒子的几何方糖，瞬间充能完毕。',
        reaction: '滴——能量槽100%充能完毕！⚡'
    },
    {
        id: 'arctic_salmon',
        name: '冰鲜三文鱼',
        icon: '🍣',
        cost: 5,
        fullnessBoost: 30,
        expBoost: 24,
        desc: '来自极光海域的厚切刺身，营养满满。',
        reaction: '入口即化！浑身充满力量~ 🍣'
    },
    {
        id: 'star_fruit',
        name: '流光星辰果',
        icon: '🌟',
        cost: 6,
        fullnessBoost: 35,
        expBoost: 38,
        desc: '凝结星河甘露的奇幻果实，助力宠物快速升级。',
        reaction: '✨ 吸收星辰之力，智慧经验暴涨！'
    },
    {
        id: 'gold_can',
        name: '至尊黄金罐头',
        icon: '🥫',
        cost: 8,
        fullnessBoost: 50,
        expBoost: 55,
        desc: '大厨秘制的豪华营养盛宴，一次喂饱半管肚子！',
        reaction: '🎉 哇塞！吃到传说中的黄金盛宴啦！'
    }
];

const BACKGROUNDS_CATALOG = [
    {
        id: 'sunny_courtyard',
        name: '阳光木屋庭院',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 0,
        reqLevel: 1,
        bgUrl: '/shared/assets/scenes/sunny_courtyard.png',
        icon: '🏡',
        tag: '免费基础',
        desc: '温暖明亮的木屋草坪，微风拂过栅栏，经典治愈系小窝。'
    },
    {
        id: 'bamboo_hotspring',
        name: '翠竹温泉庭院',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 15,
        reqLevel: 1,
        bgUrl: '/shared/assets/scenes/bamboo_hotspring.png',
        icon: '🎋',
        tag: '森系治愈',
        desc: '青翠竹林环绕热气袅袅的露天温泉，宁静又惬意。'
    },
    {
        id: 'aurora_snow',
        name: '极光冰雪乐园',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 20,
        reqLevel: 1,
        bgUrl: '/shared/assets/scenes/aurora_snow.png',
        icon: '❄️',
        tag: '梦幻雪景',
        desc: '绚丽极光漫天飞舞，圆润冰屋旁点亮暖黄灯光。'
    },
    {
        id: 'magic_cloud',
        name: '星云浮空仙岛',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 25,
        reqLevel: 2,
        bgUrl: '/shared/assets/scenes/magic_cloud.png',
        icon: '☁️',
        tag: '奇幻秘境',
        desc: '漂浮在云海与星辰之间的魔法岛屿，浪漫又梦幻。'
    },
    {
        id: 'sakura_picnic',
        name: '樱花野餐草坪',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 28,
        reqLevel: 1,
        bgUrl: '/shared/assets/scenes/sakura_picnic.png',
        icon: '🌸',
        tag: '新品推荐',
        desc: '漫天樱花瓣飘落，格子野餐垫和草莓蛋糕已经备好！'
    },
    {
        id: 'cloud_bakery',
        name: '云朵甜品小屋',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 32,
        reqLevel: 2,
        bgUrl: '/shared/assets/scenes/cloud_bakery.png',
        icon: '🍰',
        tag: '甜系少女',
        desc: '马卡龙粉彩天空配巨型甜甜圈招牌，甜度满分！'
    },
    {
        id: 'starry_treehouse',
        name: '星空树屋露台',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 36,
        reqLevel: 2,
        bgUrl: '/shared/assets/scenes/starry_treehouse.png',
        icon: '🌙',
        tag: '温馨夜色',
        desc: '挂满暖黄灯串的大树屋露台，架起望远镜数星星。'
    },
    {
        id: 'cyber_lab',
        name: '潮玩科幻太空舱',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 20,
        reqLevel: 1,
        bgUrl: '/shared/assets/scenes/cyber_lab.png',
        icon: '🚀',
        tag: '科幻潮流',
        desc: '全景星空舷窗配全息控制台，探索宇宙边界。'
    },
    {
        id: 'esports_room',
        name: '霓虹电竞指挥室',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 32,
        reqLevel: 1,
        bgUrl: '/shared/assets/scenes/esports_room.png',
        icon: '🎮',
        tag: '新品热门',
        desc: '双屏曲面显示器、RGB 蜂巢灯墙与奖杯柜，排面拉满！'
    },
    {
        id: 'cyber_maker',
        name: '未来科创工坊',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 36,
        reqLevel: 2,
        bgUrl: '/shared/assets/scenes/cyber_maker.png',
        icon: '🔬',
        tag: 'AI科创',
        desc: '3D打印机、全息地球仪、无人机工作台与科创奖杯柜，科技感爆棚！'
    },
    {
        id: 'mecha_hangar',
        name: '星际机甲格纳库',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 45,
        reqLevel: 3,
        bgUrl: '/shared/assets/scenes/mecha_hangar.png',
        icon: '🤖',
        tag: '硬核机甲',
        desc: '高能反应柱与合金停机坪，迎接王牌机师宠物出击！'
    }
];

const FRAMES_CATALOG = [
    {
        id: 'default_wood',
        name: '原木基础框',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 0,
        reqLevel: 1,
        icon: '🪵',
        tag: '免费基础',
        desc: '温润自然的浅木色边框，简洁百搭。'
    },
    {
        id: 'sakura_bloom',
        name: '樱花花环框',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 18,
        reqLevel: 1,
        icon: '🌸',
        tag: '春日限定',
        desc: '粉白樱花渐变描边，自带温柔春日光晕。'
    },
    {
        id: 'bamboo_jade',
        name: '森友青竹框',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 22,
        reqLevel: 1,
        icon: '🎋',
        tag: '森系清新',
        desc: '清透翡翠竹绿边框，看着就神清气爽。'
    },
    {
        id: 'macaron_cream',
        name: '马卡龙甜心框',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 28,
        reqLevel: 2,
        icon: '🧁',
        tag: '甜系少女',
        desc: '粉紫奶油渐变边框，甜甜的童话质感。'
    },
    {
        id: 'cyber_neon',
        name: '赛博霓虹框',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 24,
        reqLevel: 1,
        icon: '💠',
        tag: '人气热销',
        desc: '深空暗底配电光青紫双色霓虹外发光，一眼吸睛！'
    },
    {
        id: 'mecha_steel',
        name: '星际机甲框',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 34,
        reqLevel: 2,
        icon: '🛡️',
        tag: '硬核科技',
        desc: '冷峻金属质感配冰蓝能量光边，机甲感十足。'
    },
    {
        id: 'esports_rgb',
        name: '电竞幻彩框',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 38,
        reqLevel: 2,
        icon: '🎮',
        tag: '排面拉满',
        desc: '暗夜紫黑底配红蓝撞色电竞光效，大屏上超显眼！'
    },
    {
        id: 'royal_gold',
        name: '星耀鎏金框',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 45,
        reqLevel: 4,
        icon: '👑',
        tag: '巅峰荣耀',
        desc: '流光溢彩的荣耀鎏金边框，学霸与强者专属。'
    }
];

const TITLES_CATALOG = [
    {
        id: 'classroom_rookie',
        name: '课堂萌新',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 0,
        reqLevel: 1,
        icon: '🌱',
        desc: '刚开启宠物陪伴旅程的新伙伴！'
    },
    {
        id: 'focus_star',
        name: '专注小能手',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 12,
        reqLevel: 1,
        icon: '📘',
        desc: '上课专心致志，笔记记得又快又好。'
    },
    {
        id: 'cozy_keeper',
        name: '暖萌饲养员',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 18,
        reqLevel: 1,
        icon: '🐾',
        desc: '把小宠物照顾得白白胖胖、心情满分。'
    },
    {
        id: 'full_attendance',
        name: '全勤小标兵',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 24,
        reqLevel: 2,
        icon: '🏅',
        desc: '每节课都精神饱满，从不掉队。'
    },
    {
        id: 'island_architect',
        name: '庭院造梦师',
        style: 'cozy',
        styleLabel: '🌸 暖萌森友',
        price: 34,
        reqLevel: 2,
        icon: '🏡',
        desc: '审美在线，把小窝布置得像童话世界。'
    },
    {
        id: 'fast_responder',
        name: '闪电响应王',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 20,
        reqLevel: 1,
        icon: '⚡',
        desc: '老师一提问就举手，手速和反应都超快！'
    },
    {
        id: 'maker_talent',
        name: '未来科创家',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 26,
        reqLevel: 2,
        icon: '🔬',
        desc: '热爱信息科技与编程，脑洞大开。'
    },
    {
        id: 'mecha_pilot',
        name: '王牌机师',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 32,
        reqLevel: 2,
        icon: '🚀',
        desc: '驾驭科技与梦想，向星辰大海出发。'
    },
    {
        id: 'esports_mvp',
        name: '课堂MVP',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 38,
        reqLevel: 3,
        icon: '🏆',
        desc: '小组协作与课堂表现全场最佳！'
    },
    {
        id: 'mythic_legend',
        name: '满级传说',
        style: 'cyber',
        styleLabel: '⚡ 酷炫电竞',
        price: 45,
        reqLevel: 5,
        icon: '👑',
        desc: '实力与颜值兼具的全班传奇人物。'
    }
];

// 王者荣耀 × 电子宠物融合 7 大段位体系
const RANKS_CATALOG = [
    { id: 'bronze_pet', name: '青铜萌宠', minScore: 0, icon: '🥉', color: '#92400E', bg: '#FEF3C7' },
    { id: 'silver_buddy', name: '白银伙伴', minScore: 120, icon: '🥈', color: '#475569', bg: '#F1F5F9' },
    { id: 'gold_guard', name: '黄金护卫', minScore: 280, icon: '🥇', color: '#B45309', bg: '#FEF9C3' },
    { id: 'platinum_knight', name: '铂金骑士', minScore: 500, icon: '💠', color: '#0F766E', bg: '#CCFBF1' },
    { id: 'diamond_lord', name: '钻石领主', minScore: 800, icon: '💎', color: '#1D4ED8', bg: '#DBEAFE' },
    { id: 'star_master', name: '星耀大师', minScore: 1200, icon: '🌟', color: '#7E22CE', bg: '#F3E8FF' },
    { id: 'glory_king', name: '荣耀王者', minScore: 1800, icon: '👑', color: '#BE123C', bg: 'linear-gradient(90deg, #FEF08A, #FBCFE8)' }
];

// 5 大多维荣耀排行榜定义
const LEADERBOARD_TYPES = [
    { id: 'honor', name: '综合荣耀榜', icon: '👑', unit: '荣耀值', desc: '综合累计成长积分、宠物等级、图鉴与收藏' },
    { id: 'darkhorse', name: '黑马进步榜', icon: '⚡', unit: '成长分', desc: '按本周期新增成长积分排名，人人都有机会登顶' },
    { id: 'collection', name: '图鉴收藏榜', icon: '💎', unit: '收藏度', desc: '比拼已解锁的物种、满级图鉴、背景、边框与称号' },
    { id: 'popularity', name: '暖心人气榜', icon: '💖', unit: '人气值', desc: '统计收到同学串门贴贴与投喂零食的次数' },
    { id: 'grade', name: '同年级总榜', icon: '🏫', unit: '荣耀值', desc: '跨班同年级小伙伴综合荣耀大比拼' }
];

if (typeof window !== 'undefined') {
    window.SKINS_CATALOG = SKINS_CATALOG;
    window.FACES_CATALOG = FACES_CATALOG;
    window.ACCESSORY_CATEGORIES = ACCESSORY_CATEGORIES;
    window.ACCESSORIES_CATALOG = ACCESSORIES_CATALOG;
    window.FOODS_CATALOG = FOODS_CATALOG;
    window.BACKGROUNDS_CATALOG = BACKGROUNDS_CATALOG;
    window.FRAMES_CATALOG = FRAMES_CATALOG;
    window.TITLES_CATALOG = TITLES_CATALOG;
    window.RANKS_CATALOG = RANKS_CATALOG;
    window.LEADERBOARD_TYPES = LEADERBOARD_TYPES;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SKINS_CATALOG,
        FACES_CATALOG,
        ACCESSORY_CATEGORIES,
        ACCESSORIES_CATALOG,
        FOODS_CATALOG,
        BACKGROUNDS_CATALOG,
        FRAMES_CATALOG,
        TITLES_CATALOG,
        RANKS_CATALOG,
        LEADERBOARD_TYPES
    };
}
