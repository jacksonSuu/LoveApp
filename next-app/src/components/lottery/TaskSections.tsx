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
                    <span className="small-tip">完成领次数（最多 +10）</span>
                </div>
                <ul className="task-list">
                    {state?.dailyTasks.map((t) => {
                        const canDo = t.doneTimes < t.maxTimes
                        const submitting = submittingDailyId === t.id
                        const actionLabel = t.mode === 'checkin' ? '签到确认' : '提交审核'
                        return (
                            <li key={t.id} className="task-item">
                                <div className="task-meta">
                                    <strong>{t.title}</strong>
                                    <span>
                                        奖励 +{t.reward} （{t.doneTimes}/{t.maxTimes}）{t.mode === 'checkin' ? ' · 签到任务' : ' · 需审核/条件判断'}
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
                    <h3>特殊套餐</h3>
                    <span className="small-tip">
                        {state?.specialUnlocked ? '✅ 已解锁' : `🔒 需累计完成 ${state?.specialUnlockTarget ?? 0} 次日常任务`}
                    </span>
                </div>
                <ul className="task-list">
                    {state?.specialTasks.map((t) => {
                        const canDo = (state?.specialUnlocked ?? false) && !t.done
                        const submitting = submittingSpecialId === t.id
                        const actionLabel = t.mode === 'checkin' ? '签到确认' : '提交审核'
                        return (
                            <li key={t.id} className="task-item">
                                <div className="task-meta">
                                    <strong>{t.title}</strong>
                                    <span>奖励 +{t.reward}（特殊）{t.mode === 'checkin' ? ' · 签到任务' : ' · 需审核/条件判断'}</span>
                                </div>
                                <button className="btn" disabled={!canDo || submitting} onClick={() => onCompleteSpecial(t.id)}>
                                    {submitting ? '提交中...' : state?.specialUnlocked ? (t.done ? '已完成' : actionLabel) : '未解锁'}
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </section>
        </>
    )
}
