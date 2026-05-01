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

export type TrendyolBrandRow = {
  id: number
  name: string
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

export async function fetchTrendyolBrands(query: string): Promise<TrendyolBrandRow[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const res = await fetch(`${API_URL}/api/trendyol/brands?name=${encodeURIComponent(q)}`)
  const data = await parseJsonResponse<{
    brands?: TrendyolBrandRow[]
    error?: string
    detail?: string
  }>(res)
  if (!res.ok) throw new Error(data.error || 'Markalar alınamadı')
  return Array.isArray(data.brands) ? data.brands : []
}

export async function fetchTrendyolProductFilterOptions(): Promise<{
  brands: TrendyolBrandRow[]
  categories: TrendyolCategoryFlatRow[]
}> {
  const res = await fetch(`${API_URL}/api/trendyol/product-filter-options`)
  const data = await parseJsonResponse<{
    brands?: TrendyolBrandRow[]
    categories?: TrendyolCategoryFlatRow[]
    error?: string
  }>(res)
  if (!res.ok) throw new Error(data.error || 'Trendyol ürün filtre seçenekleri alınamadı')
  return {
    brands: Array.isArray(data.brands) ? data.brands : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
  }
}

export async function linkTrendyolProductToMaster(
  masterProductId: number,
  trendyolProductId: string | number,
  trendyolCategoryId?: string | number | null,
  trendyolBrandId?: string | number | null
): Promise<void> {
  const res = await fetch(`${API_URL}/api/trendyol/products/link-master`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      master_product_id: masterProductId,
      trendyol_product_id: trendyolProductId,
      trendyol_category_id: trendyolCategoryId ?? null,
      trendyol_brand_id: trendyolBrandId ?? null,
    }),
  })
  const data = await parseJsonResponse<{ error?: string }>(res)
  if (!res.ok) throw new Error(data.error || 'Eşleştirme kaydedilemedi')
}

export async function linkTrendyolBrandToMaster(
  masterBrandId: number,
  trendyolBrandId: string | number
): Promise<void> {
  const res = await fetch(`${API_URL}/api/trendyol/brands/link-master`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      master_brand_id: masterBrandId,
      trendyol_brand_id: trendyolBrandId,
    }),
  })
  const data = await parseJsonResponse<{ error?: string }>(res)
  if (!res.ok) throw new Error(data.error || 'Marka eşleştirme kaydedilemedi')
}

export async function linkTrendyolCategoryToMaster(
  masterCategoryId: number,
  trendyolCategoryId: string | number
): Promise<void> {
  const res = await fetch(`${API_URL}/api/trendyol/categories/link-master`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      master_category_id: masterCategoryId,
      trendyol_category_id: trendyolCategoryId,
    }),
  })
  const data = await parseJsonResponse<{ error?: string }>(res)
  if (!res.ok) throw new Error(data.error || 'Kategori eşleştirme kaydedilemedi')
}

export type TrendyolPriceOption = {
  key: string
  label: string
  price: number
  currency_id?: number | null
  currency_code?: string | null
  currency_symbol?: string | null
  exchange_rate_to_try: number
  try_price: number
  status?: number | null
}

export async function fetchTrendyolMasterPriceOptions(masterProductId: number): Promise<{
  product?: { id: number; name: string; quantity?: number | null }
  options: TrendyolPriceOption[]
}> {
  const res = await fetch(`${API_URL}/api/trendyol/products/${masterProductId}/price-options`)
  const data = await parseJsonResponse<{
    product?: { id: number; name: string; quantity?: number | null }
    options?: TrendyolPriceOption[]
    error?: string
  }>(res)
  if (!res.ok) throw new Error(data.error || 'Fiyat seçenekleri alınamadı')
  return {
    product: data.product,
    options: Array.isArray(data.options) ? data.options : [],
  }
}

export async function updateTrendyolPriceStock(body: {
  barcode: string
  quantity: number
  sale_price: number
  list_price?: number
}): Promise<void> {
  const res = await fetch(`${API_URL}/api/trendyol/products/update-price-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await parseJsonResponse<{ error?: string; detail?: string }>(res)
  if (!res.ok) throw new Error(data.detail ? `${data.error || 'Güncelleme başarısız'} ${data.detail}` : data.error || 'Güncelleme başarısız')
}

export type TrendyolLinkedProduct = {
  id: string
  trendyol_product_id: string
  name: string
  title?: string | null
  barcode?: string | null
  sku?: string | null
  stockCode?: string | null
  salePrice?: number | null
  listPrice?: number | null
  quantity?: number | null
  deliveryDuration?: number | null
  currency_symbol?: string | null
}

export async function fetchTrendyolLinkedProducts(masterProductId: number): Promise<{
  product?: { id: number; name: string; sku?: string | null; barcode?: string | null }
  data: TrendyolLinkedProduct[]
}> {
  const res = await fetch(`${API_URL}/api/trendyol/master-products/${masterProductId}/linked-products`)
  const data = await parseJsonResponse<{
    product?: { id: number; name: string; sku?: string | null; barcode?: string | null }
    data?: TrendyolLinkedProduct[]
    error?: string
  }>(res)
  if (!res.ok) throw new Error(data.error || 'Bağlı Trendyol ürünleri alınamadı')
  return {
    product: data.product,
    data: Array.isArray(data.data) ? data.data : [],
  }
}

export async function updateTrendyolPriceStockBulk(
  items: {
    barcode: string
    quantity: number
    sale_price: number
    list_price?: number
  }[]
): Promise<void> {
  const res = await fetch(`${API_URL}/api/trendyol/products/update-price-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  const data = await parseJsonResponse<{ error?: string; detail?: string }>(res)
  if (!res.ok) throw new Error(data.detail ? `${data.error || 'Güncelleme başarısız'} ${data.detail}` : data.error || 'Güncelleme başarısız')
}

export async function deleteTrendyolProduct(barcode: string): Promise<{ batchRequestId?: string; raw?: unknown }> {
  const res = await fetch(`${API_URL}/api/trendyol/products/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode }),
  })
  const data = await parseJsonResponse<{
    batchRequestId?: string
    raw?: unknown
    error?: string
    detail?: string
  }>(res)
  if (!res.ok) throw new Error(data.detail ? `${data.error || 'Silme başarısız'} ${data.detail}` : data.error || 'Silme başarısız')
  return data
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
