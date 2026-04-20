import { API_URL, parseJsonResponse } from '@/lib/api'

export type TrendyolCategoryTreeNode = {
  id: number
  name: string
  subCategories?: TrendyolCategoryTreeNode[]
}

export type TrendyolCategoryFlatRow = {
  id: number
  name: string
  parentId: number | null
}

export async function fetchTrendyolCategories(): Promise<{
  tree: TrendyolCategoryTreeNode[]
  flat: TrendyolCategoryFlatRow[]
}> {
  const res = await fetch(`${API_URL}/api/trendyol/categories`)
  const data = await parseJsonResponse<{
    tree?: TrendyolCategoryTreeNode[]
    flat?: TrendyolCategoryFlatRow[]
    error?: string
  }>(res)
  if (!res.ok) throw new Error(data.error || 'Kategoriler alınamadı')
  return {
    tree: Array.isArray(data.tree) ? data.tree : [],
    flat: Array.isArray(data.flat) ? data.flat : [],
  }
}

export type TrendyolCreateBody = {
  product_id: number
  image_origin: string
  trendyol_category_id: number
  trendyol_brand_id: number
  cargo_company_id: number
  dimensional_weight: number
  attributes: { attributeId: number; attributeValueId?: number; customAttributeValue?: string }[]
  product_main_id: string
  barcode: string
  stock_code: string
  title: string
  description: string
  sale_price: number
  list_price?: number
  shipment_address_id?: number
  returning_address_id?: number
}

export async function submitTrendyolProductCreate(body: TrendyolCreateBody): Promise<{ ok?: boolean; message?: string }> {
  const res = await fetch(`${API_URL}/api/trendyol/products/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await parseJsonResponse<{
    ok?: boolean
    message?: string
    error?: string
    detail?: string
    parsed?: unknown
  }>(res)
  if (!res.ok) {
    const extra = data.detail ? ` ${data.detail.slice(0, 400)}` : ''
    throw new Error((data.error || 'İstek başarısız') + extra)
  }
  return data
}
