export type Prize = { name: string; weight: number; rare: boolean }
export type TaskCompleteMode = 'checkin' | 'verify'
export type DailyTask = { id: string; title: string; reward: number; maxTimes: number; doneTimes: number; mode: TaskCompleteMode }
export type SpecialTask = { id: string; title: string; reward: number; done: boolean; mode: TaskCompleteMode }

export type LotteryState = {
    baseDailyChances: number
    maxTaskBonus: number
    specialUnlockTarget: number
    prizePool: Prize[]
    usedChances: number
    bonusChances: number
    remainingChances: number
    dailyTaskCount: number
    dailyTasks: DailyTask[]
    specialUnlocked: boolean
    specialTasks: SpecialTask[]
    results: string[]
}
