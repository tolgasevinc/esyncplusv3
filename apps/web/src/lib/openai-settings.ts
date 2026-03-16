import { API_URL, parseJsonResponse } from '@/lib/api'

const OPENAI_CATEGORY = 'openai'

export type OpenAISettings = {
  api_key?: string
}

/** app_settings'ten OpenAI ayarlarını çeker */
export async function fetchOpenAISettings(): Promise<OpenAISettings> {
  const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(OPENAI_CATEGORY)}`)
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `API hatası: ${res.status}`)
  }
  return data
}

/** OpenAI ayarlarını app_settings'e kaydeder */
export async function saveOpenAISettings(settings: OpenAISettings): Promise<OpenAISettings> {
  const toSave: Record<string, string> = {}
  if (settings.api_key !== undefined && settings.api_key !== null) {
    toSave.api_key = String(settings.api_key).trim()
  }
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: OPENAI_CATEGORY, settings: toSave }),
  })
  const data = await parseJsonResponse<OpenAISettings>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
  }
  return data
}
