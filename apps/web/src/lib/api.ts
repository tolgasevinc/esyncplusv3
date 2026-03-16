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
