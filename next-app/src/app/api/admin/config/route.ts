import { NextRequest } from 'next/server'
import { extractToken, getAdminConfig, updateAdminConfig } from '@/lib/lottery'
import { apiJson } from '@/app/api/_shared/response'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const token = extractToken(req.headers.get('authorization'))
    const data = await getAdminConfig(token)
    return apiJson(data)
}

export async function PUT(req: NextRequest) {
    const token = extractToken(req.headers.get('authorization'))
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const data = await updateAdminConfig(token, body)
    return apiJson(data)
}
