/** API base URL - trailing slash kaldırılır (çift slash sorununu önler) */
export const API_URL = (import.meta.env.VITE_API_URL || 'https://api.e-syncplus.com').replace(/\/+$/, '')

/** Response'u JSON olarak parse eder. HTML dönerse anlamlı hata fırlatır. */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text()
  const trimmed = text.trim()
  if (trimmed.startsWith('<') || trimmed.startsWith('<!')) {
    throw new Error(`API HTML döndü (${res.status}) — Sunucu erişilemiyor veya yol yanlış. URL: ${res.url}`)
  }
  try {
    return (trimmed ? JSON.parse(trimmed) : {}) as T
  } catch {
    throw new Error(trimmed.slice(0, 150) || res.statusText || `HTTP ${res.status}`)
  }
}

/** IdeaSoft store-api proxy yanıtı: `error` + isteğe bağlı `hint` */
export function formatIdeasoftProxyErrorForUi(data: { error?: string; hint?: string }): string {
  const e = data.error?.trim() || 'İstek başarısız'
  const h = data.hint?.trim()
  return h ? `${e}\n\n${h}` : e
}

/** `/api/product-categories` ve benzeri: `data` dizi değilse veya sarmalanmışsa yine de satırları bul. */
export function extractProductCategoryList(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  if (!json || typeof json !== 'object') return []
  const o = json as Record<string, unknown>
  if (Array.isArray(o.data)) return o.data
  if (Array.isArray(o.results)) return o.results
  if (o.data && typeof o.data === 'object') {
    const inner = o.data as Record<string, unknown>
    if (Array.isArray(inner.items)) return inner.items
    if (Array.isArray(inner.records)) return inner.records
    if (Array.isArray(inner.data)) return inner.data
  }
  return []
}
