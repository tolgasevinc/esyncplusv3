/** API base URL - trailing slash kaldırılır (çift slash sorununu önler) */
export const API_URL = (import.meta.env.VITE_API_URL || 'https://api.e-syncplus.com').replace(/\/+$/, '')

/** Response'u JSON olarak parse eder. Sunucu JSON dışı (404, 500 HTML vb.) dönerse hata fırlatır. */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return (text ? JSON.parse(text) : {}) as T
  } catch {
    const msg = text?.slice(0, 200) || res.statusText || `HTTP ${res.status}`
    throw new Error(msg)
  }
}
