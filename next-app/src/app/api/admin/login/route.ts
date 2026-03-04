import { NextRequest } from 'next/server'
import { adminLogin } from '@/lib/lottery'
import { apiJson } from '@/app/api/_shared/response'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({})) as { username?: string; password?: string }
    const data = await adminLogin(String(body.username || ''), String(body.password || ''))
    return apiJson(data)
}
