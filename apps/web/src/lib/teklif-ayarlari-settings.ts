import { API_URL, parseJsonResponse } from '@/lib/api'

const TEKLIF_AYARLARI_CATEGORY = 'teklif_ayarlari'

export type TeklifAyarlariSettings = {
  cover_page_enabled?: string
  cover_page_content?: string
}

/** app_settings'ten Teklif Ayarları'nı çeker */
export async function fetchTeklifAyarlariSettings(): Promise<TeklifAyarlariSettings> {
  const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(TEKLIF_AYARLARI_CATEGORY)}`)
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `API hatası: ${res.status}`)
  }
  return data
}

/** Teklif Ayarları'nı app_settings'e kaydeder */
export async function saveTeklifAyarlariSettings(settings: TeklifAyarlariSettings): Promise<TeklifAyarlariSettings> {
  const toSave: Record<string, string> = {}
  if (settings.cover_page_enabled !== undefined && settings.cover_page_enabled !== null) {
    toSave.cover_page_enabled = String(settings.cover_page_enabled)
  }
  if (settings.cover_page_content !== undefined && settings.cover_page_content !== null) {
    toSave.cover_page_content = String(settings.cover_page_content)
  }
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: TEKLIF_AYARLARI_CATEGORY, settings: toSave }),
  })
  const data = await parseJsonResponse<TeklifAyarlariSettings>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
  }
  return data
}
