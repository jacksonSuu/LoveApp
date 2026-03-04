"use client"

import { useEffect, useRef } from 'react'
import type { Prize } from './types'

type PrizePanelProps = {
    prizePool: Prize[]
    onOpenBackpack?: () => void
}

export function PrizePanel({ prizePool, onOpenBackpack }: PrizePanelProps) {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const rafRef = useRef<number | null>(null)
    const lastTimeRef = useRef(0)
    const pauseUntilRef = useRef(0)

    const imageByName: Record<string, string> = {
        小心心泡泡: '/prize-name-only/xiaoxinxin-paopao.svg',
        告白糖糖: '/prize-name-only/gaobai-tangtang.svg',
        蜜蜜零食包: '/prize-name-only/mimi-lingshibao.svg',
        心心红包: '/prize-name-only/xinxin-hongbao.svg',
        小神秘心愿盒: '/prize-name-only/xinyuan-he.svg',
        心愿盒: '/prize-name-only/xinyuan-he.svg',
        梦梦宝箱: '/prize-name-only/mengmeng-baoxiang.svg',
        金币: '/prize-name-only/jinbi.svg',
    }

    const items = prizePool.length ? prizePool : [{ name: '暂无奖品', weight: 0, rare: false }]
    const infiniteItems = [...items, ...items]

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const normalizeScroll = () => {
            const loopWidth = viewport.scrollWidth / 2
            if (!Number.isFinite(loopWidth) || loopWidth <= 0) return
            if (viewport.scrollLeft >= loopWidth) {
                viewport.scrollLeft -= loopWidth
            } else if (viewport.scrollLeft <= 0) {
                viewport.scrollLeft += loopWidth
            }
        }

        const touchPause = () => {
            pauseUntilRef.current = Date.now() + 1400
        }

        const onScroll = () => {
            normalizeScroll()
            touchPause()
        }

        const onPointerDown = () => touchPause()
        const onPointerUp = () => {
            pauseUntilRef.current = Date.now() + 900
        }
        const onMouseEnter = () => {
            pauseUntilRef.current = Date.now() + 10_000
        }
        const onMouseLeave = () => {
            pauseUntilRef.current = Date.now() + 400
        }

        const animate = (now: number) => {
            const dt = lastTimeRef.current ? now - lastTimeRef.current : 16
            lastTimeRef.current = now
            const isPaused = Date.now() < pauseUntilRef.current
            if (!isPaused) {
                viewport.scrollLeft += (dt / 1000) * 28
                normalizeScroll()
            }
            rafRef.current = requestAnimationFrame(animate)
        }

        viewport.scrollLeft = Math.max(0, viewport.scrollWidth / 2)
        lastTimeRef.current = 0
        rafRef.current = requestAnimationFrame(animate)

        viewport.addEventListener('scroll', onScroll, { passive: true })
        viewport.addEventListener('pointerdown', onPointerDown)
        viewport.addEventListener('pointerup', onPointerUp)
        viewport.addEventListener('mouseenter', onMouseEnter)
        viewport.addEventListener('mouseleave', onMouseLeave)

        return () => {
            viewport.removeEventListener('scroll', onScroll)
            viewport.removeEventListener('pointerdown', onPointerDown)
            viewport.removeEventListener('pointerup', onPointerUp)
            viewport.removeEventListener('mouseenter', onMouseEnter)
            viewport.removeEventListener('mouseleave', onMouseLeave)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [prizePool])

    const resolveImage = (name: string) => {
        if (imageByName[name]) return imageByName[name]
        if (name.includes('心愿')) return '/prize-name-only/xinyuan-he.svg'
        if (name.includes('金币')) return '/prize-name-only/jinbi.svg'
        return '/prize-name-only/xiaoxinxin-paopao.svg'
    }

    return (
        <section className="prize-panel">
            <div className="panel-head">
                <h3 className="panel-title">
                    <svg
                        className="panel-title-heart"
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    <span>心动奖品池</span>
                </h3>
                <button type="button" className="text-btn" onClick={onOpenBackpack}>
                    我的背包
                </button>

            </div>
            <div className="prize-slider-viewport" aria-label="奖品滑动展示" ref={viewportRef}>
                <div className="prize-slider-track">
                    {infiniteItems.map((p, idx) => (
                        <article key={`${p.name}-${idx}`} className={`prize-slide-card ${p.rare ? 'rare' : ''}`}>
                            <img src={resolveImage(p.name)} alt={p.name} loading="lazy" />
                            <div className="prize-slide-name">{p.name}</div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    )
}
