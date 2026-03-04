import { NextRequest } from 'next/server'
import { draw } from '@/lib/lottery'
import { apiJson } from '@/app/api/_shared/response'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({})) as { times?: number }
    const times = Number(body.times ?? 1)
    const data = await draw(times)
    return apiJson(data)
}
