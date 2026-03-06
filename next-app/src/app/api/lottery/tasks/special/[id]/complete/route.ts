import { NextRequest } from 'next/server'
import { completeSpecialTask } from '@/lib/lottery'
import { apiJson } from '@/app/api/_shared/response'
import { extractUserId } from '@/app/api/_shared/user'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    const userId = extractUserId(req)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const data = await completeSpecialTask(params.id, userId, body)
    return apiJson(data)
}
