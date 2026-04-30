import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import {
  extractExtraInfoList,
  type IdeasoftExtraInfoDefinition,
  type IdeasoftProductExtraInfoRow,
} from '@/pages/ideasoft/IdeasoftProductExtraFieldsPage'
import { fetchAllIdeasoftAdminPagedList } from './ideasoft2-admin-paged-list'

export async function fetchExtraInfoLinksForProduct(
  productId: number
): Promise<IdeasoftProductExtraInfoRow[]> {
  return fetchAllIdeasoftAdminPagedList<IdeasoftProductExtraInfoRow>(
    'extra_info_to_products',
    extractExtraInfoList,
    'ProductExtraInfo alınamadı',
    productId
  )
}

export async function deleteExtraInfoLinkRow(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products/${id}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const data = await parseJsonResponse<{ error?: string; hint?: string }>(res).catch(() => ({}))
    throw new Error(formatIdeasoftProxyErrorForUi(data) || `HTTP ${res.status}`)
  }
}

/** Kayıt varsa PUT yoksa POST (ürün GET ile product gövdesi doldurulur) */
export async function upsertExtraInfoForProduct(
  productId: number,
  def: IdeasoftExtraInfoDefinition,
  value: string
): Promise<void> {
  const rows = await fetchExtraInfoLinksForProduct(productId)
  const match = rows.find((r) => (r.extraInfo?.id ?? 0) === def.id)

  if (match) {
    const body: Record<string, unknown> = {
      ...match,
      value,
      extraInfo: { id: def.id, name: def.name, sortOrder: def.sortOrder },
    }
    const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products/${match.id}`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await parseJsonResponse<unknown>(res)
    if (!res.ok) {
      throw new Error(
        formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || `PUT #${match.id} başarısız`
      )
    }
    return
  }

  const pres = await fetch(`${API_URL}/api/ideasoft/admin-api/products/${productId}`)
  const pdata = await parseJsonResponse<unknown>(pres)
  if (!pres.ok) {
    throw new Error(
      formatIdeasoftProxyErrorForUi(pdata as { error?: string; hint?: string }) || 'Ürün GET başarısız'
    )
  }
  if (!pdata || typeof pdata !== 'object') {
    throw new Error('Geçersiz ürün yanıtı')
  }
  const postBody = {
    id: 0,
    value,
    extraInfo: { id: def.id, name: def.name, sortOrder: def.sortOrder },
    product: pdata as Record<string, unknown>,
  }
  const res = await fetch(`${API_URL}/api/ideasoft/admin-api/extra_info_to_products`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(postBody),
  })
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) {
    throw new Error(
      formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'POST başarısız'
    )
  }
}
