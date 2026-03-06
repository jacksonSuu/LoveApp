type TopBarProps = {
    theme: 'light' | 'dark'
    onToggleTheme: () => void
    onOpenTask: () => void
    onOpenContract: () => void
    onOpenAdmin: () => void
    remainingChances: number
    bonusChances: number
    maxTaskBonus: number
    contractBound: boolean
}

export function TopBar({
    theme,
    onToggleTheme,
    onOpenTask,
    onOpenContract,
    onOpenAdmin,
    remainingChances,
    bonusChances,
    maxTaskBonus,
    contractBound,
}: TopBarProps) {
    const themeLabel = theme === 'dark' ? '深色' : '浅色'

    return (
        <header className="top-bar">
            <div className="brand">🎀 缘</div>
            <div className="top-right">
                <button className="icon-btn" onClick={onToggleTheme} title="切换主题" aria-label="切换主题">
                    {theme === 'dark' ? '🌙' : '☀️'}
                </button>
                <button className="icon-btn" onClick={onOpenTask} title="任务套餐" aria-label="打开任务套餐">
                    📦
                </button>
                <button className="icon-btn" onClick={onOpenContract} title="契约绑定" aria-label="打开契约绑定">
                    🤝
                </button>
                <button className="icon-btn" onClick={onOpenAdmin} title="管理员面板" aria-label="打开管理员面板">
                    🛠️
                </button>
                <div className="chance-pill">
                    <span>{themeLabel}模式 · {contractBound ? '已契约' : '未契约'}</span>
                    <strong>{remainingChances}</strong>
                    <small>
                        任务+{bonusChances}/{maxTaskBonus}
                    </small>
                </div>
            </div>
        </header>
    )
}
