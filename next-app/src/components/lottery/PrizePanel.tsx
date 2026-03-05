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
    const scrollPosRef = useRef(0)

    const imageByName: Record<string, string> = {
        小心心泡泡: '/prize-name-only/01_心心泡泡.png',
        心心泡泡: '/prize-name-only/01_心心泡泡.png',
        告白糖糖: '/prize-name-only/02_心心糖果.png',
        心心糖果: '/prize-name-only/02_心心糖果.png',
        蜜蜜零食包: '/prize-name-only/03_心心零食.png',
        心心零食: '/prize-name-only/03_心心零食.png',
        心心红包: '/prize-name-only/04_心心红包.png',
        暖暖暴击: '/prize-name-only/05_心心惊喜.png',
        小神秘心愿盒: '/prize-name-only/06_心心礼盒.png',
        心愿盒: '/prize-name-only/06_心心礼盒.png',
        心心礼盒: '/prize-name-only/06_心心礼盒.png',
        梦梦宝箱: '/prize-name-only/07_心心宝箱.png',
        心心宝箱: '/prize-name-only/07_心心宝箱.png',
        金币: '/prize-name-only/08_金币.png',
    }

    const items = prizePool.length ? prizePool : [{ name: '暂无奖品', weight: 0, rare: false }]
    const infiniteItems = [...items, ...items]

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        let resizeObserver: ResizeObserver | null = null

        const normalizeScroll = () => {
            const loopWidth = viewport.scrollWidth / 2
            if (!Number.isFinite(loopWidth) || loopWidth <= 0) return

            if (scrollPosRef.current >= loopWidth || scrollPosRef.current < 0) {
                scrollPosRef.current = ((scrollPosRef.current % loopWidth) + loopWidth) % loopWidth
            }

            viewport.scrollLeft = scrollPosRef.current
        }

        const resetScroll = () => {
            const loopWidth = viewport.scrollWidth / 2
            if (!Number.isFinite(loopWidth) || loopWidth <= 0) return
            scrollPosRef.current = loopWidth
            normalizeScroll()
        }

        const touchPause = () => {
            pauseUntilRef.current = Date.now() + 1400
        }

        const onScroll = () => {
            scrollPosRef.current = viewport.scrollLeft
            normalizeScroll()
        }

        const onPointerDown = () => touchPause()
        const onPointerUp = () => {
            pauseUntilRef.current = Date.now() + 900
        }
        const onWheel = () => touchPause()

        const animate = (now: number) => {
            const dt = lastTimeRef.current ? now - lastTimeRef.current : 16
            lastTimeRef.current = now
            const isPaused = Date.now() < pauseUntilRef.current

            const canLoop = viewport.scrollWidth > viewport.clientWidth + 1
            if (!isPaused && canLoop) {
                scrollPosRef.current += (dt / 1000) * 28
                normalizeScroll()
            }
            rafRef.current = requestAnimationFrame(animate)
        }

        resetScroll()

        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                resetScroll()
            })
            resizeObserver.observe(viewport)
        }

        lastTimeRef.current = 0
        rafRef.current = requestAnimationFrame(animate)

        viewport.addEventListener('scroll', onScroll, { passive: true })
        viewport.addEventListener('pointerdown', onPointerDown)
        viewport.addEventListener('pointerup', onPointerUp)
        viewport.addEventListener('wheel', onWheel, { passive: true })

        return () => {
            viewport.removeEventListener('scroll', onScroll)
            viewport.removeEventListener('pointerdown', onPointerDown)
            viewport.removeEventListener('pointerup', onPointerUp)
            viewport.removeEventListener('wheel', onWheel)
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            if (resizeObserver) resizeObserver.disconnect()
            rafRef.current = null
        }
    }, [prizePool])

    const resolveImage = (name: string) => {
        if (imageByName[name]) return imageByName[name]
        if (name.includes('金币')) return '/prize-name-only/08_金币.png'
        if (name.includes('宝箱')) return '/prize-name-only/07_心心宝箱.png'
        if (name.includes('礼盒') || name.includes('心愿')) return '/prize-name-only/06_心心礼盒.png'
        if (name.includes('惊喜') || name.includes('暴击')) return '/prize-name-only/05_心心惊喜.png'
        if (name.includes('红包')) return '/prize-name-only/04_心心红包.png'
        if (name.includes('零食')) return '/prize-name-only/03_心心零食.png'
        if (name.includes('糖')) return '/prize-name-only/02_心心糖果.png'
        return '/prize-name-only/01_心心泡泡.png'
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
                            <img
                                src={resolveImage(p.name)}
                                alt={p.name}
                                loading="lazy"
                                className={p.name.includes('金币') ? 'is-coin' : undefined}
                            />
                        </article>
                    ))}
                </div>
            </div>
        </section>
    )
}
