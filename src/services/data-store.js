const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// 统一数据文件存储路径（支持开发环境与 pkg 打包后的可执行文件同级目录）
const getDataDir = () => {
    let dir;
    if (process.pkg) {
        // pkg 打包运行模式：保存在 exe 文件同级 data 目录下
        dir = path.join(path.dirname(process.execPath), 'data');
    } else {
        // 源码运行模式：保存在项目根目录下的 data 目录
        dir = path.join(__dirname, '../../data');
    }
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
};

const DATA_DIR = getDataDir();
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const OUTFITS_FILE = path.join(DATA_DIR, 'outfits.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const PERMISSIONS_FILE = path.join(DATA_DIR, 'permissions.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ROSTER_FILE = path.join(DATA_DIR, 'roster.json');
const CLASSES_DIR = path.join(DATA_DIR, 'classes');

function normalizeClassKey(name) {
    return String(name || '').replace(/[\s()（）【】[\]]+/g, '').trim();
}

function getClassFilePath(className) {
    if (!fs.existsSync(CLASSES_DIR)) {
        fs.mkdirSync(CLASSES_DIR, { recursive: true });
    }
    const safeName = normalizeClassKey(className) || 'default_class';
    return path.join(CLASSES_DIR, `${safeName}.json`);
}

let rosterCache = null;
function loadRosterData() {
    if (rosterCache) return rosterCache;
    if (fs.existsSync(ROSTER_FILE)) {
        try {
            rosterCache = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf-8'));
            return rosterCache;
        } catch (e) {
            console.error('[DataStore] 读取 roster.json 失败', e);
        }
    }
    return { classes: [], students: [] };
}

function createDefaultPet() {
    return {
        level: 0,
        exp: 0,
        fullness: 80,
        coins: 60,
        currentSkin: 'default_cat',
        currentBackground: null,
        currentFrame: 'default_wood',
        currentTitle: 'classroom_rookie',
        currentOutfitId: null,
        unlockedSkins: ['default_cat'],
        unlockedBackgrounds: ['sunny_courtyard'],
        unlockedFrames: ['default_wood'],
        unlockedTitles: ['classroom_rookie'],
        unlockedAccessories: [],
        hasChosenStarter: false,
        drawChances: 3,
        dex: [],
        generation: 1,
        isCracked: false,
        accessories: [],
        colorHue: 0,
        lastTouchTime: 0,
        lastFeedTime: 0,
        totalEarnedScore: 0,
        periodScore: 0,
        periodKey: '',
        popularity: 0,
        lastCheckinDate: '',
        lastHighfiveRewardDate: ''
    };
}

// 内存高速缓存
let studentsCache = [];
let outfitsCache = [];
let logsCache = [];
let permissionsCache = {
    currentMode: 'class', // 'class' | 'break' | 'interactive' | 'dismissed'
    modeEndTime: null,
    decayEnabled: true,
    allowOutfitPublish: false
};
let configCache = {
    port: 3000,
    className: '七年级(1)班',
    adoptionMode: 'choose', // 'choose' | 'draw'
    visibleBoards: ['honor', 'darkhorse', 'collection', 'popularity'],
    darkhorsePeriodKey: null,
    teacherPasswordHash: '', // 默认 teacher123
    defaultStudentPassword: '123',
    aiReview: {
        mode: 'rule', // 'rule' or 'llm'
        llmEndpoint: '',
        llmApiKey: '',
        llmModel: 'gpt-3.5-turbo'
    }
};

// 45位默认学生姓名库
const DEFAULT_STUDENT_NAMES = [
    '张晨', '李子涵', '王宇轩', '赵梓晴', '刘俊杰', '陈雨桐', '杨浩宇', '黄欣怡', '周博文', '吴若曦',
    '徐泽宇', '孙梦琪', '马天佑', '朱诗涵', '胡逸飞', '郭嘉欣', '何锦程', '高雅楠', '林子墨', '罗思源',
    '郑凯文', '梁晓峰', '谢佳怡', '宋子恒', '唐语嫣', '许振轩', '韩依诺', '冯嘉豪', '邓雅婷', '曹煜晨',
    '彭宇辰', '曾楚涵', '萧天逸', '田雨馨', '董子轩', '袁若水', '潘俊宇', '于梦瑶', '蒋浩然', '蔡佳颖',
    '余明轩', '叶梓涵', '杜宇飞', '苏若琳', '魏宏远'
];

// 安全写入 JSON 文件
function writeJsonAtomic(filePath, data) {
    try {
        const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tempPath, filePath);
    } catch (err) {
        console.error(`[DataStore] 写入文件失败: ${filePath}`, err);
    }
}

class DataStore {
    constructor() {
        this.init();
    }

    init() {
        console.log(`[DataStore] 数据目录位置: ${DATA_DIR}`);

        // 1. 初始化系统配置
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                configCache = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
            } catch (e) {
                console.error('[DataStore] 读取 config.json 错误，重新生成', e);
            }
        }
        if (!configCache.adoptionMode) {
            configCache.adoptionMode = 'choose';
        }
        if (!Array.isArray(configCache.visibleBoards)) {
            configCache.visibleBoards = ['honor', 'darkhorse', 'collection', 'popularity'];
        }
        if (configCache.darkhorsePeriodKey === undefined) {
            configCache.darkhorsePeriodKey = null;
        }
        if (!configCache.teacherPasswordHash) {
            configCache.teacherPasswordHash = bcrypt.hashSync('teacher123', 8);
            writeJsonAtomic(CONFIG_FILE, configCache);
        }

        // 2. 初始化权限状态
        if (fs.existsSync(PERMISSIONS_FILE)) {
            try {
                permissionsCache = JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf-8'));
            } catch (e) {
                console.error('[DataStore] 读取 permissions.json 错误，使用默认设置', e);
            }
        } else {
            writeJsonAtomic(PERMISSIONS_FILE, permissionsCache);
        }

        if (permissionsCache.currentMode === 'outfit_create') {
            permissionsCache.currentMode = 'interactive';
            permissionsCache.modeEndTime = null;
            writeJsonAtomic(PERMISSIONS_FILE, permissionsCache);
        }

        // 启动时检查临时课堂模式是否已过期，若已过期立即恢复为标准上课模式
        if (permissionsCache.modeEndTime && Date.now() >= permissionsCache.modeEndTime) {
            console.log('[DataStore] 检测到过期的临时课堂模式，启动时已即时重置为上课模式');
            permissionsCache.currentMode = 'class';
            permissionsCache.modeEndTime = null;
            writeJsonAtomic(PERMISSIONS_FILE, permissionsCache);
        }

        // 3. 初始化学生数据
        if (fs.existsSync(STUDENTS_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf-8'));
                studentsCache = Array.isArray(data) ? data : (data.students || []);
            } catch (e) {
                console.error('[DataStore] 读取 students.json 错误', e);
                studentsCache = [];
            }
        }

        if (!studentsCache || studentsCache.length === 0) {
            console.log('[DataStore] 初始化 45 名默认学生数据...');
            const defaultHash = bcrypt.hashSync(configCache.defaultStudentPassword || '123', 8);
            studentsCache = [];
            for (let i = 1; i <= 45; i++) {
                const noStr = i < 10 ? `0${i}` : `${i}`;
                const name = DEFAULT_STUDENT_NAMES[i - 1] || `学生${noStr}`;
                studentsCache.push({
                    id: i,
                    username: `s${noStr}`,
                    displayName: `${noStr}号 ${name}`,
                    passwordHash: defaultHash,
                    role: 'student',
                    status: 'active', // 'active' | 'frozen'
                    pet: createDefaultPet(),
                    createdAt: new Date().toISOString()
                });
            }
            this.saveStudents();
        } else {
            // 兼容老学生档案补全御三家领养、图鉴与多周目字段
            let migrated = false;
            studentsCache.forEach(s => {
                if (!s.pet) return;
                if (!Array.isArray(s.pet.unlockedAccessories)) {
                    s.pet.unlockedAccessories = [];
                    migrated = true;
                }
                if (typeof s.pet.hasChosenStarter !== 'boolean') {
                    const hasCustomSkin = s.pet.currentSkin && s.pet.currentSkin !== 'default_cat';
                    const hasExtraSkins = Array.isArray(s.pet.unlockedSkins) && s.pet.unlockedSkins.some(id => id !== 'default_cat');
                    s.pet.hasChosenStarter = Boolean(hasCustomSkin || hasExtraSkins);
                    migrated = true;
                }
                if (typeof s.pet.drawChances !== 'number') {
                    s.pet.drawChances = 3;
                    migrated = true;
                }
                if (!Array.isArray(s.pet.dex)) {
                    s.pet.dex = [];
                    migrated = true;
                }
                if (typeof s.pet.generation !== 'number') {
                    s.pet.generation = 1;
                    migrated = true;
                }
                if (typeof s.pet.isCracked !== 'boolean') {
                    s.pet.isCracked = false;
                    migrated = true;
                }
            });
            if (migrated) this.saveStudents();
        }

        // 4. 初始化装扮数据
        if (fs.existsSync(OUTFITS_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(OUTFITS_FILE, 'utf-8'));
                outfitsCache = Array.isArray(data) ? data : (data.outfits || []);
            } catch (e) {
                console.error('[DataStore] 读取 outfits.json 错误', e);
                outfitsCache = [];
            }
        } else {
            writeJsonAtomic(OUTFITS_FILE, outfitsCache);
        }

        // 5. 初始化日志数据
        if (fs.existsSync(LOGS_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
                logsCache = Array.isArray(data) ? data : (data.logs || []);
            } catch (e) {
                console.error('[DataStore] 读取 logs.json 错误', e);
                logsCache = [];
            }
        } else {
            writeJsonAtomic(LOGS_FILE, logsCache);
        }
    }

    // ── 学生存取 ────────────────────────────────────────────────
    createDefaultPet() {
        return createDefaultPet();
    }

    getAllStudents() {
        return studentsCache;
    }

    getSafeStudent(student) {
        if (!student) return null;
        const { passwordHash, ...safe } = student;
        return safe;
    }

    getSafeStudentById(id) {
        const student = this.getStudentById(id);
        return this.getSafeStudent(student);
    }

    getAllSafeStudents() {
        return studentsCache.map(s => this.getSafeStudent(s));
    }

    getSameGradeClassStudents() {
        const curClassName = String(configCache.className || '');
        const gradeMatch = curClassName.match(/^([一二三四五六七八九十高初\d]+年级|高[一二三]|初[一二三])/);
        const gradeName = gradeMatch ? gradeMatch[1] : curClassName;
        const currentKey = normalizeClassKey(curClassName);

        const combined = studentsCache.map(s => ({
            ...this.getSafeStudent(s),
            className: curClassName
        }));
        let classCount = 1;

        if (fs.existsSync(CLASSES_DIR)) {
            const files = fs.readdirSync(CLASSES_DIR).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const parsed = JSON.parse(fs.readFileSync(path.join(CLASSES_DIR, file), 'utf-8'));
                    const cName = parsed.className || path.basename(file, '.json');
                    if (normalizeClassKey(cName) === currentKey) continue;
                    const cMatch = String(cName).match(/^([一二三四五六七八九十高初\d]+年级|高[一二三]|初[一二三])/);
                    const cGrade = cMatch ? cMatch[1] : '';
                    if (gradeName && cGrade === gradeName && Array.isArray(parsed.students)) {
                        classCount += 1;
                        parsed.students.forEach(st => {
                            combined.push({
                                ...this.getSafeStudent(st),
                                className: cName
                            });
                        });
                    }
                } catch (e) {
                    console.error(`[DataStore] 读取同年级班级 ${file} 失败`, e);
                }
            }
        }

        return { gradeName, classCount, students: combined };
    }

    getStudentById(id) {
        const numId = Number(id);
        return studentsCache.find(s => s.id === numId) || null;
    }

    getStudentByUsername(username) {
        if (!username) return null;
        return studentsCache.find(s => s.username.toLowerCase() === username.toLowerCase().trim()) || null;
    }

    updateStudent(id, updater) {
        const student = this.getStudentById(id);
        if (!student) return null;
        updater(student);
        this.saveStudents();
        return student;
    }

    resetStudentPassword(id, newPassword = '123') {
        const student = this.getStudentById(id);
        if (!student) return false;
        student.passwordHash = bcrypt.hashSync(newPassword, 8);
        this.saveStudents();
        return true;
    }

    saveStudents() {
        writeJsonAtomic(STUDENTS_FILE, { students: studentsCache });
        if (configCache.className) {
            writeJsonAtomic(getClassFilePath(configCache.className), {
                className: configCache.className,
                students: studentsCache
            });
        }
    }

    getAvailableClasses() {
        const roster = loadRosterData();
        const classList = Array.isArray(roster.classes) ? roster.classes.map(c => c.name) : [];
        const current = configCache.className;
        if (current && !classList.some(c => normalizeClassKey(c) === normalizeClassKey(current))) {
            classList.unshift(current);
        }
        return classList;
    }

    buildStudentsForClass(className) {
        const roster = loadRosterData();
        const targetKey = normalizeClassKey(className);
        const defaultHash = bcrypt.hashSync(configCache.defaultStudentPassword || '123', 8);
        const matched = (roster.students || [])
            .filter(s => normalizeClassKey(s.class_name) === targetKey)
            .sort((a, b) => Number(a.student_no) - Number(b.student_no));

        if (matched.length > 0) {
            return matched.map((st, idx) => {
                const noNum = Number(st.student_no) || (idx + 1);
                const noStr = noNum < 10 ? `0${noNum}` : `${noNum}`;
                return {
                    id: noNum,
                    username: `s${noStr}`,
                    displayName: `${noStr}号 ${st.student_name}`,
                    passwordHash: defaultHash,
                    role: 'student',
                    status: 'active',
                    pet: createDefaultPet(),
                    createdAt: new Date().toISOString()
                };
            });
        }

        const fallback = [];
        for (let i = 1; i <= 45; i++) {
            const noStr = i < 10 ? `0${i}` : `${i}`;
            const name = DEFAULT_STUDENT_NAMES[i - 1] || `学生${noStr}`;
            fallback.push({
                id: i,
                username: `s${noStr}`,
                displayName: `${noStr}号 ${name}`,
                passwordHash: defaultHash,
                role: 'student',
                status: 'active',
                pet: createDefaultPet(),
                createdAt: new Date().toISOString()
            });
        }
        return fallback;
    }

    switchClass(targetClassName) {
        const nextName = String(targetClassName || '').trim();
        if (!nextName) return null;

        // 先保存当前班级数据
        this.saveStudents();

        configCache.className = nextName;
        writeJsonAtomic(CONFIG_FILE, configCache);

        const targetFile = getClassFilePath(nextName);
        if (fs.existsSync(targetFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
                studentsCache = Array.isArray(data) ? data : (data.students || []);
            } catch (e) {
                console.error('[DataStore] 读取目标班级存档失败，重新从名单生成', e);
                studentsCache = this.buildStudentsForClass(nextName);
            }
        } else {
            studentsCache = this.buildStudentsForClass(nextName);
        }

        this.saveStudents();
        this.addLog('class_switch', `切换当前上课班级为「${nextName}」（共 ${studentsCache.length} 名学生）`, null, null, '教师');
        return { className: nextName, studentCount: studentsCache.length };
    }

    // ── 权限与课堂模式 ──────────────────────────────────────────
    getPermissions() {
        return permissionsCache;
    }

    setMode(mode, durationSeconds = null) {
        permissionsCache.currentMode = mode;
        if (durationSeconds && durationSeconds > 0) {
            permissionsCache.modeEndTime = Date.now() + durationSeconds * 1000;
        } else {
            permissionsCache.modeEndTime = null;
        }
        writeJsonAtomic(PERMISSIONS_FILE, permissionsCache);
        return permissionsCache;
    }

    updatePermissions(partial) {
        Object.assign(permissionsCache, partial);
        writeJsonAtomic(PERMISSIONS_FILE, permissionsCache);
        return permissionsCache;
    }

    // ── 系统配置 ────────────────────────────────────────────────
    getConfig() {
        // 排除密码哈希后返回，并兼容 aiReview 与 aiConfig
        const { teacherPasswordHash, ...safeConfig } = configCache;
        if (safeConfig.aiReview && !safeConfig.aiConfig) {
            safeConfig.aiConfig = safeConfig.aiReview;
        } else if (safeConfig.aiConfig && !safeConfig.aiReview) {
            safeConfig.aiReview = safeConfig.aiConfig;
        }
        return safeConfig;
    }

    verifyTeacherPassword(password) {
        if (!configCache.teacherPasswordHash) return false;
        return bcrypt.compareSync(password, configCache.teacherPasswordHash);
    }

    setTeacherPassword(newPassword) {
        configCache.teacherPasswordHash = bcrypt.hashSync(newPassword, 8);
        writeJsonAtomic(CONFIG_FILE, configCache);
        return true;
    }

    updateConfig(partial) {
        // 双向同步 aiConfig 和 aiReview
        if (partial.aiConfig && !partial.aiReview) {
            partial.aiReview = partial.aiConfig;
        } else if (partial.aiReview && !partial.aiConfig) {
            partial.aiConfig = partial.aiReview;
        }
        Object.assign(configCache, partial);
        writeJsonAtomic(CONFIG_FILE, configCache);
        return this.getConfig();
    }

    // ── 装扮广场 ────────────────────────────────────────────────
    getAllOutfits() {
        return outfitsCache;
    }

    getApprovedOutfits() {
        return outfitsCache.filter(o => o.status === 'approved');
    }

    getPendingOutfits() {
        return outfitsCache.filter(o => o.status === 'pending');
    }

    getOutfitById(id) {
        return outfitsCache.find(o => o.id === id) || null;
    }

    addOutfit(outfit) {
        outfitsCache.unshift(outfit);
        this.saveOutfits();
        return outfit;
    }

    updateOutfit(id, updater) {
        const outfit = this.getOutfitById(id);
        if (!outfit) return null;
        updater(outfit);
        this.saveOutfits();
        return outfit;
    }

    saveOutfits() {
        writeJsonAtomic(OUTFITS_FILE, { outfits: outfitsCache });
    }

    // ── 操作日志 ────────────────────────────────────────────────
    addLog(type, detail, studentId = null, studentName = null, operator = '系统') {
        const entry = {
            id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            fullTime: new Date().toISOString(),
            type,
            detail,
            studentId,
            studentName,
            operator
        };
        logsCache.unshift(entry);
        if (logsCache.length > 2000) {
            logsCache = logsCache.slice(0, 2000);
        }
        writeJsonAtomic(LOGS_FILE, { logs: logsCache });
        return entry;
    }

    getLogs(limit = 100, studentId = null) {
        let list = logsCache;
        if (studentId !== null && studentId !== undefined) {
            const numId = Number(studentId);
            list = list.filter(l => l.studentId === numId);
        }
        return list.slice(0, limit);
    }
}

module.exports = new DataStore();
