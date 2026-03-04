export type Prize = { name: string; weight: number; rare: boolean };
export type TaskCompleteMode = 'checkin' | 'verify';
export type DailyTaskTemplate = { id: string; title: string; reward: number; maxTimes: number; mode: TaskCompleteMode };
export type SpecialTaskTemplate = { id: string; title: string; reward: number; mode: TaskCompleteMode };
export type DailyTask = DailyTaskTemplate & { doneTimes: number };
export type SpecialTask = SpecialTaskTemplate & { done: boolean };

export type LotteryConfig = {
    baseDailyChances: number;
    maxTaskBonus: number;
    specialUnlockTarget: number;
    prizePool: Prize[];
    dailyTasks: DailyTaskTemplate[];
    specialTasks: SpecialTaskTemplate[];
};

export type LotteryState = {
    date: string;
    usedChances: number;
    bonusChances: number;
    dailyTaskCount: number;
    dailyTasks: DailyTask[];
    specialTasks: SpecialTask[];
    results: string[];
};

export type PublicState = {
    baseDailyChances: number;
    maxTaskBonus: number;
    specialUnlockTarget: number;
    prizePool: Prize[];
    usedChances: number;
    bonusChances: number;
    remainingChances: number;
    dailyTaskCount: number;
    dailyTasks: DailyTask[];
    specialUnlocked: boolean;
    specialTasks: SpecialTask[];
    results: string[];
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
const activeAdminTokens = new Map<string, number>();
const adminSessionTtlMs = 2 * 60 * 60 * 1000;

let config: LotteryConfig = {
    baseDailyChances: 50,
    maxTaskBonus: 10,
    specialUnlockTarget: 6,
    prizePool: [
        { name: '晚安语音券', weight: 26, rare: false },
        { name: '抱抱券', weight: 22, rare: false },
        { name: '奶茶券', weight: 18, rare: false },
        { name: '电影之夜券', weight: 14, rare: false },
        { name: '周末约会优先权', weight: 10, rare: false },
        { name: '神秘小礼物', weight: 7, rare: true },
        { name: '惊喜大奖：整天女王体验', weight: 3, rare: true },
    ],
    dailyTasks: [
        { id: 'd1', title: '每日签到', reward: 1, maxTimes: 1, mode: 'checkin' },
        { id: 'd2', title: '夸夸女朋友一次', reward: 1, maxTimes: 3, mode: 'verify' },
        { id: 'd3', title: '分享今天最开心的事', reward: 1, maxTimes: 3, mode: 'verify' },
        { id: 'd4', title: '发一张今日照片', reward: 1, maxTimes: 2, mode: 'verify' },
    ],
    specialTasks: [
        { id: 's1', title: '准备一个小惊喜', reward: 3, mode: 'verify' },
        { id: 's2', title: '完成一次双人运动', reward: 2, mode: 'verify' },
        { id: 's3', title: '策划下一次约会', reward: 3, mode: 'verify' },
    ],
};

let state: LotteryState = getInitialState();
let mutationQueue: Promise<void> = Promise.resolve();

function todayKey(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getInitialState(): LotteryState {
    return {
        date: todayKey(),
        usedChances: 0,
        bonusChances: 0,
        dailyTaskCount: 0,
        dailyTasks: config.dailyTasks.map((t) => ({ ...t, doneTimes: 0 })),
        specialTasks: config.specialTasks.map((t) => ({ ...t, done: false })),
        results: [],
    };
}

async function readState(): Promise<LotteryState> {
    if (state.date !== todayKey()) {
        state = getInitialState();
    }
    return state;
}

async function writeState(next: LotteryState): Promise<void> {
    state = next;
}

function isSpecialUnlocked(current: LotteryState): boolean {
    return current.dailyTaskCount >= config.specialUnlockTarget;
}

function remaining(current: LotteryState): number {
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

function toResponse(current: LotteryState, message?: string, drawResults: string[] = []): ApiResponse {
    return {
        ok: true,
        message,
        drawResults,
        state: {
            baseDailyChances: config.baseDailyChances,
            maxTaskBonus: config.maxTaskBonus,
            specialUnlockTarget: config.specialUnlockTarget,
            prizePool: config.prizePool,
            usedChances: current.usedChances,
            bonusChances: current.bonusChances,
            remainingChances: remaining(current),
            dailyTaskCount: current.dailyTaskCount,
            dailyTasks: current.dailyTasks,
            specialUnlocked: isSpecialUnlocked(current),
            specialTasks: current.specialTasks,
            results: current.results.slice(),
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
        const weight = Number(record.weight);
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
        parsed.push({ name, weight, rare });
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
        const mode: TaskCompleteMode = modeRaw === 'checkin' ? 'checkin' : /签到/.test(title) ? 'checkin' : 'verify';
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
        const mode: TaskCompleteMode = modeRaw === 'checkin' ? 'checkin' : /签到/.test(title) ? 'checkin' : 'verify';
        if (!title || !id || !Number.isFinite(reward) || reward <= 0) return null;
        if (usedIds.has(id)) return null;
        usedIds.add(id);
        parsed.push({ id, title, reward, mode });
    }
    return parsed;
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

export async function getPublicState(): Promise<ApiResponse> {
    const current = await readState();
    await writeState(current);
    return toResponse(current);
}

export async function completeDailyTask(taskId: string, payload?: unknown): Promise<ApiResponse> {
    return runExclusive(async () => {
        const current = await readState();
        const task = current.dailyTasks.find((item) => item.id === taskId);
        if (!task) return { ok: false, message: '任务不存在' };
        const submit = parseTaskSubmitPayload(payload);
        if (task.mode === 'checkin') {
            if (!submit.confirmCheckIn) {
                return { ok: false, message: '签到任务请点击“签到确认”后再提交', state: toResponse(current).state };
            }
        } else if (submit.evidence.length < 2) {
            return { ok: false, message: '该任务需提交完成说明（审核/条件判断）后才能成功', state: toResponse(current).state };
        }
        if (task.doneTimes >= task.maxTimes) {
            return { ok: false, message: '该日常任务今日次数已达上限', state: toResponse(current).state };
        }
        task.doneTimes += 1;
        current.dailyTaskCount += 1;
        const gain = addBonus(current, task.reward);
        pushHistory(current, `任务完成：${task.title}，获得 +${gain} 次抽奖机会`);
        await writeState(current);
        const msg = gain > 0 ? `完成成功，+${gain} 次` : '完成成功，今日任务赠送次数已达上限';
        return toResponse(current, msg);
    });
}

export async function completeSpecialTask(taskId: string, payload?: unknown): Promise<ApiResponse> {
    return runExclusive(async () => {
        const current = await readState();
        if (!isSpecialUnlocked(current)) {
            return { ok: false, message: '特殊任务尚未解锁', state: toResponse(current).state };
        }
        const task = current.specialTasks.find((item) => item.id === taskId);
        if (!task) return { ok: false, message: '任务不存在' };
        const submit = parseTaskSubmitPayload(payload);
        if (task.mode === 'checkin') {
            if (!submit.confirmCheckIn) {
                return { ok: false, message: '签到任务请点击“签到确认”后再提交', state: toResponse(current).state };
            }
        } else if (submit.evidence.length < 2) {
            return { ok: false, message: '该任务需提交完成说明（审核/条件判断）后才能成功', state: toResponse(current).state };
        }
        if (task.done) {
            return { ok: false, message: '该特殊任务已完成', state: toResponse(current).state };
        }
        task.done = true;
        const gain = addBonus(current, task.reward);
        pushHistory(current, `特殊任务完成：${task.title}，获得 +${gain} 次抽奖机会`);
        await writeState(current);
        const msg = gain > 0 ? `完成成功，+${gain} 次` : '完成成功，今日任务赠送次数已达上限';
        return toResponse(current, msg);
    });
}

export async function draw(times: number): Promise<ApiResponse> {
    return runExclusive(async () => {
        const current = await readState();
        if (!Number.isInteger(times) || (times !== 1 && times !== 5)) {
            return { ok: false, message: '仅支持单抽(1)或五连抽(5)' };
        }
        const remain = remaining(current);
        if (remain < times) {
            return { ok: false, message: `次数不足，当前剩余 ${remain} 次`, state: toResponse(current).state };
        }
        current.usedChances += times;
        const drawResults: string[] = [];
        for (let i = 0; i < times; i += 1) {
            const prize = pickPrize();
            const text = `${prize.rare ? '✨稀有✨ ' : ''}${prize.name}`;
            drawResults.push(text);
            pushHistory(current, `抽中：${text}`);
        }
        await writeState(current);
        return toResponse(current, `已完成 ${times} 抽`, drawResults);
    });
}

export async function adminLogin(username: string, password: string): Promise<ApiResponse> {
    if (username !== adminUsername || password !== adminPassword) {
        return { ok: false, message: '用户名或密码错误' };
    }
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeAdminTokens.set(token, Date.now() + adminSessionTtlMs);
    return { ok: true, message: '登录成功', token, username: adminUsername, expiresInMs: adminSessionTtlMs };
}

export async function adminLogout(token: string): Promise<ApiResponse> {
    if (!verifyToken(token)) return unauthorized();
    activeAdminTokens.delete(token);
    return { ok: true, message: '已退出管理员登录' };
}

export async function getAdminConfig(token: string): Promise<ApiResponse> {
    if (!verifyToken(token)) return unauthorized();
    return { ok: true, username: adminUsername, config };
}

export async function updateAdminConfig(
    token: string,
    payload: Partial<LotteryConfig> & { prizePool?: unknown; dailyTasks?: unknown; specialTasks?: unknown },
): Promise<ApiResponse> {
    return runExclusive(async () => {
        if (!verifyToken(token)) return unauthorized();
        const nextBase = Number(payload.baseDailyChances);
        const nextBonus = Number(payload.maxTaskBonus);
        const nextUnlock = Number(payload.specialUnlockTarget);
        if (!Number.isFinite(nextBase) || nextBase < 1 || !Number.isFinite(nextBonus) || nextBonus < 1 || !Number.isFinite(nextUnlock) || nextUnlock < 1) {
            return { ok: false, message: '基础配置必须是大于 0 的数字' };
        }
        const nextPrize = sanitizePrizePool(payload.prizePool);
        const nextDaily = sanitizeDailyTasks(payload.dailyTasks);
        const nextSpecial = sanitizeSpecialTasks(payload.specialTasks);
        if (!nextPrize || !nextDaily || !nextSpecial) {
            return { ok: false, message: '任务或奖池配置格式不正确（请检查重复ID、空数组、非法概率）' };
        }
        config = {
            baseDailyChances: Math.floor(nextBase),
            maxTaskBonus: Math.floor(nextBonus),
            specialUnlockTarget: Math.floor(nextUnlock),
            prizePool: nextPrize,
            dailyTasks: nextDaily,
            specialTasks: nextSpecial,
        };
        state = getInitialState();
        return { ok: true, message: '配置已保存并生效（已重置今日进度）', config };
    });
}

export async function changeAdminPassword(token: string, oldPassword: string, newPassword: string): Promise<ApiResponse> {
    if (!verifyToken(token)) return unauthorized();
    if (oldPassword !== adminPassword) return { ok: false, message: '旧密码不正确' };
    const next = String(newPassword || '').trim();
    if (next.length < 4) return { ok: false, message: '新密码至少 4 位' };
    adminPassword = next;
    return { ok: true, message: '管理员密码修改成功' };
}

export function extractToken(header: string | null): string {
    if (!header) return '';
    const matched = header.match(/^Bearer\s+(.+)/i);
    return matched ? matched[1] : header;
}
