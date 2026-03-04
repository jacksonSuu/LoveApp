import { NextRequest } from 'next/server'
import { changeAdminPassword, extractToken } from '@/lib/lottery'
import { apiJson } from '@/app/api/_shared/response'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const token = extractToken(req.headers.get('authorization'))
    const body = await req.json().catch(() => ({})) as { oldPassword?: string; newPassword?: string }
    const data = await changeAdminPassword(token, String(body.oldPassword || ''), String(body.newPassword || ''))
    return apiJson(data)
}
