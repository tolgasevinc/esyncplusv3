import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'

/** IdeaSoft Admin API: `limit` genelde 1–100. */
export const IDEASOFT_ADMIN_LIST_PAGE_LIMIT = 100
export const IDEASOFT_ADMIN_LIST_MAX_PAGES = 200

/**
 * Tüm sayfaları (limit=100) tarayıp listeyi birleştirir. `productId === null` ise `product=`
 * parametresi gönderilmez (örn. `extra_infos` kataloğu).
 */
export async function fetchAllIdeasoftAdminPagedList<T>(
  path: string,
  extract: (json: unknown) => { items: T[]; total: number },
  fallbackError: string,
  productId: number | null
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  for (; page <= IDEASOFT_ADMIN_LIST_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(IDEASOFT_ADMIN_LIST_PAGE_LIMIT),
      sort: 'id',
    })
    if (productId != null) params.set('product', String(productId))
    const res = await fetch(`${API_URL}/api/ideasoft/admin-api/${path}?${params}`)
    const data = await parseJsonResponse<unknown>(res)
    if (!res.ok) {
      throw new Error(
        formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || fallbackError
      )
    }
    const { items } = extract(data)
    if (items.length === 0) break
    all.push(...items)
    if (items.length < IDEASOFT_ADMIN_LIST_PAGE_LIMIT) break
  }
  return all
}
