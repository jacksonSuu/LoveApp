import type { LotteryState } from './types'

type TaskSectionsProps = {
    state: LotteryState | null
    onCompleteDaily: (id: string) => void
    onCompleteSpecial: (id: string) => void
    submittingDailyId: string | null
    submittingSpecialId: string | null
}

export function TaskSections({ state, onCompleteDaily, onCompleteSpecial, submittingDailyId, submittingSpecialId }: TaskSectionsProps) {
    return (
        <>
            <section className="task-section">
                <div className="panel-head">
                    <h3>日常套餐</h3>
                    <span className="small-tip">当前仅开放：签到任务、抽奖任务</span>
                </div>
                <ul className="task-list">
                    {state?.dailyTasks.map((t) => {
                        const canDo = t.doneTimes < t.maxTimes
                        const submitting = submittingDailyId === t.id
                        const actionLabel = t.mode === 'checkin' ? '签到确认' : t.mode === 'draw' ? '完成抽奖任务' : '提交审核'
                        return (
                            <li key={t.id} className="task-item">
                                <div className="task-meta">
                                    <strong>{t.title}</strong>
                                    <span>
                                        奖励 +{t.reward} （{t.doneTimes}/{t.maxTimes}）
                                        {t.mode === 'checkin' ? ' · 签到任务' : t.mode === 'draw' ? ' · 需先完成抽奖' : ' · 需审核/条件判断'}
                                    </span>
                                </div>
                                <button className="btn" disabled={!canDo || submitting} onClick={() => onCompleteDaily(t.id)}>
                                    {submitting ? '提交中...' : canDo ? actionLabel : '已满'}
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </section>

            <section className="task-section">
                <div className="panel-head">
                    <h3>契约任务</h3>
                    <span className="small-tip">
                        {state?.contractBound ? '✅ 已解锁（已绑定契约）' : '🔒 锁定中（请先完成契约绑定）'}
                    </span>
                </div>
                <ul className="task-list">
                    {state?.specialTasks.map((t) => {
                        const canDo = (state?.contractBound ?? false) && !t.done
                        const submitting = submittingSpecialId === t.id
                        const actionLabel = t.mode === 'checkin' ? '签到确认' : t.mode === 'draw' ? '完成抽奖任务' : '提交审核'
                        return (
                            <li key={t.id} className="task-item">
                                <div className="task-meta">
                                    <strong>{t.title}</strong>
                                    <span>
                                        奖励 +{t.reward}（契约）
                                        {t.mode === 'checkin' ? ' · 签到任务' : t.mode === 'draw' ? ' · 需先完成抽奖' : ' · 需审核/条件判断'}
                                    </span>
                                </div>
                                <button className="btn" disabled={!canDo || submitting} onClick={() => onCompleteSpecial(t.id)}>
                                    {submitting ? '提交中...' : state?.contractBound ? (t.done ? '已完成' : actionLabel) : '锁定中'}
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </section>
        </>
    )
}
