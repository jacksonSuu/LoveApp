import type { Prize } from './types'

type PrizePanelProps = {
    prizePool: Prize[]
}

export function PrizePanel({ prizePool }: PrizePanelProps) {
    return (
        <section className="prize-panel">
            <div className="panel-head">
                <h3>心动奖品池</h3>
            </div>
            <div className="prize-grid">
                {prizePool.map((p) => (
                    <div key={p.name} className={`prize-card ${p.rare ? 'rare' : ''}`}>
                        <div className="prize-name">{p.name}</div>
                        <div className="prize-meta">概率 {p.weight}%</div>
                    </div>
                ))}
            </div>
        </section>
    )
}
