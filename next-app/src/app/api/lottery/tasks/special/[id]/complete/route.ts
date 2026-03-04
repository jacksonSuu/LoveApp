import { completeSpecialTask } from '@/lib/lottery'
import { apiJson } from '@/app/api/_shared/response'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const data = await completeSpecialTask(params.id, body)
    return apiJson(data)
}
