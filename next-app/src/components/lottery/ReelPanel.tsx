import type { Prize } from './types'

type ReelPanelProps = {
    rolling: boolean
    activeIndex: number
    prizePool: Prize[]
}

export function ReelPanel({ rolling, activeIndex, prizePool }: ReelPanelProps) {
    return (
        <div className="reel">
            <div className="reel-header">
                <span>{rolling ? '甜蜜加载中...' : '启动心动核心，抽取今日好运'}</span>
            </div>
            <div className={`reel-window ${rolling ? 'reel-rolling' : ''}`}>
                <div className="energy-layer" aria-hidden />
                <div className="reel-strip">
                    {(prizePool.length ? prizePool : [{ name: '暂无奖品', weight: 0, rare: false }]).map((p, idx) => (
                        <div key={p.name + idx} className={`reel-item ${idx === activeIndex ? 'active' : ''} ${p.rare ? 'rare' : ''}`}>
                            <div className="reel-name">{p.name}</div>
                        </div>
                    ))}
                </div>
                <div className={`reel-pointer ${rolling ? 'is-rolling' : ''}`} aria-hidden>
                    <div className="reel-pointer-tip" />
                </div>
            </div>
        </div>
    )
}
