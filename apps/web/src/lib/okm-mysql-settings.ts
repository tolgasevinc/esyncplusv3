import { API_URL, parseJsonResponse } from '@/lib/api'

export const OKM_MYSQL_CATEGORY = 'okm_mysql'

/** app_settings `okm_mysql` anahtarları (API ile birebir) */
export const OKM_MYSQL_CONNECTION_KEYS = ['host', 'port', 'database', 'user', 'password'] as const
export const OKM_MYSQL_BLOG_KEYS = ['blog_table', 'blog_order_column', 'blog_source_id_column'] as const
/** IdeaSoft’a aktarım: Admin API `POST /admin-api/blogs` için zorunlu kategori kimliği */
export const OKM_MYSQL_IDEASOFT_KEYS = ['ideasoft_blog_category_id'] as const
/** Eski OKM MySQL tablosunda zaten tutulan IdeaSoft blog kimliği sütunu (D1 içe aktarımı için) */
export const OKM_MYSQL_LEGACY_SYNC_KEYS = ['ideasoft_blog_id_column'] as const
/** Görseller: eski site kök URL (göreli yollar) + isteğe bağlı kapak sütunu adı */
export const OKM_MYSQL_BLOG_IMAGE_KEYS = ['blog_image_base_url', 'blog_image_column'] as const
/** OKM › Ürünler: tablo + sıralama; SEF sütunu boşsa bilinen adlar denenir; URL için yol segmenti */
export const OKM_MYSQL_PRODUCT_KEYS = [
  'product_table',
  'product_order_column',
  'product_sef_column',
  'product_url_path_segment',
] as const
export const OKM_MYSQL_ALL_KEYS = [
  ...OKM_MYSQL_CONNECTION_KEYS,
  ...OKM_MYSQL_BLOG_KEYS,
  ...OKM_MYSQL_IDEASOFT_KEYS,
  ...OKM_MYSQL_LEGACY_SYNC_KEYS,
  ...OKM_MYSQL_BLOG_IMAGE_KEYS,
  ...OKM_MYSQL_PRODUCT_KEYS,
] as const

export type OkmMysqlSettings = Record<string, string>

export async function fetchOkmMysqlSettings(): Promise<OkmMysqlSettings> {
  const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(OKM_MYSQL_CATEGORY)}`)
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `API hatası: ${res.status}`)
  }
  return data
}

export async function saveOkmMysqlSettings(settings: OkmMysqlSettings): Promise<OkmMysqlSettings> {
  const toSave: Record<string, string> = {}
  for (const key of OKM_MYSQL_ALL_KEYS) {
    const v = settings[key]
    if (v !== undefined && v !== null) toSave[key] = String(v).trim()
  }
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: OKM_MYSQL_CATEGORY, settings: toSave }),
  })
  const data = await parseJsonResponse<OkmMysqlSettings>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
  }
  return data
}
