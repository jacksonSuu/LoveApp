import { getPublicState } from '@/lib/lottery'
import { apiJson } from '@/app/api/_shared/response'

export const dynamic = 'force-dynamic'

export async function GET() {
    const data = await getPublicState()
    return apiJson(data)
}
