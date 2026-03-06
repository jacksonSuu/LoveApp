export type PrizeTier = 'lucky' | 'heart' | 'rare' | 'ultimate'
export type Prize = {
    name: string
    weight: number
    rare: boolean
    description?: string
    color?: string
    emoji?: string
    tier?: PrizeTier
}
export type CoinExchange = { name: string; cost: number; description?: string }
export type TaskCompleteMode = 'checkin' | 'verify' | 'draw'
export type DailyTask = { id: string; title: string; reward: number; maxTimes: number; doneTimes: number; mode: TaskCompleteMode }
export type SpecialTask = { id: string; title: string; reward: number; done: boolean; mode: TaskCompleteMode }
export type ContractRequest = {
    id: number
    fromUserId: string
    fromUsername: string
    toUserId: string
    toUsername: string
    whisper: string
    rejectReason: string | null
    createdAt: string
}

export type LotteryState = {
    baseDailyChances: number
    maxTaskBonus: number
    specialUnlockTarget: number
    prizePool: Prize[]
    coinExchanges: CoinExchange[]
    usedChances: number
    bonusChances: number
    remainingChances: number
    dailyTaskCount: number
    dailyTasks: DailyTask[]
    specialUnlocked: boolean
    specialTasks: SpecialTask[]
    results: string[]
    coins: number
    contractBound: boolean
    contractPartnerName: string | null
    contractIncomingRequests: ContractRequest[]
    contractOutgoingRequests: ContractRequest[]
    testMode: boolean
    canSaveToBackpack: boolean
}
