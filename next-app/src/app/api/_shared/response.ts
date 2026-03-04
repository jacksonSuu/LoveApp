import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/lottery'

export const dynamic = 'force-dynamic'

function statusFromApi(data: ApiResponse): number {
    if (data.ok) return 200
    const msg = String(data.message || '')

    if (/会话|未授权|重新登录|过期/.test(msg)) return 401
    if (/不存在/.test(msg)) return 404
    if (/已完成|已达上限|不足|尚未解锁|仅支持|格式|不正确|必须|错误/.test(msg)) return 400

    return 500
}

export function apiJson(data: ApiResponse) {
    return NextResponse.json(data, {
        status: statusFromApi(data),
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
        },
    })
}
