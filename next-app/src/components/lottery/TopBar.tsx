type TopBarProps = {
    theme: 'light' | 'dark'
    onToggleTheme: () => void
    onOpenTask: () => void
    onOpenAdmin: () => void
    remainingChances: number
    bonusChances: number
    maxTaskBonus: number
}

export function TopBar({
    theme,
    onToggleTheme,
    onOpenTask,
    onOpenAdmin,
    remainingChances,
    bonusChances,
    maxTaskBonus,
}: TopBarProps) {
    const themeLabel = theme === 'dark' ? '深色' : '浅色'

    return (
        <header className="top-bar">
            <div className="brand">🎀 恋爱抽奖站</div>
            <div className="top-right">
                <button className="icon-btn" onClick={onToggleTheme} title="切换主题" aria-label="切换主题">
                    {theme === 'dark' ? '🌙' : '☀️'}
                </button>
                <button className="icon-btn" onClick={onOpenTask} title="任务套餐" aria-label="打开任务套餐">
                    📦
                </button>
                <button className="icon-btn" onClick={onOpenAdmin} title="管理员面板" aria-label="打开管理员面板">
                    🛠️
                </button>
                <div className="chance-pill">
                    <span>{themeLabel}模式</span>
                    <strong>{remainingChances}</strong>
                    <small>
                        任务+{bonusChances}/{maxTaskBonus}
                    </small>
                </div>
            </div>
        </header>
    )
}
