import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/lottery'

export const dynamic = 'force-dynamic'

type ErrorLogItem = {
    time: string
    path?: string
    message: string
    stack?: string
}

export const logs: { error: ErrorLogItem[] } = {
    error: [],
}

function noStoreHeaders() {
    return {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
    }
}

function pushErrorLog(item: ErrorLogItem) {
    logs.error.push(item)
    if (logs.error.length > 500) {
        logs.error.splice(0, logs.error.length - 500)
    }
}

function normalizeError(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
        return {
            message: error.message || '服务器内部错误',
            stack: error.stack,
        }
    }
    return {
        message: typeof error === 'string' ? error : '服务器内部错误',
    }
}

export function logApiError(error: unknown, path?: string) {
    const parsed = normalizeError(error)
    const item: ErrorLogItem = {
        time: new Date().toISOString(),
        path,
        message: parsed.message,
        stack: parsed.stack,
    }
    pushErrorLog(item)
    console.error('[API ERROR]', item)
    return item
}

function statusFromApi(data: ApiResponse): number {
    if (data.ok) return 200
    const msg = String(data.message || '')

    if (/会话|未授权|重新登录|过期/.test(msg)) return 401
    if (/不存在/.test(msg)) return 404
    if (/已完成|已达上限|不足|尚未解锁|仅支持|格式|不正确|必须|错误/.test(msg)) return 400

    return 500
}

export function apiJson(data: ApiResponse) {
    const status = statusFromApi(data)
    if (!data.ok && status >= 500) {
        logApiError(data.message || '接口返回服务端错误')
    }
    return NextResponse.json(data, {
        status,
        headers: noStoreHeaders(),
    })
}

export function apiError(error: unknown, path?: string) {
    const item = logApiError(error, path)
    return NextResponse.json(
        {
            ok: false,
            message: item.message || '服务器内部错误',
        },
        {
            status: 500,
            headers: noStoreHeaders(),
        },
    )
}
