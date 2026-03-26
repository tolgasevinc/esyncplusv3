import { API_URL, parseJsonResponse } from '@/lib/api'

const IDEASOFT_CATEGORY = 'ideasoft'

export type IdeasoftSettings = {
  store_base_url?: string
  client_id?: string
  client_secret?: string
  /** Boş = scope gönderilmez (çoğu mağaza için önerilir; public bazı sunucularda 500 verir) */
  oauth_scope?: string
  /** Yetkilendirme yolu, örn. /oauth/v2/auth veya /oauth/authorize */
  oauth_authorize_path?: string
}

/** Tarayıcıyı Ideasoft yetkilendirme akışına yönlendirir (API Worker adresi) */
export function getIdeasoftOAuthStartUrl(): string {
  const returnTo = typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : ''
  return `${API_URL}/api/ideasoft/oauth/start?return_to=${returnTo}`
}

/** OAuth callback — API Worker ile kayıtlı URI (Ideasoft panelde aynı olmalı) */
export function getIdeasoftRedirectUri(): string {
  return `${API_URL}/oauth/ideasoft/callback`
}

export async function fetchIdeasoftSettings(): Promise<IdeasoftSettings> {
  const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(IDEASOFT_CATEGORY)}`)
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `API hatası: ${res.status}`)
  }
  return {
    store_base_url: data.store_base_url,
    client_id: data.client_id,
    client_secret: data.client_secret,
    oauth_scope: data.oauth_scope,
    oauth_authorize_path: data.oauth_authorize_path,
  }
}

export async function saveIdeasoftSettings(settings: IdeasoftSettings): Promise<IdeasoftSettings> {
  const toSave: Record<string, string> = {}
  if (settings.store_base_url !== undefined && settings.store_base_url !== null) {
    toSave.store_base_url = String(settings.store_base_url).trim()
  }
  if (settings.client_id !== undefined && settings.client_id !== null) {
    toSave.client_id = String(settings.client_id).trim()
  }
  if (settings.client_secret !== undefined && settings.client_secret !== null) {
    const sec = String(settings.client_secret).trim()
    if (sec) toSave.client_secret = sec
  }
  if (settings.oauth_scope !== undefined && settings.oauth_scope !== null) {
    toSave.oauth_scope = String(settings.oauth_scope).trim()
  }
  if (settings.oauth_authorize_path !== undefined && settings.oauth_authorize_path !== null) {
    toSave.oauth_authorize_path = String(settings.oauth_authorize_path).trim()
  }
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: IDEASOFT_CATEGORY, settings: toSave }),
  })
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
  }
  return {
    store_base_url: data.store_base_url,
    client_id: data.client_id,
    client_secret: data.client_secret,
    oauth_scope: data.oauth_scope,
    oauth_authorize_path: data.oauth_authorize_path,
  }
}
