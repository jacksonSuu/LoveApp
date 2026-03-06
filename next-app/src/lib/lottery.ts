import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getMysqlPool } from '@/lib/mysql';
import { getContractInfo, type ContractRequestView } from '@/lib/user-auth';

export type PrizeTier = 'lucky' | 'heart' | 'rare' | 'ultimate';
export type Prize = {
    name: string;
    weight: number;
    rare: boolean;
    description?: string;
    color?: string;
    emoji?: string;
    tier?: PrizeTier;
    coins?: number;
};
export type CoinExchange = { name: string; cost: number; description?: string };
export type TaskCompleteMode = 'checkin' | 'verify' | 'draw';
export type DailyTaskTemplate = { id: string; title: string; reward: number; maxTimes: number; mode: TaskCompleteMode };
export type SpecialTaskTemplate = { id: string; title: string; reward: number; mode: TaskCompleteMode };
export type DailyTask = DailyTaskTemplate & { doneTimes: number };
export type SpecialTask = SpecialTaskTemplate & { done: boolean };

export type LotteryConfig = {
    baseDailyChances: number;
    maxTaskBonus: number;
    specialUnlockTarget: number;
    prizePool: Prize[];
    coinExchanges: CoinExchange[];
    dailyTasks: DailyTaskTemplate[];
    specialTasks: SpecialTaskTemplate[];
};

export type LotteryState = {
    date: string;
    usedChances: number;
    bonusChances: number;
    dailyTaskCount: number;
    dailyDrawCount: number;
    dailyTasks: DailyTask[];
    specialTasks: SpecialTask[];
    results: string[];
    coins: number;
};

export type PublicState = {
    baseDailyChances: number;
    maxTaskBonus: number;
    specialUnlockTarget: number;
    prizePool: Prize[];
    coinExchanges: CoinExchange[];
    usedChances: number;
    bonusChances: number;
    remainingChances: number;
    dailyTaskCount: number;
    dailyTasks: DailyTask[];
    specialUnlocked: boolean;
    specialTasks: SpecialTask[];
    results: string[];
    coins: number;
    contractBound: boolean;
    contractPartnerName: string | null;
    contractIncomingRequests: ContractRequestView[];
    contractOutgoingRequests: ContractRequestView[];
    testMode: boolean;
    canSaveToBackpack: boolean;
};

export type ApiResponse = {
    ok: boolean;
    message?: string;
    drawResults?: string[];
    state?: PublicState;
    token?: string;
    username?: string;
    config?: LotteryConfig;
    expiresInMs?: number;
};

const adminUsername = 'root';
let adminPassword = 'root';
let adminPasswordLoaded = false;
const activeAdminTokens = new Map<string, number>();
const adminSessionTtlMs = 2 * 60 * 60 * 1000;

const defaultConfig: LotteryConfig = {
    baseDailyChances: 20,
    maxTaskBonus: 10,
    specialUnlockTarget: 6,
    prizePool: [
        { name: '小心心泡泡', weight: 40, rare: false, description: '5.2元红包', color: '#FFB6C1', emoji: '💖💌', tier: 'lucky' },
        { name: '金币', weight: 18, rare: false, description: '抽中可获得 1 枚金币', color: '#FFD700', emoji: '🪙', tier: 'lucky', coins: 1 },
        { name: '告白糖糖', weight: 25, rare: false, description: '13.14元红包', color: '#FF69B4', emoji: '🍬💘', tier: 'lucky' },
        { name: '蜜蜜零食包', weight: 20, rare: false, description: '零食大礼包', color: '#FFDAB9', emoji: '🍭🍪', tier: 'lucky' },
        { name: '心心红包', weight: 10, rare: false, description: '13.14元红包', color: '#DA70D6', emoji: '💌💜', tier: 'heart' },
        { name: '暖暖暴击', weight: 4, rare: false, description: '52元红包', color: '#FF4500', emoji: '💎🔥', tier: 'heart' },
        { name: '小神秘心愿盒', weight: 0.8, rare: true, description: '可兑换衣服 / 520红包', color: '#98FF98', emoji: '🎁✨', tier: 'rare' },
        {
            name: '梦梦宝箱',
            weight: 0.2,
            rare: true,
            description: '可兑换两日浪漫旅行 / 一天情侣水会 / 心动化妆品 / 萌萌大玩偶 / 1314红包',
            color: 'linear-gradient(90deg, #FF69B4 0%, #FFD700 50%, #FF4500 100%)',
            emoji: '🌈💖🎀',
            tier: 'ultimate',
        },
    ],
    coinExchanges: [
        { name: '额外抽奖机会', cost: 10, description: '兑换1次额外抽奖机会' },
        { name: '小礼品包', cost: 50, description: '兑换一个小礼品' },
        { name: '大礼品包', cost: 100, description: '兑换一个大礼品' },
    ],
    dailyTasks: [
        { id: 'd1', title: '每日签到', reward: 1, maxTimes: 1, mode: 'checkin' },
        { id: 'd2', title: '完成1次抽奖', reward: 1, maxTimes: 1, mode: 'draw' },
    ],
    specialTasks: [
        { id: 's1', title: '契约互动打卡', reward: 2, mode: 'verify' },
    ],
};

let config: LotteryConfig = cloneConfig(defaultConfig);
let configLoaded = false;
let schemaReady = false;
let mutationQueue: Promise<void> = Promise.resolve();

function todayKey(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function cloneConfig(source: LotteryConfig): LotteryConfig {
    return {
        baseDailyChances: source.baseDailyChances,
        maxTaskBonus: source.maxTaskBonus,
        specialUnlockTarget: source.specialUnlockTarget,
        prizePool: source.prizePool.map((item) => ({ ...item })),
        coinExchanges: source.coinExchanges.map((item) => ({ ...item })),
        dailyTasks: source.dailyTasks.map((item) => ({ ...item })),
        specialTasks: source.specialTasks.map((item) => ({ ...item })),
    };
}

function getInitialState(): LotteryState {
    return {
        date: todayKey(),
        usedChances: 0,
        bonusChances: 0,
        dailyTaskCount: 0,
        dailyDrawCount: 0,
        dailyTasks: config.dailyTasks.map((t) => ({ ...t, doneTimes: 0 })),
        specialTasks: config.specialTasks.map((t) => ({ ...t, done: false })),
        results: [],
        coins: 0,
    };
}

function normalizeUserId(userId: string): string {
    const normalized = String(userId || '').trim().replace(/[^\w:.@-]/g, '').slice(0, 64);
    return normalized || 'guest';
}

function getErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '未知错误';
    if (/MySQL 未配置/.test(message)) return message;
    return `数据库操作失败：${message}`;
}

function remaining(current: LotteryState, contractBound: boolean): number {
    if (!contractBound) {
        return Math.max(0, 50 - current.usedChances);
    }
    return Math.max(0, config.baseDailyChances + current.bonusChances - current.usedChances);
}

function runExclusive<T>(job: () => Promise<T>): Promise<T> {
    const task = mutationQueue.then(job, job);
    mutationQueue = task.then(
        () => undefined,
        () => undefined,
    );
    return task;
}

function pushHistory(current: LotteryState, text: string): void {
    current.results.push(text);
    if (current.results.length > 200) {
        current.results = current.results.slice(-200);
    }
}

function addBonus(current: LotteryState, amount: number): number {
    const available = config.maxTaskBonus - current.bonusChances;
    const actual = Math.max(0, Math.min(amount, available));
    current.bonusChances += actual;
    return actual;
}

function pickPrize(): Prize {
    if (config.prizePool.length === 0) {
        return { name: '谢谢参与', weight: 1, rare: false };
    }
    const total = config.prizePool.reduce((sum, p) => sum + p.weight, 0);
    if (total <= 0) {
        return config.prizePool[0];
    }
    let roll = Math.random() * total;
    for (const p of config.prizePool) {
        roll -= p.weight;
        if (roll <= 0) return p;
    }
    return config.prizePool[config.prizePool.length - 1];
}

async function toResponse(current: LotteryState, userId: string, message?: string, drawResults: string[] = []): Promise<ApiResponse> {
    const contract = await getContractInfo(userId);
    const contractBound = contract.bound;
    return {
        ok: true,
        message,
        drawResults,
        state: {
            baseDailyChances: config.baseDailyChances,
            maxTaskBonus: config.maxTaskBonus,
            specialUnlockTarget: config.specialUnlockTarget,
            prizePool: config.prizePool,
            coinExchanges: config.coinExchanges,
            usedChances: current.usedChances,
            bonusChances: current.bonusChances,
            remainingChances: remaining(current, contractBound),
            dailyTaskCount: current.dailyTaskCount,
            dailyTasks: current.dailyTasks.slice(0, 2),
            specialUnlocked: contractBound,
            specialTasks: current.specialTasks,
            results: current.results.slice(),
            coins: current.coins,
            contractBound,
            contractPartnerName: contract.partnerUsername,
            contractIncomingRequests: contract.incomingRequests,
            contractOutgoingRequests: contract.outgoingRequests,
            testMode: !contractBound,
            canSaveToBackpack: contractBound,
        },
    };
}

function verifyToken(token: string): boolean {
    if (!token) return false;
    const expiresAt = activeAdminTokens.get(token);
    if (!expiresAt) return false;
    if (Date.now() >= expiresAt) {
        activeAdminTokens.delete(token);
        return false;
    }
    return true;
}

function unauthorized(): ApiResponse {
    return { ok: false, message: '会话已过期，请重新登录管理员' };
}

function sanitizePrizePool(value: unknown): Prize[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const parsed: Prize[] = [];
    const usedNames = new Set<string>();
    for (const item of value) {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const name = String(record.name || '').trim();
        const description = String(record.description || '').trim();
        const color = String(record.color || '').trim();
        const emoji = String(record.emoji || '').trim();
        const weight = Number(record.weight);
        const rawCoins = Number(record.coins);
        const parsedCoins = Number.isFinite(rawCoins) && rawCoins > 0 ? Math.floor(rawCoins) : undefined;
        const tierRaw = String(record.tier || '').trim();
        const tier: PrizeTier | undefined = ['lucky', 'heart', 'rare', 'ultimate'].includes(tierRaw)
            ? (tierRaw as PrizeTier)
            : undefined;
        const rareRaw = record.rare;
        const rare =
            typeof rareRaw === 'boolean'
                ? rareRaw
                : typeof rareRaw === 'string'
                    ? ['true', '1', 'yes', 'y', 'on'].includes(rareRaw.toLowerCase())
                    : Boolean(rareRaw);
        if (!name || !Number.isFinite(weight) || weight <= 0) return null;
        if (usedNames.has(name)) return null;
        usedNames.add(name);
        parsed.push({ name, weight, rare, description, color, emoji, tier, coins: parsedCoins ?? (name.includes('金币') ? 1 : undefined) });
    }
    return parsed;
}

function sanitizeDailyTasks(value: unknown): DailyTaskTemplate[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const parsed: DailyTaskTemplate[] = [];
    const usedIds = new Set<string>();
    for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const id = String(record.id || `d${i + 1}`).trim();
        const title = String(record.title || '').trim();
        const reward = Number(record.reward);
        const maxTimes = Number(record.maxTimes);
        const modeRaw = String(record.mode || '').trim().toLowerCase();
        const mode: TaskCompleteMode = modeRaw === 'checkin' ? 'checkin' : modeRaw === 'draw' ? 'draw' : /签到/.test(title) ? 'checkin' : /抽奖/.test(title) ? 'draw' : 'verify';
        if (!title || !id || !Number.isFinite(reward) || reward <= 0 || !Number.isFinite(maxTimes) || maxTimes <= 0) {
            return null;
        }
        if (usedIds.has(id)) return null;
        usedIds.add(id);
        parsed.push({ id, title, reward, maxTimes: Math.floor(maxTimes), mode });
    }
    return parsed;
}

function sanitizeSpecialTasks(value: unknown): SpecialTaskTemplate[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const parsed: SpecialTaskTemplate[] = [];
    const usedIds = new Set<string>();
    for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const id = String(record.id || `s${i + 1}`).trim();
        const title = String(record.title || '').trim();
        const reward = Number(record.reward);
        const modeRaw = String(record.mode || '').trim().toLowerCase();
        const mode: TaskCompleteMode = modeRaw === 'checkin' ? 'checkin' : modeRaw === 'draw' ? 'draw' : /签到/.test(title) ? 'checkin' : /抽奖/.test(title) ? 'draw' : 'verify';
        if (!title || !id || !Number.isFinite(reward) || reward <= 0) return null;
        if (usedIds.has(id)) return null;
        usedIds.add(id);
        parsed.push({ id, title, reward, mode });
    }
    return parsed;
}

function sanitizeCoinExchanges(value: unknown): CoinExchange[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const parsed: CoinExchange[] = [];
    const usedNames = new Set<string>();
    for (const item of value) {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const name = String(record.name || '').trim();
        const description = String(record.description || '').trim();
        const cost = Number(record.cost);
        if (!name || !Number.isFinite(cost) || cost <= 0) return null;
        if (usedNames.has(name)) return null;
        usedNames.add(name);
        parsed.push({ name, cost: Math.floor(cost), description });
    }
    return parsed;
}

async function ensureSchema(): Promise<void> {
    if (schemaReady) return;
    const pool = getMysqlPool();
    await pool.query(`
        CREATE TABLE IF NOT EXISTS lottery_config (
            id TINYINT NOT NULL PRIMARY KEY,
            config_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS lottery_user_state (
            user_id VARCHAR(64) NOT NULL PRIMARY KEY,
            state_date VARCHAR(10) NOT NULL,
            state_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS lottery_settings (
            setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
            value_text TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query<ResultSetHeader>('INSERT IGNORE INTO lottery_config (id, config_json) VALUES (1, ?)', [JSON.stringify(defaultConfig)]);
    await pool.query<ResultSetHeader>("INSERT IGNORE INTO lottery_settings (setting_key, value_text) VALUES ('admin_password', 'root')");
    schemaReady = true;
}

async function ensureConfigLoaded(): Promise<void> {
    if (configLoaded) return;
    await ensureSchema();
    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>('SELECT config_json FROM lottery_config WHERE id = 1 LIMIT 1');
    const row = rows[0];
    if (!row) {
        config = cloneConfig(defaultConfig);
        configLoaded = true;
        return;
    }

    const raw = JSON.parse(String(row.config_json || '{}')) as Partial<LotteryConfig>;
    const baseDailyChances = Number(raw.baseDailyChances);
    const maxTaskBonus = Number(raw.maxTaskBonus);
    const specialUnlockTarget = Number(raw.specialUnlockTarget);
    const prizePool = sanitizePrizePool(raw.prizePool);
    const dailyTasks = sanitizeDailyTasks(raw.dailyTasks);
    const specialTasks = sanitizeSpecialTasks(raw.specialTasks);
    const coinExchanges = sanitizeCoinExchanges(raw.coinExchanges);

    if (
        !Number.isFinite(baseDailyChances) ||
        baseDailyChances < 1 ||
        !Number.isFinite(maxTaskBonus) ||
        maxTaskBonus < 1 ||
        !Number.isFinite(specialUnlockTarget) ||
        specialUnlockTarget < 1 ||
        !prizePool ||
        !dailyTasks ||
        !specialTasks ||
        !coinExchanges
    ) {
        config = cloneConfig(defaultConfig);
    } else {
        config = {
            baseDailyChances: Math.floor(baseDailyChances),
            maxTaskBonus: Math.floor(maxTaskBonus),
            specialUnlockTarget: Math.floor(specialUnlockTarget),
            prizePool,
            coinExchanges,
            dailyTasks,
            specialTasks,
        };
    }

    configLoaded = true;
}

async function ensureAdminPasswordLoaded(): Promise<void> {
    if (adminPasswordLoaded) return;
    await ensureSchema();
    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>("SELECT value_text FROM lottery_settings WHERE setting_key = 'admin_password' LIMIT 1");
    const row = rows[0];
    adminPassword = String(row?.value_text || 'root');
    adminPasswordLoaded = true;
}

function normalizeStateFromRecord(raw: unknown, fallbackDate: string): LotteryState {
    const current = getInitialState();
    if (!raw || typeof raw !== 'object') {
        current.date = fallbackDate;
        return current;
    }

    const record = raw as Record<string, unknown>;
    current.date = fallbackDate;
    current.usedChances = Math.max(0, Math.floor(Number(record.usedChances || 0)));
    current.bonusChances = Math.max(0, Math.floor(Number(record.bonusChances || 0)));
    current.dailyTaskCount = Math.max(0, Math.floor(Number(record.dailyTaskCount || 0)));
    current.dailyDrawCount = Math.max(0, Math.floor(Number(record.dailyDrawCount || 0)));
    current.coins = Math.max(0, Math.floor(Number(record.coins || 0)));

    const dailyRaw = Array.isArray(record.dailyTasks) ? record.dailyTasks : [];
    const dailyMap = new Map<string, number>();
    for (const item of dailyRaw) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const id = String(row.id || '').trim();
        if (!id) continue;
        const doneTimes = Math.max(0, Math.floor(Number(row.doneTimes || 0)));
        dailyMap.set(id, doneTimes);
    }
    current.dailyTasks = config.dailyTasks.map((task) => ({
        ...task,
        doneTimes: Math.min(task.maxTimes, Math.max(0, dailyMap.get(task.id) ?? 0)),
    }));

    const specialRaw = Array.isArray(record.specialTasks) ? record.specialTasks : [];
    const specialMap = new Map<string, boolean>();
    for (const item of specialRaw) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const id = String(row.id || '').trim();
        if (!id) continue;
        specialMap.set(id, Boolean(row.done));
    }
    current.specialTasks = config.specialTasks.map((task) => ({ ...task, done: Boolean(specialMap.get(task.id)) }));

    const results = Array.isArray(record.results)
        ? record.results.map((item) => String(item || '').trim()).filter((item) => item.length > 0)
        : [];
    current.results = results.slice(-200);

    return current;
}

async function readState(userId: string): Promise<LotteryState> {
    await ensureConfigLoaded();
    const normalizedUserId = normalizeUserId(userId);
    const pool = getMysqlPool();
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT state_date, state_json FROM lottery_user_state WHERE user_id = ? LIMIT 1',
        [normalizedUserId],
    );
    const today = todayKey();
    const row = rows[0];
    if (!row) {
        const initial = getInitialState();
        await writeState(normalizedUserId, initial);
        return initial;
    }

    const rowDate = String(row.state_date || '');
    if (rowDate !== today) {
        const reset = getInitialState();
        await writeState(normalizedUserId, reset);
        return reset;
    }

    const parsed = JSON.parse(String(row.state_json || '{}')) as unknown;
    return normalizeStateFromRecord(parsed, today);
}

async function writeState(userId: string, next: LotteryState): Promise<void> {
    await ensureSchema();
    const normalizedUserId = normalizeUserId(userId);
    const pool = getMysqlPool();
    await pool.query<ResultSetHeader>(
        `
        INSERT INTO lottery_user_state (user_id, state_date, state_json)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            state_date = VALUES(state_date),
            state_json = VALUES(state_json)
        `,
        [normalizedUserId, next.date, JSON.stringify(next)],
    );
}

async function saveConfig(next: LotteryConfig): Promise<void> {
    await ensureSchema();
    const pool = getMysqlPool();
    await pool.query<ResultSetHeader>(
        `
        INSERT INTO lottery_config (id, config_json)
        VALUES (1, ?)
        ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)
        `,
        [JSON.stringify(next)],
    );
}

type TaskSubmitPayload = {
    confirmCheckIn: boolean;
    evidence: string;
};

function parseTaskSubmitPayload(payload?: unknown): TaskSubmitPayload {
    if (!payload || typeof payload !== 'object') {
        return { confirmCheckIn: false, evidence: '' };
    }
    const record = payload as Record<string, unknown>;
    return {
        confirmCheckIn: Boolean(record.confirmCheckIn),
        evidence: String(record.evidence || '').trim(),
    };
}

export async function getPublicState(userId: string): Promise<ApiResponse> {
    try {
        const current = await readState(userId);
        return await toResponse(current, userId);
    } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
    }
}

export async function completeDailyTask(taskId: string, userId: string, payload?: unknown): Promise<ApiResponse> {
    return runExclusive(async () => {
        try {
            const current = await readState(userId);
            const task = current.dailyTasks.slice(0, 2).find((item) => item.id === taskId);
            if (!task) return { ok: false, message: '任务不存在' };
            const submit = parseTaskSubmitPayload(payload);
            if (task.mode === 'checkin') {
                if (!submit.confirmCheckIn) {
                    const state = (await toResponse(current, userId)).state;
                    return { ok: false, message: '签到任务请点击“签到确认”后再提交', state };
                }
            } else if (task.mode === 'draw') {
                if (current.dailyDrawCount < 1) {
                    const state = (await toResponse(current, userId)).state;
                    return { ok: false, message: '请先完成至少 1 次抽奖，再提交该任务', state };
                }
            } else if (submit.evidence.length < 2) {
                const state = (await toResponse(current, userId)).state;
                return { ok: false, message: '该任务需提交完成说明（审核/条件判断）后才能成功', state };
            }
            if (task.doneTimes >= task.maxTimes) {
                const state = (await toResponse(current, userId)).state;
                return { ok: false, message: '该日常任务今日次数已达上限', state };
            }
            task.doneTimes += 1;
            current.dailyTaskCount += 1;
            const gain = addBonus(current, task.reward);
            pushHistory(current, `任务完成：${task.title}，获得 +${gain} 次抽奖机会`);
            await writeState(userId, current);
            const msg = gain > 0 ? `完成成功，+${gain} 次` : '完成成功，今日任务赠送次数已达上限';
            return await toResponse(current, userId, msg);
        } catch (error) {
            return { ok: false, message: getErrorMessage(error) };
        }
    });
}

export async function completeSpecialTask(taskId: string, userId: string, payload?: unknown): Promise<ApiResponse> {
    return runExclusive(async () => {
        try {
            const current = await readState(userId);
            const contract = await getContractInfo(userId);
            if (!contract.bound) {
                const state = (await toResponse(current, userId)).state;
                return { ok: false, message: '未绑定契约，契约任务处于锁定中', state };
            }
            const task = current.specialTasks.find((item) => item.id === taskId);
            if (!task) return { ok: false, message: '任务不存在' };
            const submit = parseTaskSubmitPayload(payload);
            if (task.mode === 'checkin') {
                if (!submit.confirmCheckIn) {
                    const state = (await toResponse(current, userId)).state;
                    return { ok: false, message: '签到任务请点击“签到确认”后再提交', state };
                }
            } else if (task.mode === 'draw') {
                if (current.dailyDrawCount < 1) {
                    const state = (await toResponse(current, userId)).state;
                    return { ok: false, message: '请先完成至少 1 次抽奖，再提交该任务', state };
                }
            } else if (submit.evidence.length < 2) {
                const state = (await toResponse(current, userId)).state;
                return { ok: false, message: '该任务需提交完成说明（审核/条件判断）后才能成功', state };
            }
            if (task.done) {
                const state = (await toResponse(current, userId)).state;
                return { ok: false, message: '该契约任务已完成', state };
            }
            task.done = true;
            const gain = addBonus(current, task.reward);
            pushHistory(current, `契约任务完成：${task.title}，获得 +${gain} 次抽奖机会`);
            await writeState(userId, current);
            const msg = gain > 0 ? `完成成功，+${gain} 次` : '完成成功，今日任务赠送次数已达上限';
            return await toResponse(current, userId, msg);
        } catch (error) {
            return { ok: false, message: getErrorMessage(error) };
        }
    });
}

export async function draw(times: number, userId: string): Promise<ApiResponse> {
    return runExclusive(async () => {
        try {
            const current = await readState(userId);
            const contract = await getContractInfo(userId);
            const realMode = contract.bound;
            if (!Number.isInteger(times) || (times !== 1 && times !== 5)) {
                return { ok: false, message: '仅支持单抽(1)或五连抽(5)' };
            }
            const remain = remaining(current, realMode);
            if (remain < times) {
                const state = (await toResponse(current, userId)).state;
                return { ok: false, message: `次数不足，当前剩余 ${remain} 次`, state };
            }
            current.usedChances += times;
            current.dailyDrawCount += times;
            const drawResults: string[] = [];
            let totalCoins = 0;
            for (let i = 0; i < times; i += 1) {
                const prize = pickPrize();
                const text = `${prize.rare ? '✨稀有✨ ' : ''}${prize.name}`;
                drawResults.push(text);
                if (realMode) {
                    const coinsGained = Math.max(0, Math.floor(Number(prize.coins || 0)));
                    if (coinsGained > 0) {
                        current.coins += coinsGained;
                        totalCoins += coinsGained;
                        pushHistory(current, `抽中：${text}，获得 ${coinsGained} 枚金币`);
                    } else {
                        pushHistory(current, `抽中：${text}`);
                    }
                }
            }
            await writeState(userId, current);
            const summary = realMode
                ? totalCoins > 0
                    ? `已完成 ${times} 抽，获得 ${totalCoins} 枚金币`
                    : `已完成 ${times} 抽，本次未获得金币`
                : `测试抽奖完成（${times} 抽），奖品仅预览不会进入背包`;
            return await toResponse(current, userId, summary, drawResults);
        } catch (error) {
            return { ok: false, message: getErrorMessage(error) };
        }
    });
}

export async function exchangeCoins(exchangeIndex: number, userId: string): Promise<ApiResponse> {
    return runExclusive(async () => {
        try {
            const current = await readState(userId);
            const contract = await getContractInfo(userId);
            if (!contract.bound) {
                const state = (await toResponse(current, userId)).state;
                return { ok: false, message: '未绑定契约时金币兑换不可用', state };
            }
            if (exchangeIndex < 0 || exchangeIndex >= config.coinExchanges.length) {
                const state = (await toResponse(current, userId)).state;
                return { ok: false, message: '兑换选项不存在', state };
            }
            const exchange = config.coinExchanges[exchangeIndex];
            if (current.coins < exchange.cost) {
                const state = (await toResponse(current, userId)).state;
                return { ok: false, message: `金币不足，需要 ${exchange.cost} 枚金币，当前 ${current.coins} 枚`, state };
            }
            current.coins -= exchange.cost;
            if (exchange.name === '额外抽奖机会') {
                current.bonusChances += 1;
                pushHistory(current, `兑换：${exchange.name}，消耗 ${exchange.cost} 枚金币`);
            } else {
                pushHistory(current, `兑换：${exchange.name}，消耗 ${exchange.cost} 枚金币`);
            }
            await writeState(userId, current);
            return await toResponse(current, userId, `兑换成功：${exchange.name}`);
        } catch (error) {
            return { ok: false, message: getErrorMessage(error) };
        }
    });
}

export async function adminLogin(username: string, password: string): Promise<ApiResponse> {
    try {
        await ensureAdminPasswordLoaded();
        if (username !== adminUsername || password !== adminPassword) {
            return { ok: false, message: '用户名或密码错误' };
        }
        const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        activeAdminTokens.set(token, Date.now() + adminSessionTtlMs);
        return { ok: true, message: '登录成功', token, username: adminUsername, expiresInMs: adminSessionTtlMs };
    } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
    }
}

export async function adminLogout(token: string): Promise<ApiResponse> {
    if (!verifyToken(token)) return unauthorized();
    activeAdminTokens.delete(token);
    return { ok: true, message: '已退出管理员登录' };
}

export async function getAdminConfig(token: string): Promise<ApiResponse> {
    if (!verifyToken(token)) return unauthorized();
    try {
        await ensureConfigLoaded();
        return { ok: true, username: adminUsername, config };
    } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
    }
}

export async function updateAdminConfig(
    token: string,
    payload: Partial<LotteryConfig> & { prizePool?: unknown; dailyTasks?: unknown; specialTasks?: unknown; coinExchanges?: unknown },
): Promise<ApiResponse> {
    return runExclusive(async () => {
        try {
            if (!verifyToken(token)) return unauthorized();
            await ensureConfigLoaded();
            const nextBase = Number(payload.baseDailyChances);
            const nextBonus = Number(payload.maxTaskBonus);
            const nextUnlock = Number(payload.specialUnlockTarget);
            if (!Number.isFinite(nextBase) || nextBase < 1 || !Number.isFinite(nextBonus) || nextBonus < 1 || !Number.isFinite(nextUnlock) || nextUnlock < 1) {
                return { ok: false, message: '基础配置必须是大于 0 的数字' };
            }
            const nextPrize = sanitizePrizePool(payload.prizePool);
            const nextDaily = sanitizeDailyTasks(payload.dailyTasks);
            const nextSpecial = sanitizeSpecialTasks(payload.specialTasks);
            const nextExchanges = sanitizeCoinExchanges(payload.coinExchanges);
            if (!nextPrize || !nextDaily || !nextSpecial || !nextExchanges) {
                return { ok: false, message: '任务或奖池配置格式不正确（请检查重复ID、空数组、非法概率）' };
            }
            config = {
                baseDailyChances: Math.floor(nextBase),
                maxTaskBonus: Math.floor(nextBonus),
                specialUnlockTarget: Math.floor(nextUnlock),
                prizePool: nextPrize,
                coinExchanges: nextExchanges,
                dailyTasks: nextDaily,
                specialTasks: nextSpecial,
            };
            await saveConfig(config);
            const pool = getMysqlPool();
            await pool.query<ResultSetHeader>('DELETE FROM lottery_user_state');
            return { ok: true, message: '配置已保存并生效（已重置所有用户今日进度）', config };
        } catch (error) {
            return { ok: false, message: getErrorMessage(error) };
        }
    });
}

export async function changeAdminPassword(token: string, oldPassword: string, newPassword: string): Promise<ApiResponse> {
    try {
        if (!verifyToken(token)) return unauthorized();
        await ensureAdminPasswordLoaded();
        if (oldPassword !== adminPassword) return { ok: false, message: '旧密码不正确' };
        const next = String(newPassword || '').trim();
        if (next.length < 4) return { ok: false, message: '新密码至少 4 位' };
        const pool = getMysqlPool();
        await pool.query<ResultSetHeader>(
            `
            INSERT INTO lottery_settings (setting_key, value_text)
            VALUES ('admin_password', ?)
            ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)
            `,
            [next],
        );
        adminPassword = next;
        return { ok: true, message: '管理员密码修改成功' };
    } catch (error) {
        return { ok: false, message: getErrorMessage(error) };
    }
}

export function extractToken(header: string | null): string {
    if (!header) return '';
    const matched = header.match(/^Bearer\s+(.+)/i);
    return matched ? matched[1] : header;
}
