import { NextRequest } from 'next/server'
import { adminLogout, extractToken } from '@/lib/lottery'
import { apiJson } from '@/app/api/_shared/response'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const token = extractToken(req.headers.get('authorization'))
    const data = await adminLogout(token)
    return apiJson(data)
}
