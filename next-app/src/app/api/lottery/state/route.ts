import { NextRequest } from 'next/server'
import { getPublicState } from '@/lib/lottery'
import { apiJson } from '@/app/api/_shared/response'
import { extractUserId } from '@/app/api/_shared/user'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const userId = extractUserId(req)
    const data = await getPublicState(userId)
    return apiJson(data)
}
