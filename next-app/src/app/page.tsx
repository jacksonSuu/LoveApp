"use client"

import { type DependencyList, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AnimatedModal } from '../components/lottery/AnimatedModal'
import { PrizePanel } from '../components/lottery/PrizePanel'
import { FragmentExchangePanel } from '../components/lottery/FragmentExchangePanel'
import { ReelPanel } from '../components/lottery/ReelPanel'
import { TaskSections } from '../components/lottery/TaskSections'
import { TopBar } from '../components/lottery/TopBar'
import type { LotteryState } from '../components/lottery/types'

type ApiResponse = {
    ok: boolean
    message?: string
    drawResults?: string[]
    state?: LotteryState
    userId?: string
    registered?: boolean
    token?: string
    username?: string
    config?: any
    expiresInMs?: number
}

type HintTone = 'info' | 'success' | 'error'
type ToastItem = { id: number; message: string; tone: HintTone; repeat: number }

const TOAST_PRIORITY: Record<HintTone, number> = {
    error: 3,
    success: 2,
    info: 1,
}

const TOAST_AUTO_HIDE_MS = 3200
const TOAST_THROTTLE_MS = 450
const TOAST_MAX_QUEUE = 20
const HISTORY_PAGE_SIZE = 10
const USER_TOKEN_STORAGE_KEY = 'lottery_user_token'
const USER_ID_STORAGE_KEY = 'lottery_user_id'
const USER_NAME_STORAGE_KEY = 'lottery_username'

let cachedUserId = ''

const getOrCreateUserId = (): string => {
    if (cachedUserId) return cachedUserId
    if (typeof window === 'undefined') return ''
    const current = (localStorage.getItem(USER_TOKEN_STORAGE_KEY) || localStorage.getItem(USER_ID_STORAGE_KEY) || '').trim()
    if (current) {
        cachedUserId = current
        return cachedUserId
    }
    return ''
}

const fetchJson = async (url: string, options: RequestInit = {}, token = ''): Promise<ApiResponse> => {
    try {
        const headers: Record<string, string> = {}
        if (options.body !== undefined) headers['Content-Type'] = 'application/json'
        if (token) headers.Authorization = `Bearer ${token}`
        const userId = getOrCreateUserId()
        if (userId) headers['x-user-id'] = userId

        const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers as Record<string, string> | undefined) } })
        const contentType = res.headers.get('content-type') || ''
        const isJson = /application\/json/i.test(contentType)
        const payload = isJson ? ((await res.json().catch(() => ({}))) as Partial<ApiResponse>) : {}

        if (!res.ok) {
            return {
                ok: false,
                message: payload.message || `请求失败（${res.status}）`,
                state: payload.state,
                drawResults: payload.drawResults,
            }
        }

        if (typeof payload.ok === 'boolean') return payload as ApiResponse
        return { ok: true, ...payload }
    } catch {
        return { ok: false, message: '网络异常，请稍后重试' }
    }
}

function useAsyncEffect(fn: () => Promise<void>, deps: DependencyList) {
    useEffect(() => {
        void fn()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)
}

export default function Page() {
    const [currentUser, setCurrentUser] = useState<{ userId: string; username: string } | null>(null)
    const [authNameInput, setAuthNameInput] = useState('')
    const [authBusy, setAuthBusy] = useState(false)
    const [authError, setAuthError] = useState('')
    const [state, setState] = useState<LotteryState | null>(null)
    const [activeToast, setActiveToast] = useState<ToastItem | null>(null)
    const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
    const [spinning, setSpinning] = useState(false)
    const [showTask, setShowTask] = useState(false)
    const [showResult, setShowResult] = useState(false)
    const [showContract, setShowContract] = useState(false)
    const [showAdmin, setShowAdmin] = useState(false)
    const [resultList, setResultList] = useState<string[]>([])
    const [showDrawOverlay, setShowDrawOverlay] = useState(false)
    const [drawCanSkip, setDrawCanSkip] = useState(false)
    const [adminToken, setAdminToken] = useState('')
    const [adminConfig, setAdminConfig] = useState<any>(null)
    const [adminConfigDrafts, setAdminConfigDrafts] = useState({
        prizePool: '[]',
        dailyTasks: '[]',
        specialTasks: '[]',
        coinExchanges: '[]',
    })
    const [adminForm, setAdminForm] = useState({ username: 'root', password: '' })
    const [adminPwdForm, setAdminPwdForm] = useState({ oldPassword: '', newPassword: '' })
    const [activeIndex, setActiveIndex] = useState(0)
    const [rolling, setRolling] = useState(false)
    const [theme, setTheme] = useState<'light' | 'dark'>('dark')
    const [dailySubmittingId, setDailySubmittingId] = useState<string | null>(null)
    const [specialSubmittingId, setSpecialSubmittingId] = useState<string | null>(null)
    const [contractApplying, setContractApplying] = useState(false)
    const [contractRespondingId, setContractRespondingId] = useState<number | null>(null)
    const [contractTargetNickname, setContractTargetNickname] = useState('')
    const [adminBusy, setAdminBusy] = useState(false)
    const [historyPage, setHistoryPage] = useState(1)

    const rollingTimer = useRef<NodeJS.Timeout | null>(null)
    const drawSequenceTimer = useRef<NodeJS.Timeout | null>(null)
    const resultModalTimer = useRef<NodeJS.Timeout | null>(null)
    const toastTimer = useRef<NodeJS.Timeout | null>(null)
    const toastIdRef = useRef(0)
    const activeToastRef = useRef<ToastItem | null>(null)
    const queueRef = useRef<ToastItem[]>([])
    const lastToastKeyRef = useRef('')
    const lastToastAtRef = useRef(0)
    const speedRef = useRef(80)
    const settleStepsRef = useRef<number | null>(null)
    const settleTotalStepsRef = useRef(0)
    const settleDelaysRef = useRef<number[]>([])
    const settlePointerRef = useRef(0)
    const rollingStepRef = useRef(0)
    const targetIndexRef = useRef(0)
    const drawSkipRequestedRef = useRef(false)
    const drawFinishRef = useRef<(() => void) | null>(null)

    const [showBackpack, setShowBackpack] = useState(false)
    const [showHistoryModal, setShowHistoryModal] = useState(false)
    const [showExchangeModal, setShowExchangeModal] = useState(false)
    const prizePool = state?.prizePool || []

    const buildSettleDelays = (steps: number, targetMs: number) => {
        if (steps <= 0) return []
        const raw = Array.from({ length: steps }, (_, i) => {
            const p = (i + 1) / steps
            const base = 0.9 + Math.pow(p, 2) * 1.9 + Math.pow(p, 4) * 2.4
            const tailBoost = p > 0.72 ? Math.pow((p - 0.72) / 0.28, 2) * 2.2 : 0
            return base + tailBoost
        })
        const rawSum = raw.reduce((s, n) => s + n, 0)
        const scaled = raw.map((w) => (w / rawSum) * targetMs)
        const delays = scaled.map((d) => Math.round(Math.max(42, Math.min(300, d))))
        const used = delays.reduce((s, n) => s + n, 0)
        const diff = targetMs - used
        delays[delays.length - 1] = Math.max(42, Math.min(320, delays[delays.length - 1] + diff))
        return delays
    }

    const showHint = (message: string, tone: HintTone = 'info') => {
        if (tone === 'success') return

        const now = Date.now()
        const dedupeKey = `${tone}:${message}`

        if (lastToastKeyRef.current === dedupeKey && now - lastToastAtRef.current < TOAST_THROTTLE_MS) {
            const current = activeToastRef.current
            if (current && current.message === message && current.tone === tone) {
                const next = { ...current, repeat: current.repeat + 1 }
                activeToastRef.current = next
                setActiveToast(next)
                return
            }
            const queued = queueRef.current
            const idx = queued.findIndex((item) => item.message === message && item.tone === tone)
            if (idx >= 0) {
                const nextQueue = [...queued]
                nextQueue[idx] = { ...nextQueue[idx], repeat: nextQueue[idx].repeat + 1 }
                queueRef.current = nextQueue
                setToastQueue(nextQueue)
                return
            }
        }

        lastToastKeyRef.current = dedupeKey
        lastToastAtRef.current = now

        const current = activeToastRef.current
        if (current && current.message === message && current.tone === tone) {
            const next = { ...current, repeat: current.repeat + 1 }
            activeToastRef.current = next
            setActiveToast(next)
            return
        }

        const queued = queueRef.current
        const idx = queued.findIndex((item) => item.message === message && item.tone === tone)
        if (idx >= 0) {
            const nextQueue = [...queued]
            nextQueue[idx] = { ...nextQueue[idx], repeat: nextQueue[idx].repeat + 1 }
            queueRef.current = nextQueue
            setToastQueue(nextQueue)
            return
        }

        toastIdRef.current += 1
        const item: ToastItem = { id: toastIdRef.current, message, tone, repeat: 1 }

        if (!current) {
            activeToastRef.current = item
            setActiveToast(item)
            return
        }

        if (TOAST_PRIORITY[tone] > TOAST_PRIORITY[current.tone]) {
            const nextQueue = [current, ...queued].slice(0, TOAST_MAX_QUEUE)
            queueRef.current = nextQueue
            setToastQueue(nextQueue)
            activeToastRef.current = item
            setActiveToast(item)
            return
        }

        const nextQueue = [...queued, item].slice(0, TOAST_MAX_QUEUE)
        queueRef.current = nextQueue
        setToastQueue(nextQueue)
    }

    const closeToast = () => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        activeToastRef.current = null
        setActiveToast(null)
    }

    const isJsonValid = (raw: string) => {
        try {
            const parsed = JSON.parse(raw || '[]')
            return Array.isArray(parsed)
        } catch {
            return false
        }
    }

    const adminJsonValidity = {
        prizePool: isJsonValid(adminConfigDrafts.prizePool),
        dailyTasks: isJsonValid(adminConfigDrafts.dailyTasks),
        specialTasks: isJsonValid(adminConfigDrafts.specialTasks),
        coinExchanges: isJsonValid(adminConfigDrafts.coinExchanges),
    }
    const canSaveAdminConfig =
        adminJsonValidity.prizePool &&
        adminJsonValidity.dailyTasks &&
        adminJsonValidity.specialTasks &&
        adminJsonValidity.coinExchanges

    const syncState = async () => {
        if (!currentUser?.userId) return
        const data = await fetchJson('/api/lottery/state')
        if (!data.ok) {
            showHint(data.message || '加载失败', 'error')
            return
        }
        setState(data.state || null)
    }

    useEffect(() => {
        if (typeof window === 'undefined') return
        const userId = (localStorage.getItem(USER_TOKEN_STORAGE_KEY) || localStorage.getItem(USER_ID_STORAGE_KEY) || '').trim()
        const username = (localStorage.getItem(USER_NAME_STORAGE_KEY) || '').trim()
        if (!userId || !username) return
        cachedUserId = userId
        localStorage.setItem(USER_TOKEN_STORAGE_KEY, userId)
        localStorage.setItem(USER_ID_STORAGE_KEY, userId)
        setCurrentUser({ userId, username })
        setAuthNameInput(username)
    }, [])

    useAsyncEffect(syncState, [currentUser?.userId])

    useEffect(() => {
        return () => {
            if (rollingTimer.current) clearTimeout(rollingTimer.current)
            if (drawSequenceTimer.current) clearTimeout(drawSequenceTimer.current)
            if (resultModalTimer.current) clearTimeout(resultModalTimer.current)
            if (toastTimer.current) clearTimeout(toastTimer.current)
        }
    }, [])

    useEffect(() => {
        const localTheme = typeof window !== 'undefined' ? localStorage.getItem('lottery_theme') : null
        if (localTheme === 'light' || localTheme === 'dark') {
            setTheme(localTheme)
            return
        }
        if (typeof window !== 'undefined') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
            setTheme(prefersDark ? 'dark' : 'light')
        }
    }, [])

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('lottery_theme', theme)
    }, [theme])

    useEffect(() => {
        const hasModal = showAdmin || showTask || showResult || showDrawOverlay || showBackpack || showHistoryModal || showExchangeModal || showContract
        document.body.style.overflow = hasModal ? 'hidden' : ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [showAdmin, showTask, showResult, showDrawOverlay, showBackpack, showHistoryModal, showExchangeModal, showContract])

    useEffect(() => {
        if (!activeToast && toastQueue.length > 0) {
            const next = toastQueue[0]
            const rest = toastQueue.slice(1)
            activeToastRef.current = next
            queueRef.current = rest
            setActiveToast(next)
            setToastQueue(rest)
        }
    }, [activeToast, toastQueue])

    useEffect(() => {
        if (!activeToast) return
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => {
            activeToastRef.current = null
            setActiveToast(null)
        }, TOAST_AUTO_HIDE_MS)
        return () => {
            if (toastTimer.current) clearTimeout(toastTimer.current)
        }
    }, [activeToast])

    useEffect(() => {
        setHistoryPage(1)
    }, [state?.results])

    const onCompleteRef = useRef<(() => void) | null>(null)

    const startRolling = (len: number) => {
        if (rollingTimer.current) clearTimeout(rollingTimer.current)
        speedRef.current = 82
        settleStepsRef.current = null
        settleTotalStepsRef.current = 0
        settleDelaysRef.current = []
        settlePointerRef.current = 0
        rollingStepRef.current = 0
        setRolling(true)

        const tick = () => {
            setActiveIndex((prev) => (len === 0 ? 0 : (prev + 1) % len))
            rollingStepRef.current += 1
            const stepsLeft = settleStepsRef.current
            if (stepsLeft !== null) {
                const nextSteps = stepsLeft - 1
                settleStepsRef.current = nextSteps
                speedRef.current = settleDelaysRef.current[settlePointerRef.current] ?? speedRef.current
                settlePointerRef.current += 1

                if (nextSteps <= 0) {
                    setActiveIndex(targetIndexRef.current % Math.max(len, 1))
                    setRolling(false)
                    if (onCompleteRef.current) {
                        onCompleteRef.current()
                        onCompleteRef.current = null
                    }
                    return
                }
            } else {
                const accel = Math.min(1, rollingStepRef.current / 10)
                speedRef.current = Math.round(82 - accel * 30)
            }
            rollingTimer.current = setTimeout(tick, speedRef.current)
        }

        rollingTimer.current = setTimeout(tick, speedRef.current)
    }

    const stopRollingTo = (targetName: string, len: number, onComplete?: () => void) => {
        if (!len) {
            setRolling(false)
            if (onComplete) onComplete()
            return
        }
        if (onComplete) onCompleteRef.current = onComplete
        const normalized = targetName.replace(/^✨稀有✨\s*/, '')
        const idx = Math.max(
            0,
            prizePool.findIndex((p) => p.name === normalized || targetName.includes(p.name)),
        )
        targetIndexRef.current = idx === -1 ? 0 : idx
        const current = activeIndex
        const forward = (targetIndexRef.current - current + len) % len
        const settleSteps = Math.max(10, Math.min(16, forward + Math.ceil(len * 0.8) + 2))
        const rawDuration = 3000 + len * 70 + forward * 42
        const settleDuration = Math.max(3000, Math.min(4000, rawDuration))
        settleDelaysRef.current = buildSettleDelays(settleSteps, settleDuration)
        settleStepsRef.current = settleSteps
        settleTotalStepsRef.current = settleSteps
        settlePointerRef.current = 0
        speedRef.current = settleDelaysRef.current[0] ?? 70
    }

    const draw = async (times: 1 | 5) => {
        if (!state || spinning) return
        if (state.remainingChances < times) {
            showHint('次数不足哦～先完成任务套餐吧', 'error')
            return
        }
        drawSkipRequestedRef.current = false
        drawFinishRef.current = null
        setShowDrawOverlay(true)
        setDrawCanSkip(false)
        if (resultModalTimer.current) clearTimeout(resultModalTimer.current)
        if (drawSequenceTimer.current) clearTimeout(drawSequenceTimer.current)
        if (prizePool.length > 0) {
            startRolling(prizePool.length)
        }
        setSpinning(true)
        const data = await fetchJson(
            '/api/lottery/draw',
            {
                method: 'POST',
                body: JSON.stringify({ times }),
            },
        )
        setSpinning(false)
        if (!data.ok) {
            showHint(data.message || '抽奖失败', 'error')
            setRolling(false)
            setShowDrawOverlay(false)
            setDrawCanSkip(false)
            if (data.state) setState(data.state)
            return
        }

        const finishDraw = () => {
            setShowDrawOverlay(false)
            setDrawCanSkip(false)
            showHint(data.message || '抽奖完成', 'success')
            setResultList(data.drawResults || [])
            setShowResult(true)
            if (data.state) setState(data.state)
            drawFinishRef.current = null
        }
        drawFinishRef.current = finishDraw
        setDrawCanSkip(true)

        if ((data.drawResults ?? []).length > 0) {
            const arr = data.drawResults!

            if (times === 1) {
                stopRollingTo(arr[0], prizePool.length, finishDraw)
            } else {
                let currentIndex = 0
                const runNext = () => {
                    if (drawSkipRequestedRef.current) return
                    if (currentIndex > 0) {
                        startRolling(prizePool.length)
                    }
                    drawSequenceTimer.current = setTimeout(() => {
                        if (drawSkipRequestedRef.current) return
                        stopRollingTo(arr[currentIndex], prizePool.length, () => {
                            if (drawSkipRequestedRef.current) return
                            currentIndex++
                            if (currentIndex < arr.length) {
                                drawSequenceTimer.current = setTimeout(runNext, 400)
                            } else {
                                finishDraw()
                            }
                        })
                    }, currentIndex === 0 ? 0 : 500)
                }
                runNext()
            }
        } else {
            finishDraw()
            setRolling(false)
        }
    }

    const skipDrawAnimation = () => {
        if (!drawCanSkip || !drawFinishRef.current) return
        drawSkipRequestedRef.current = true
        if (rollingTimer.current) clearTimeout(rollingTimer.current)
        if (drawSequenceTimer.current) clearTimeout(drawSequenceTimer.current)
        onCompleteRef.current = null
        settleStepsRef.current = null
        settleTotalStepsRef.current = 0
        settleDelaysRef.current = []
        settlePointerRef.current = 0
        rollingStepRef.current = 0
        setRolling(false)
        const finish = drawFinishRef.current
        finish()
    }

    const exchangeCoins = async (index: number) => {
        const data = await fetchJson(
            '/api/lottery/exchange',
            {
                method: 'POST',
                body: JSON.stringify({ index }),
            },
        )
        if (!data.ok) {
            showHint(data.message || '兑换失败', 'error')
            if (data.state) setState(data.state)
            return
        }
        showHint(data.message || '兑换成功', 'success')
        if (data.state) setState(data.state)
    }

    const completeDaily = async (id: string) => {
        if (dailySubmittingId) return
        const task = state?.dailyTasks.find((item) => item.id === id)
        if (!task) {
            showHint('任务不存在或状态已刷新，请重试', 'error')
            return
        }

        let payload: Record<string, unknown> = {}
        if (task.mode === 'checkin') {
            const confirmed = window.confirm('确认已完成今日签到？')
            if (!confirmed) return
            payload = { confirmCheckIn: true }
        } else if (task.mode === 'draw') {
            payload = { drawDone: true }
        } else {
            const evidence = window.prompt('请输入任务完成说明（用于审核/条件判断）：', '')?.trim() || ''
            if (evidence.length < 2) {
                showHint('请先填写完成说明，再提交审核', 'error')
                return
            }
            payload = { evidence }
        }

        setDailySubmittingId(id)
        const data = await fetchJson(`/api/lottery/tasks/daily/${id}/complete`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
        setDailySubmittingId(null)
        if (!data.ok) {
            showHint(data.message || '任务提交失败', 'error')
            return
        }
        showHint(data.message || '日常任务完成', 'success')
        if (data.state) setState(data.state)
    }

    const completeSpecial = async (id: string) => {
        if (specialSubmittingId) return
        const task = state?.specialTasks.find((item) => item.id === id)
        if (!task) {
            showHint('任务不存在或状态已刷新，请重试', 'error')
            return
        }

        let payload: Record<string, unknown> = {}
        if (task.mode === 'checkin') {
            const confirmed = window.confirm('确认已完成今日签到？')
            if (!confirmed) return
            payload = { confirmCheckIn: true }
        } else if (task.mode === 'draw') {
            payload = { drawDone: true }
        } else {
            const evidence = window.prompt('请输入任务完成说明（用于审核/条件判断）：', '')?.trim() || ''
            if (evidence.length < 2) {
                showHint('请先填写完成说明，再提交审核', 'error')
                return
            }
            payload = { evidence }
        }

        setSpecialSubmittingId(id)
        const data = await fetchJson(`/api/lottery/tasks/special/${id}/complete`, {
            method: 'POST',
            body: JSON.stringify(payload),
        })
        setSpecialSubmittingId(null)
        if (!data.ok) {
            showHint(data.message || '任务提交失败', 'error')
            return
        }
        showHint(data.message || '特殊任务完成', 'success')
        if (data.state) setState(data.state)
    }

    const submitContractApply = async () => {
        if (contractApplying) return
        const nickname = contractTargetNickname.trim()
        if (!nickname) {
            showHint('请输入对方昵称', 'error')
            return
        }
        setContractApplying(true)
        const data = await fetchJson('/api/contract/request', {
            method: 'POST',
            body: JSON.stringify({ nickname }),
        })
        setContractApplying(false)
        if (!data.ok) {
            showHint(data.message || '契约申请失败', 'error')
            if (data.state) setState(data.state)
            return
        }
        setContractTargetNickname('')
        showHint(data.message || '契约申请已发送', 'info')
        if (data.state) setState(data.state)
    }

    const respondContractRequest = async (requestId: number, action: 'accept' | 'reject') => {
        if (contractRespondingId) return
        setContractRespondingId(requestId)
        const data = await fetchJson('/api/contract/respond', {
            method: 'POST',
            body: JSON.stringify({ requestId, action }),
        })
        setContractRespondingId(null)
        if (!data.ok) {
            showHint(data.message || '处理失败', 'error')
            if (data.state) setState(data.state)
            return
        }
        showHint(data.message || (action === 'accept' ? '已接受申请' : '已拒绝申请'), 'info')
        if (data.state) setState(data.state)
    }

    const adminLogin = async () => {
        if (adminBusy) return
        setAdminBusy(true)
        const data = await fetchJson(
            '/api/admin/login',
            {
                method: 'POST',
                body: JSON.stringify(adminForm),
            },
            '',
        )
        setAdminBusy(false)
        if (!data.ok || !data.token) {
            showHint(data.message || '管理员登录失败', 'error')
            return
        }
        setAdminToken(data.token)
        showHint(`管理员 ${data.username} 登录成功`, 'success')
        await loadAdminConfig(data.token)
    }

    const loadAdminConfig = async (token = adminToken) => {
        if (!token) return
        const data = await fetchJson('/api/admin/config', { method: 'GET' }, token)
        if (!data.ok) {
            showHint(data.message || '管理员配置获取失败', 'error')
            setAdminToken('')
            setAdminConfig(null)
            setAdminConfigDrafts({ prizePool: '[]', dailyTasks: '[]', specialTasks: '[]', coinExchanges: '[]' })
            return
        }
        setAdminConfig(data.config)
        setAdminConfigDrafts({
            prizePool: JSON.stringify(data.config?.prizePool ?? [], null, 2),
            dailyTasks: JSON.stringify(data.config?.dailyTasks ?? [], null, 2),
            specialTasks: JSON.stringify(data.config?.specialTasks ?? [], null, 2),
            coinExchanges: JSON.stringify(data.config?.coinExchanges ?? [], null, 2),
        })
    }

    const saveAdminConfig = async () => {
        if (!adminToken || !adminConfig || adminBusy) return
        if (!canSaveAdminConfig) {
            showHint('JSON 仍有格式错误，无法保存', 'error')
            return
        }
        let prizePool: unknown[] = []
        let dailyTasks: unknown[] = []
        let specialTasks: unknown[] = []
        let coinExchanges: unknown[] = []
        try {
            prizePool = JSON.parse(adminConfigDrafts.prizePool || '[]')
            dailyTasks = JSON.parse(adminConfigDrafts.dailyTasks || '[]')
            specialTasks = JSON.parse(adminConfigDrafts.specialTasks || '[]')
            coinExchanges = JSON.parse(adminConfigDrafts.coinExchanges || '[]')
        } catch {
            showHint('JSON 格式有误，请先修正后再保存', 'error')
            return
        }
        const confirmed = window.confirm('确认保存配置吗？保存后将立即生效并重置当天进度。')
        if (!confirmed) return
        setAdminBusy(true)
        const data = await fetchJson(
            '/api/admin/config',
            {
                method: 'PUT',
                body: JSON.stringify({
                    ...adminConfig,
                    prizePool,
                    dailyTasks,
                    specialTasks,
                    coinExchanges,
                }),
            },
            adminToken,
        )
        setAdminBusy(false)
        if (!data.ok) {
            showHint(data.message || '保存配置失败', 'error')
            if (/会话|未授权|重新登录/.test(String(data.message || ''))) {
                setAdminToken('')
                setAdminConfig(null)
            }
            return
        }
        showHint(data.message || '保存成功', 'success')
        if (data.config) {
            setAdminConfig(data.config)
            setAdminConfigDrafts({
                prizePool: JSON.stringify(data.config.prizePool ?? [], null, 2),
                dailyTasks: JSON.stringify(data.config.dailyTasks ?? [], null, 2),
                specialTasks: JSON.stringify(data.config.specialTasks ?? [], null, 2),
                coinExchanges: JSON.stringify(data.config.coinExchanges ?? [], null, 2),
            })
        }
        await syncState()
    }

    const changeAdminPwd = async () => {
        if (!adminToken || adminBusy) return
        setAdminBusy(true)
        const data = await fetchJson(
            '/api/admin/password',
            {
                method: 'POST',
                body: JSON.stringify(adminPwdForm),
            },
            adminToken,
        )
        setAdminBusy(false)
        if (!data.ok) {
            showHint(data.message || '修改密码失败', 'error')
            if (/会话|未授权|重新登录/.test(String(data.message || ''))) {
                setAdminToken('')
                setAdminConfig(null)
            }
            return
        }
        setAdminPwdForm({ oldPassword: '', newPassword: '' })
        showHint(data.message || '管理员密码已更新', 'success')
    }

    const adminLogout = async () => {
        if (adminBusy) return
        if (adminToken) {
            setAdminBusy(true)
            await fetchJson('/api/admin/logout', { method: 'POST' }, adminToken)
            setAdminBusy(false)
        }
        setAdminToken('')
        setAdminConfig(null)
        setAdminConfigDrafts({ prizePool: '[]', dailyTasks: '[]', specialTasks: '[]', coinExchanges: '[]' })
        showHint('已退出管理员登录', 'info')
    }

    const handleJsonUpdate = (field: 'prizePool' | 'dailyTasks' | 'specialTasks' | 'coinExchanges', value: string) => {
        setAdminConfigDrafts((prev) => ({ ...prev, [field]: value }))
    }

    const submitUserAuth = async () => {
        if (authBusy) return
        const username = authNameInput
        if (!username.trim()) {
            setAuthError('请输入你的昵称')
            return
        }
        setAuthBusy(true)
        setAuthError('')
        const data = await fetchJson('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username }),
        })
        setAuthBusy(false)
        if (!data.ok || !data.userId || !data.username) {
            setAuthError(data.message || '注册失败')
            return
        }
        const token = (data.token || data.userId || '').trim()
        cachedUserId = token
        localStorage.setItem(USER_TOKEN_STORAGE_KEY, token)
        localStorage.setItem(USER_ID_STORAGE_KEY, token)
        localStorage.setItem(USER_NAME_STORAGE_KEY, data.username)
        setCurrentUser({ userId: token, username: data.username })
        showHint(data.message || '注册成功', 'info')
    }

    const switchUser = () => {
        localStorage.removeItem(USER_TOKEN_STORAGE_KEY)
        localStorage.removeItem(USER_ID_STORAGE_KEY)
        localStorage.removeItem(USER_NAME_STORAGE_KEY)
        cachedUserId = ''
        setCurrentUser(null)
        setState(null)
        setAuthError('')
    }

    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            if (showAdmin) setShowAdmin(false)
            else if (showContract) setShowContract(false)
            else if (showBackpack) setShowBackpack(false)
            else if (showHistoryModal) setShowHistoryModal(false)
            else if (showExchangeModal) setShowExchangeModal(false)
            else if (showTask) setShowTask(false)
            else if (showResult) setShowResult(false)
        }
        window.addEventListener('keydown', onEsc)
        return () => window.removeEventListener('keydown', onEsc)
    }, [showAdmin, showContract, showBackpack, showHistoryModal, showExchangeModal, showTask, showResult])

    const adminLoggedIn = !!adminToken && !!adminConfig
    const remaining = state?.remainingChances ?? 0
    const taskBonusUsed = state?.bonusChances ?? 0
    const taskBonusMax = state?.maxTaskBonus ?? 0
    const taskBonusPercent = taskBonusMax > 0 ? Math.min(100, Math.round((taskBonusUsed / taskBonusMax) * 100)) : 0
    const contractBound = state?.contractBound ?? false
    const canSingleDraw = !!state && remaining >= 1 && !spinning
    const canFiveDraw = !!state && remaining >= 5 && !spinning
    const historyItems = [...(state?.results ?? [])].reverse()
    const historyTotalPages = Math.max(1, Math.ceil(historyItems.length / HISTORY_PAGE_SIZE))
    const currentHistoryPage = Math.min(historyPage, historyTotalPages)
    const historyStart = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE
    const historyPageItems = historyItems.slice(historyStart, historyStart + HISTORY_PAGE_SIZE)
    const normalizeResultName = (raw: string) =>
        raw
            .replace(/^✨稀有✨\s*/, '')
            .replace(/^\[RARE\]\s*/i, '')
            .trim()
    const backpackMap = new Map<string, { name: string; count: number; rare: boolean; order: number }>()
        ; (state?.results ?? []).forEach((entry) => {
            const normalized = normalizeResultName(entry)
            const matchedIndex = prizePool.findIndex((p) => normalized === p.name || normalized.includes(p.name) || p.name.includes(normalized))
            const matchedPrize = matchedIndex >= 0 ? prizePool[matchedIndex] : null
            const name = matchedPrize?.name || normalized || '未知奖品'
            const existing = backpackMap.get(name)
            if (existing) {
                existing.count += 1
                existing.rare = existing.rare || /✨稀有✨|\[RARE\]/.test(entry) || !!matchedPrize?.rare
                return
            }
            backpackMap.set(name, {
                name,
                count: 1,
                rare: /✨稀有✨|\[RARE\]/.test(entry) || !!matchedPrize?.rare,
                order: matchedIndex >= 0 ? matchedIndex : Number.MAX_SAFE_INTEGER,
            })
        })
    const backpackItems = Array.from(backpackMap.values()).sort((a, b) => b.count - a.count || a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'))
    const backpackSlots = Array.from({ length: 20 }, (_, idx) => backpackItems[idx] ?? null)
    const prizeExchangeRules = prizePool.map((item) => {
        const exchange = (item.description || '').replace(/^可兑换[:：]?\s*/, '').trim() || '以活动现场公布内容为准'
        return `【奖品说明】${item.name}：${exchange}`
    })
    const policyRules = [
        '注册后可在右上角【🤝 契约】中输入另一名用户昵称发起绑定申请。',
        '被申请人会在契约弹窗中收到申请，可选择接受或拒绝。',
        '未绑定契约：每天发放 50 次测试抽奖，仅作展示，奖品不会进入背包。',
        '已绑定契约：解锁契约任务，并启用真实抽奖与奖品入包记录。',
        '当前任务仅开放：签到任务、抽奖任务；未绑定时契约任务显示锁定中。',
        '实物或权益类奖品请在通知期限内完成确认，逾期未确认视为自动放弃。',
        '如遇不可抗力、系统升级或法律法规调整，主办方有权在合法范围内进行规则优化并公示。',
    ]
    const displayRules = [...policyRules, ...prizeExchangeRules]
    const drawHelper = !state
        ? '正在同步抽奖数据...'
        : spinning
            ? '正在处理本次抽奖，请稍候...'
            : remaining <= 0
                ? '今日次数已用完，先完成任务再来吧'
                : state?.testMode
                    ? `当前测试模式可用 ${remaining} 次（奖品不会进背包）`
                    : `当前可用 ${remaining} 次，推荐先单抽试试手气`

    if (!currentUser) {
        return (
            <div className="crystal-shell">
                <div className="draw-overlay" style={{ opacity: 1 }}>
                    <div className="draw-overlay-card" style={{ maxWidth: 520 }}>
                        <h2>欢迎来到缘</h2>
                        <p className="sub-tip">首次进入请先注册。请输入你的昵称。</p>
                        <input
                            className="input"
                            placeholder="请输入你的昵称"
                            value={authNameInput}
                            onChange={(e) => setAuthNameInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void submitUserAuth()
                            }}
                        />
                        {authError && <p className="small-tip error-tip">{authError}</p>}
                        <div className="draw-overlay-actions">
                            <button className="btn primary" onClick={submitUserAuth} disabled={authBusy}>
                                {authBusy ? '注册中...' : '注册并进入首页'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="crystal-shell">
            <TopBar
                theme={theme}
                onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                onOpenTask={() => setShowTask(true)}
                onOpenContract={() => setShowContract(true)}
                onOpenAdmin={() => setShowAdmin(true)}
                remainingChances={state?.remainingChances ?? 0}
                bonusChances={state?.bonusChances ?? 0}
                maxTaskBonus={state?.maxTaskBonus ?? 0}
                contractBound={contractBound}
            />

            <div className="toast-layer" aria-live="polite" aria-atomic="true">
                <AnimatePresence mode="wait">
                    {activeToast && (
                        <motion.div
                            key={`${activeToast.id}-${activeToast.repeat}`}
                            className={`toast toast-${activeToast.tone}`}
                            role="status"
                            initial={{ y: -16, opacity: 0, scale: 0.98 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: -8, opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                        >
                            <span className="toast-text">{activeToast.message}</span>
                            <div className="toast-actions">
                                {activeToast.repeat > 1 && <span className="toast-repeat">x{activeToast.repeat}</span>}
                                {toastQueue.length > 0 && <span className="toast-queued">+{toastQueue.length}</span>}
                                <button className="toast-close" onClick={closeToast} aria-label="关闭提示">
                                    ×
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <main className="main-stage">
                {!state && <div className="loading-card">抽奖模块初始化中，请稍候...</div>}

                <section className="kpi-grid" aria-label="抽奖状态总览">
                    <article className="kpi-card">
                        <div className="kpi-top">
                            <span className="kpi-icon" aria-hidden>
                                🎯
                            </span>
                            <span>剩余次数</span>
                        </div>
                        <strong>{remaining}</strong>
                        <small>总可用</small>
                    </article>
                    <article className="kpi-card">
                        <div className="kpi-top">
                            <span className="kpi-icon" aria-hidden>
                                ⚡
                            </span>
                            <span>任务加成</span>
                        </div>
                        <strong>
                            {taskBonusUsed}/{taskBonusMax}
                        </strong>
                        <small>进度 {taskBonusPercent}%</small>
                    </article>
                    <article className="kpi-card">
                        <div className="kpi-top">
                            <span className="kpi-icon" aria-hidden>
                                🤝
                            </span>
                            <span>契约状态</span>
                        </div>
                        <strong>{contractBound ? '已绑定' : '未绑定'}</strong>
                        <small>{contractBound ? `契约对象：${state?.contractPartnerName || '已绑定'}` : ''}</small>
                    </article>
                </section>
                <section className="home-layout" aria-label="首页主内容布局">
                    <div className="left-stack">

                        <PrizePanel prizePool={prizePool} onOpenBackpack={() => setShowBackpack(true)} />

                        <div className="actions draw-actions">
                            <button className="btn primary" disabled={!canSingleDraw} onClick={() => draw(1)}>
                                {spinning ? '抽奖中...' : '单抽'}
                            </button>
                            <button className="btn" disabled={!canFiveDraw} onClick={() => draw(5)}>
                                {spinning ? '处理中...' : '五连抽'}
                            </button>
                        </div>

                        <p className="action-helper">{drawHelper}</p>

                        <section className="rules-panel" aria-label="活动规则">
                            <div className="history-head">
                                <h3>活动规则</h3>
                            </div>
                            <ul className="rules-list">
                                {displayRules.map((rule) => (
                                    <li key={rule}>{rule}</li>
                                ))}
                            </ul>
                        </section>
                    </div>

                </section>
            </main>

            <AnimatePresence>
                {showContract && (
                    <AnimatedModal onClose={() => setShowContract(false)}>
                        <div className="modal-head">
                            <h2>契约绑定</h2>
                        </div>
                        {!state?.contractBound && (
                            <div className="form-grid">
                                <input
                                    className="input"
                                    placeholder="输入对方昵称"
                                    value={contractTargetNickname}
                                    onChange={(e) => setContractTargetNickname(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') void submitContractApply()
                                    }}
                                />
                                <button className="btn primary" disabled={contractApplying} onClick={submitContractApply}>
                                    {contractApplying ? '发送中...' : '发起契约申请'}
                                </button>
                            </div>
                        )}


                        <div className="modal-actions">
                            <button className="btn" onClick={() => setShowContract(false)}>
                                关闭
                            </button>
                        </div>
                    </AnimatedModal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showBackpack && (
                    <AnimatedModal onClose={() => setShowBackpack(false)}>
                        <div className="modal-head">
                            <h2>我的背包</h2>
                            <div className="backpack-head-actions">
                                <button className="text-btn" onClick={() => setShowHistoryModal(true)}>
                                    抽奖记录
                                </button>
                                <button className="text-btn" onClick={() => setShowExchangeModal(true)}>
                                    金币兑换
                                </button>
                            </div>
                        </div>
                        <p className="small-tip">已收集 {backpackItems.length} 种奖品</p>
                        <div className="backpack-grid">
                            {backpackSlots.map((slot, idx) => (
                                <article key={`slot-${idx}`} className={`backpack-slot ${slot ? 'filled' : ''} ${slot?.rare ? 'rare' : ''}`}>
                                    {slot ? (
                                        <>
                                            <span className="backpack-slot-name" title={slot.name}>{slot.name}</span>
                                            <span className="backpack-slot-count">x{slot.count}</span>
                                        </>
                                    ) : (
                                        <span className="backpack-slot-empty">{idx + 1}</span>
                                    )}
                                </article>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button className="btn" onClick={() => setShowBackpack(false)}>
                                关闭
                            </button>
                        </div>
                    </AnimatedModal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showHistoryModal && (
                    <AnimatedModal onClose={() => setShowHistoryModal(false)}>
                        <div className="modal-head">
                            <h2>抽奖记录</h2>
                        </div>
                        <section className="history-panel" aria-label="抽奖记录弹窗">
                            <div className="history-head">
                                <small className="small-tip">共 {historyItems.length} 条</small>
                            </div>
                            {historyItems.length === 0 ? (
                                <div className="history-empty">还没有记录，先抽一发试试手气吧 ✨</div>
                            ) : (
                                <>
                                    <ul className="history-list">
                                        {historyPageItems.map((item, idx) => {
                                            const order = historyItems.length - (historyStart + idx)
                                            return (
                                                <li key={`${order}-${item}`} className="history-item">
                                                    <span className="history-index">#{order}</span>
                                                    <span className="history-text">{item}</span>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                    <div className="history-pager">
                                        <button className="btn" onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={currentHistoryPage <= 1}>
                                            上一页
                                        </button>
                                        <span className="history-page-info">
                                            第 {currentHistoryPage} / {historyTotalPages} 页
                                        </span>
                                        <button
                                            className="btn"
                                            onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                                            disabled={currentHistoryPage >= historyTotalPages}
                                        >
                                            下一页
                                        </button>
                                    </div>
                                </>
                            )}
                        </section>
                        <div className="modal-actions">
                            <button className="btn" onClick={() => setShowHistoryModal(false)}>
                                关闭
                            </button>
                        </div>
                    </AnimatedModal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showExchangeModal && (
                    <AnimatedModal onClose={() => setShowExchangeModal(false)}>
                        <div className="modal-head">
                            <h2>金币兑换</h2>
                        </div>
                        <FragmentExchangePanel
                            coinExchanges={state?.coinExchanges || []}
                            coins={state?.coins || 0}
                            onExchange={exchangeCoins}
                            embedded
                        />
                        <div className="modal-actions">
                            <button className="btn" onClick={() => setShowExchangeModal(false)}>
                                关闭
                            </button>
                        </div>
                    </AnimatedModal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showDrawOverlay && (
                    <motion.div
                        className="draw-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="draw-overlay-card"
                            initial={{ scale: 0.96, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.98, y: 10, opacity: 0 }}
                        >
                            <h2>抽奖ing</h2>
                            <div className="draw-overlay-reel">
                                <ReelPanel rolling={rolling} activeIndex={activeIndex} prizePool={prizePool} />
                            </div>
                            <div className="draw-overlay-actions">
                                <button className="btn" onClick={skipDrawAnimation} disabled={!drawCanSkip}>
                                    {drawCanSkip ? '跳过动画，直接看结果' : '正在生成结果...'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showResult && (
                    <AnimatedModal onClose={() => setShowResult(false)}>
                        <div className="modal-head">
                            <h2>抽奖结果</h2>
                        </div>
                        <div className="result-list">
                            {resultList.map((t, i) => (
                                <div key={i} className={`result-item ${/(\[RARE\]|✨稀有✨)/.test(t) ? 'rare' : ''}`}>
                                    {t.replace('[RARE]', '✨稀有✨ ')}
                                </div>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button className="btn primary" onClick={() => setShowResult(false)}>
                                确认
                            </button>
                        </div>
                    </AnimatedModal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showTask && (
                    <AnimatedModal onClose={() => setShowTask(false)}>
                        <div className="modal-head">
                            <h2>任务套餐</h2>
                        </div>
                        <p className="sub-tip">完成任务可累计赠送抽奖次数（未绑定时仅开放签到与抽奖任务）</p>
                        <TaskSections
                            state={state}
                            onCompleteDaily={completeDaily}
                            onCompleteSpecial={completeSpecial}
                            submittingDailyId={dailySubmittingId}
                            submittingSpecialId={specialSubmittingId}
                        />
                        <div className="modal-actions">
                            <button className="btn" onClick={() => setShowTask(false)}>
                                关闭
                            </button>
                        </div>
                    </AnimatedModal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showAdmin && (
                    <AnimatedModal onClose={() => setShowAdmin(false)}>
                        <div className="modal-head">
                            <h2>管理员面板</h2>
                        </div>

                        {!adminLoggedIn && (
                            <div className="admin-block">
                                <p className="sub-tip">请输入管理员账号密码（默认用户名：root）</p>
                                <div className="form-grid">
                                    <input
                                        className="input"
                                        placeholder="用户名"
                                        value={adminForm.username}
                                        onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                                    />
                                    <input
                                        className="input"
                                        type="password"
                                        placeholder="密码"
                                        value={adminForm.password}
                                        onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                                    />
                                    <button className="btn primary" disabled={adminBusy} onClick={adminLogin}>
                                        {adminBusy ? '登录中...' : '登录管理员'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {adminLoggedIn && (
                            <div className="admin-block">
                                <div className="admin-head-row">
                                    <p className="sub-tip">
                                        已登录：<strong>{adminForm.username || 'root'}</strong>
                                    </p>
                                    <button className="btn" disabled={adminBusy} onClick={adminLogout}>
                                        退出登录
                                    </button>
                                </div>

                                <div className="form-grid">
                                    <label>
                                        每日基础次数
                                        <input
                                            className="input"
                                            type="number"
                                            min={1}
                                            value={adminConfig?.baseDailyChances ?? ''}
                                            onChange={(e) => setAdminConfig({ ...adminConfig, baseDailyChances: Number(e.target.value) })}
                                        />
                                    </label>
                                    <label>
                                        任务赠送上限
                                        <input
                                            className="input"
                                            type="number"
                                            min={1}
                                            value={adminConfig?.maxTaskBonus ?? ''}
                                            onChange={(e) => setAdminConfig({ ...adminConfig, maxTaskBonus: Number(e.target.value) })}
                                        />
                                    </label>
                                    <label>
                                        特殊任务解锁门槛
                                        <input
                                            className="input"
                                            type="number"
                                            min={1}
                                            value={adminConfig?.specialUnlockTarget ?? ''}
                                            onChange={(e) => setAdminConfig({ ...adminConfig, specialUnlockTarget: Number(e.target.value) })}
                                        />
                                    </label>
                                    <label>奖池 JSON</label>
                                    <textarea
                                        className="input textarea"
                                        rows={6}
                                        value={adminConfigDrafts.prizePool}
                                        onChange={(e) => handleJsonUpdate('prizePool', e.target.value)}
                                    />
                                    {!adminJsonValidity.prizePool && <small className="small-tip error-tip">奖池 JSON 格式错误</small>}
                                    <label>日常任务 JSON</label>
                                    <textarea
                                        className="input textarea"
                                        rows={6}
                                        value={adminConfigDrafts.dailyTasks}
                                        onChange={(e) => handleJsonUpdate('dailyTasks', e.target.value)}
                                    />
                                    {!adminJsonValidity.dailyTasks && <small className="small-tip error-tip">日常任务 JSON 格式错误</small>}
                                    <label>特殊任务 JSON</label>
                                    <textarea
                                        className="input textarea"
                                        rows={6}
                                        value={adminConfigDrafts.specialTasks}
                                        onChange={(e) => handleJsonUpdate('specialTasks', e.target.value)}
                                    />
                                    {!adminJsonValidity.specialTasks && <small className="small-tip error-tip">特殊任务 JSON 格式错误</small>}
                                    <label>金币兑换 JSON</label>
                                    <textarea
                                        className="input textarea"
                                        rows={6}
                                        value={adminConfigDrafts.coinExchanges}
                                        onChange={(e) => handleJsonUpdate('coinExchanges', e.target.value)}
                                    />
                                    {!adminJsonValidity.coinExchanges && <small className="small-tip error-tip">金币兑换 JSON 格式错误</small>}
                                    <button className="btn primary" disabled={adminBusy || !canSaveAdminConfig} onClick={saveAdminConfig}>
                                        {adminBusy ? '保存中...' : '保存配置'}
                                    </button>
                                </div>

                                <hr className="divider" />
                                <h3>修改管理员密码</h3>
                                <div className="form-grid">
                                    <input
                                        className="input"
                                        type="password"
                                        placeholder="旧密码"
                                        value={adminPwdForm.oldPassword}
                                        onChange={(e) => setAdminPwdForm({ ...adminPwdForm, oldPassword: e.target.value })}
                                    />
                                    <input
                                        className="input"
                                        type="password"
                                        placeholder="新密码（至少4位）"
                                        value={adminPwdForm.newPassword}
                                        onChange={(e) => setAdminPwdForm({ ...adminPwdForm, newPassword: e.target.value })}
                                    />
                                    <button className="btn" disabled={adminBusy} onClick={changeAdminPwd}>
                                        {adminBusy ? '提交中...' : '修改密码'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn" onClick={() => setShowAdmin(false)}>
                                关闭
                            </button>
                        </div>
                    </AnimatedModal>
                )}
            </AnimatePresence>
        </div>
    )
}
