"use client"

import { type DependencyList, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AnimatedModal } from '../components/lottery/AnimatedModal'
import { PrizePanel } from '../components/lottery/PrizePanel'
import { ReelPanel } from '../components/lottery/ReelPanel'
import { TaskSections } from '../components/lottery/TaskSections'
import { TopBar } from '../components/lottery/TopBar'
import type { LotteryState } from '../components/lottery/types'

type ApiResponse = {
    ok: boolean
    message?: string
    drawResults?: string[]
    state?: LotteryState
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

const fetchJson = async (url: string, options: RequestInit = {}, token = ''): Promise<ApiResponse> => {
    try {
        const headers: Record<string, string> = {}
        if (options.body !== undefined) headers['Content-Type'] = 'application/json'
        if (token) headers.Authorization = `Bearer ${token}`

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
    const [state, setState] = useState<LotteryState | null>(null)
    const [activeToast, setActiveToast] = useState<ToastItem | null>(null)
    const [toastQueue, setToastQueue] = useState<ToastItem[]>([])
    const [spinning, setSpinning] = useState(false)
    const [showTask, setShowTask] = useState(false)
    const [showResult, setShowResult] = useState(false)
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
    })
    const [adminForm, setAdminForm] = useState({ username: 'root', password: '' })
    const [adminPwdForm, setAdminPwdForm] = useState({ oldPassword: '', newPassword: '' })
    const [activeIndex, setActiveIndex] = useState(0)
    const [rolling, setRolling] = useState(false)
    const [theme, setTheme] = useState<'light' | 'dark'>('dark')
    const [dailySubmittingId, setDailySubmittingId] = useState<string | null>(null)
    const [specialSubmittingId, setSpecialSubmittingId] = useState<string | null>(null)
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
    const targetIndexRef = useRef(0)
    const drawSkipRequestedRef = useRef(false)
    const drawFinishRef = useRef<(() => void) | null>(null)

    const prizePool = state?.prizePool || []

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
    }
    const canSaveAdminConfig = adminJsonValidity.prizePool && adminJsonValidity.dailyTasks && adminJsonValidity.specialTasks

    const syncState = async () => {
        const data = await fetchJson('/api/lottery/state')
        if (!data.ok) {
            showHint(data.message || '加载失败', 'error')
            return
        }
        setState(data.state || null)
    }

    useAsyncEffect(syncState, [])

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
        const hasModal = showAdmin || showTask || showResult || showDrawOverlay
        document.body.style.overflow = hasModal ? 'hidden' : ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [showAdmin, showTask, showResult, showDrawOverlay])

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
        speedRef.current = 80
        settleStepsRef.current = null
        setRolling(true)

        const tick = () => {
            setActiveIndex((prev) => (len === 0 ? 0 : (prev + 1) % len))
            const stepsLeft = settleStepsRef.current
            if (stepsLeft !== null) {
                settleStepsRef.current = stepsLeft - 1
                speedRef.current = Math.min(240, speedRef.current + 8)
                if (settleStepsRef.current !== null && settleStepsRef.current <= 0) {
                    setActiveIndex(targetIndexRef.current % Math.max(len, 1))
                    setRolling(false)
                    if (onCompleteRef.current) {
                        onCompleteRef.current()
                        onCompleteRef.current = null
                    }
                    return
                }
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
        settleStepsRef.current = len * 2 + forward + 6
        speedRef.current = 120
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
        setRolling(false)
        const finish = drawFinishRef.current
        finish()
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
            setAdminConfigDrafts({ prizePool: '[]', dailyTasks: '[]', specialTasks: '[]' })
            return
        }
        setAdminConfig(data.config)
        setAdminConfigDrafts({
            prizePool: JSON.stringify(data.config?.prizePool ?? [], null, 2),
            dailyTasks: JSON.stringify(data.config?.dailyTasks ?? [], null, 2),
            specialTasks: JSON.stringify(data.config?.specialTasks ?? [], null, 2),
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
        try {
            prizePool = JSON.parse(adminConfigDrafts.prizePool || '[]')
            dailyTasks = JSON.parse(adminConfigDrafts.dailyTasks || '[]')
            specialTasks = JSON.parse(adminConfigDrafts.specialTasks || '[]')
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
        setAdminConfigDrafts({ prizePool: '[]', dailyTasks: '[]', specialTasks: '[]' })
        showHint('已退出管理员登录', 'info')
    }

    const handleJsonUpdate = (field: 'prizePool' | 'dailyTasks' | 'specialTasks', value: string) => {
        setAdminConfigDrafts((prev) => ({ ...prev, [field]: value }))
    }

    useEffect(() => {
        const onEsc = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            if (showAdmin) setShowAdmin(false)
            else if (showTask) setShowTask(false)
            else if (showResult) setShowResult(false)
        }
        window.addEventListener('keydown', onEsc)
        return () => window.removeEventListener('keydown', onEsc)
    }, [showAdmin, showTask, showResult])

    const adminLoggedIn = !!adminToken && !!adminConfig
    const remaining = state?.remainingChances ?? 0
    const taskBonusUsed = state?.bonusChances ?? 0
    const taskBonusMax = state?.maxTaskBonus ?? 0
    const taskBonusPercent = taskBonusMax > 0 ? Math.min(100, Math.round((taskBonusUsed / taskBonusMax) * 100)) : 0
    const specialProgress = Math.min(state?.dailyTaskCount ?? 0, state?.specialUnlockTarget ?? 0)
    const specialTarget = state?.specialUnlockTarget ?? 0
    const specialUnlocked = state?.specialUnlocked ?? false
    const canSingleDraw = !!state && remaining >= 1 && !spinning
    const canFiveDraw = !!state && remaining >= 5 && !spinning
    const historyItems = [...(state?.results ?? [])].reverse()
    const historyTotalPages = Math.max(1, Math.ceil(historyItems.length / HISTORY_PAGE_SIZE))
    const currentHistoryPage = Math.min(historyPage, historyTotalPages)
    const historyStart = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE
    const historyPageItems = historyItems.slice(historyStart, historyStart + HISTORY_PAGE_SIZE)
    const drawHelper = !state
        ? '正在同步抽奖数据...'
        : spinning
            ? '正在处理本次抽奖，请稍候...'
            : remaining <= 0
                ? '今日次数已用完，先完成任务再来吧'
                : `当前可用 ${remaining} 次，推荐先单抽试试手气`

    return (
        <div className="crystal-shell">
            <TopBar
                theme={theme}
                onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                onOpenTask={() => setShowTask(true)}
                onOpenAdmin={() => setShowAdmin(true)}
                remainingChances={state?.remainingChances ?? 0}
                bonusChances={state?.bonusChances ?? 0}
                maxTaskBonus={state?.maxTaskBonus ?? 0}
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
                                🔓
                            </span>
                            <span>特殊解锁</span>
                        </div>
                        <strong>
                            {specialProgress}/{specialTarget}
                        </strong>
                        <small>{specialUnlocked ? '已解锁' : '未解锁'}</small>
                    </article>
                </section>
                <PrizePanel prizePool={prizePool} />

                <div className="actions">
                    <button className="btn primary" disabled={!canSingleDraw} onClick={() => draw(1)}>
                        {spinning ? '抽奖中...' : '单抽'}
                    </button>
                    <button className="btn" disabled={!canFiveDraw} onClick={() => draw(5)}>
                        {spinning ? '处理中...' : '五连抽'}
                    </button>
                </div>


                {/* <p className="action-helper">{drawHelper}</p> */}

                <section className="history-panel" aria-label="抽奖记录">
                    <div className="history-head">
                        <h3>抽奖记录</h3>
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
            </main>

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
                            <button className="text-btn" onClick={() => setShowResult(false)}>
                                确认
                            </button>
                        </div>
                        <div className="result-list">
                            {resultList.map((t, i) => (
                                <div key={i} className={`result-item ${/(\[RARE\]|✨稀有✨)/.test(t) ? 'rare' : ''}`}>
                                    {t.replace('[RARE]', '✨稀有✨ ')}
                                </div>
                            ))}
                        </div>
                    </AnimatedModal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showTask && (
                    <AnimatedModal onClose={() => setShowTask(false)}>
                        <div className="modal-head">
                            <h2>任务套餐</h2>
                            <button className="text-btn" onClick={() => setShowTask(false)}>
                                关闭
                            </button>
                        </div>
                        <p className="sub-tip">完成任务可累计赠送抽奖次数（每日最多 +10 次）</p>
                        <TaskSections
                            state={state}
                            onCompleteDaily={completeDaily}
                            onCompleteSpecial={completeSpecial}
                            submittingDailyId={dailySubmittingId}
                            submittingSpecialId={specialSubmittingId}
                        />
                    </AnimatedModal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showAdmin && (
                    <AnimatedModal onClose={() => setShowAdmin(false)}>
                        <div className="modal-head">
                            <h2>管理员面板</h2>
                            <button className="text-btn" onClick={() => setShowAdmin(false)}>
                                关闭
                            </button>
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
                    </AnimatedModal>
                )}
            </AnimatePresence>
        </div>
    )
}
