import { API_URL, parseJsonResponse } from '@/lib/api'

const PROXY_BASE = `${API_URL}/api/opencart-proxy`

/** OpenCart REST API'ye proxy üzerinden istek atar */
async function opencartFetch<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown; searchParams?: Record<string, string> }
): Promise<T> {
  const { method = 'GET', body, searchParams } = options ?? {}
  let url = `${PROXY_BASE}/${path}`
  if (searchParams && Object.keys(searchParams).length > 0) {
    url += '?' + new URLSearchParams(searchParams).toString()
  }
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data: unknown
  try {
    data = await parseJsonResponse<unknown>(res)
  } catch (parseErr) {
    if (res.status === 404) {
      throw new Error('OpenCart API proxy bulunamadı (404). API deploy edilmemiş veya güncel değil olabilir.')
    }
    throw parseErr
  }
  if (!res.ok) {
    const d = data as { error?: string | string[]; hint?: string; message?: string; debug_tried?: string[] }
    const errVal = d.error
    const hint = d.hint ? ` ${d.hint}` : ''
    const tried = d.debug_tried?.length ? ` | Denenenler: ${d.debug_tried.join(' → ')}` : ''
    const err = (Array.isArray(errVal) ? errVal.join(', ') : errVal || d.message || res.statusText || 'OpenCart hatası') + hint + tried
    throw new Error(`[${res.status}] ${err}`)
  }
  // api_rest_admin: { success: 0, error: [...], data: [] } - HTTP 200 ile gelebilir
  const d = data as { success?: number; error?: string | string[]; data?: unknown }
  if (d && typeof d === 'object' && d.success === 0) {
    const errVal = d.error
    const err = Array.isArray(errVal) ? errVal.join(', ') : errVal || 'OpenCart API hatası'
    throw new Error(err)
  }
  return data as T
}

// ---------- Products ----------
/** OpenCart oc_product tablosu - ürün adı product_description[language_id].name içinde tutulur */
export type ProductDescriptionByLang = Record<string | number, { name?: string; description?: string; meta_title?: string; meta_description?: string; meta_keyword?: string }>

export interface OpenCartProduct {
  product_id?: number
  feed_product_id?: number
  import_id?: number
  import_active_product?: number
  model?: string
  sku?: string
  upc?: string
  ean?: string
  jan?: string
  isbn?: string
  mpn?: string
  location?: string
  quantity?: number
  stock_status_id?: number
  image?: string
  manufacturer_id?: number
  shipping?: number
  price?: number
  points?: number
  tax_class_id?: number
  date_available?: string
  weight?: number
  weight_class_id?: number
  length?: number
  width?: number
  height?: number
  length_class_id?: number
  subtract?: number
  minimum?: number
  sort_order?: number
  status?: number
  viewed?: number
  date_added?: string
  date_modified?: string
  meta_robots?: string
  seo_canonical?: string
  import_batch?: string
  /** API yanıtında join edilir; oc_product_description */
  product_description?: ProductDescriptionByLang
  /** Düzleştirilmiş API yanıtları için (bazı eklentiler name döndürebilir) */
  name?: string
}

export async function fetchOpenCartProducts(params?: {
  page?: number
  limit?: number
  search?: string
}): Promise<{ products?: OpenCartProduct[]; [k: string]: unknown }> {
  const searchParams: Record<string, string> = {}
  if (params?.page) searchParams.page = String(params.page)
  if (params?.limit) searchParams.limit = String(params.limit)
  if (params?.search) searchParams.search = params.search
  return opencartFetch('product_admin/products', { searchParams })
}

/** Ürün adını product_description veya name alanından alır */
export function getOpenCartProductName(p: OpenCartProduct): string {
  if (p.name) return p.name
  const pd = p.product_description
  if (!pd || typeof pd !== 'object') return ''
  const first = Object.values(pd)[0]
  return (first && typeof first === 'object' && first.name) ? first.name : ''
}

// ---------- Categories ----------
export interface OpenCartCategory {
  category_id?: number
  image?: string
  parent_id?: number
  top?: number
  column?: number
  sort_order?: number
  status?: number
  date_added?: string
  date_modified?: string
  name?: string
  description?: string
  meta_title?: string
  meta_description?: string
  meta_keyword?: string
}

export async function fetchOpenCartCategories(params?: {
  page?: number
  limit?: number
}): Promise<{ categories?: OpenCartCategory[]; [k: string]: unknown }> {
  const searchParams: Record<string, string> = {}
  if (params?.page) searchParams.page = String(params.page)
  if (params?.limit) searchParams.limit = String(params.limit)
  return opencartFetch('category_admin/category', { searchParams })
}

// ---------- Manufacturers ----------
export interface OpenCartManufacturer {
  manufacturer_id?: number
  name?: string
  image?: string
  sort_order?: number
}

export async function fetchOpenCartManufacturers(params?: {
  page?: number
  limit?: number
}): Promise<{ manufacturers?: OpenCartManufacturer[]; [k: string]: unknown }> {
  const searchParams: Record<string, string> = {}
  if (params?.page) searchParams.page = String(params.page)
  if (params?.limit) searchParams.limit = String(params.limit)
  return opencartFetch('manufacturer_admin/manufacturer', { searchParams })
}

// ---------- Filters ----------
export interface OpenCartFilter {
  filter_id?: number
  filter_group_id?: number
  sort_order?: number
  name?: string
}

export interface OpenCartFilterGroup {
  filter_group_id?: number
  sort_order?: number
  name?: string
}

export async function fetchOpenCartFilters(params?: {
  page?: number
  limit?: number
}): Promise<{ filters?: OpenCartFilter[]; filter_groups?: OpenCartFilterGroup[]; [k: string]: unknown }> {
  const searchParams: Record<string, string> = {}
  if (params?.page) searchParams.page = String(params.page)
  if (params?.limit) searchParams.limit = String(params.limit)
  return opencartFetch('filter_admin/filter', { searchParams })
}

// ---------- Attributes ----------
export interface OpenCartAttribute {
  attribute_id?: number
  attribute_group_id?: number
  sort_order?: number
  name?: string
}

export interface OpenCartAttributeGroup {
  attribute_group_id?: number
  sort_order?: number
  name?: string
}

export async function fetchOpenCartAttributes(params?: {
  page?: number
  limit?: number
}): Promise<{ attributes?: OpenCartAttribute[]; attribute_groups?: OpenCartAttributeGroup[]; [k: string]: unknown }> {
  const searchParams: Record<string, string> = {}
  if (params?.page) searchParams.page = String(params.page)
  if (params?.limit) searchParams.limit = String(params.limit)
  return opencartFetch('attribute_admin/attribute', { searchParams })
}

// ---------- Options ----------
export interface OpenCartOption {
  option_id?: number
  type?: string
  sort_order?: number
  name?: string
}

export async function fetchOpenCartOptions(params?: {
  page?: number
  limit?: number
}): Promise<{ options?: OpenCartOption[]; [k: string]: unknown }> {
  const searchParams: Record<string, string> = {}
  if (params?.page) searchParams.page = String(params.page)
  if (params?.limit) searchParams.limit = String(params.limit)
  return opencartFetch('option_admin/option', { searchParams })
}

// ---------- CRUD helpers (generic) ----------
export async function opencartPost(path: string, body: unknown): Promise<unknown> {
  return opencartFetch(path, { method: 'POST', body })
}

export async function opencartPut(path: string, id: number | string, body: unknown): Promise<unknown> {
  const b = typeof body === 'object' && body ? body : {}
  const bodyObj = { ...b } as Record<string, unknown>
  if (!('product_id' in bodyObj)) bodyObj.id = id
  return opencartFetch(path, {
    method: 'PUT',
    body: bodyObj,
    searchParams: { id: String(id) },
  })
}

export async function opencartDelete(path: string, id: number | string): Promise<unknown> {
  return opencartFetch(path, { method: 'DELETE', searchParams: { id: String(id) } })
}
