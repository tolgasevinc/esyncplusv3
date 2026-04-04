import { API_URL, parseJsonResponse } from '@/lib/api'

const IDEASOFT_CATEGORY = 'ideasoft'

/** Form + app_settings ile hizalı anahtarlar (gizli alanlar API GET’te dönmez) */
export const IDEASOFT_SETTINGS_KEYS = {
  storeBase: 'store_base_url',
  clientId: 'IDEASOFT_CLIENT_ID',
  clientSecret: 'IDEASOFT_CLIENT_SECRET',
  redirectUri: 'IDEASOFT_REDIRECT_URI',
  accessToken: 'IDEASOFT_ACCESS_TOKEN',
  refreshToken: 'IDEASOFT_REFRESH_TOKEN',
} as const

export type IdeasoftSettings = Record<string, string>

/** Mağaza kökü: https://magaza-adiniz.myideasoft.com */
export function normalizeIdeasoftStoreBaseInput(raw: string): string {
  let s = (raw || '').trim().replace(/\/+$/, '')
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`
  return s
}

export function validateIdeasoftStoreBase(raw: string): string | null {
  const s = raw.trim()
  if (!s) return 'Mağaza adresi zorunludur.'
  const n = normalizeIdeasoftStoreBaseInput(s)
  try {
    const u = new URL(n)
    if (!['http:', 'https:'].includes(u.protocol)) return 'Yalnızca http veya https kullanılabilir.'
    if (!u.hostname || u.hostname.length < 3) return 'Geçerli bir alan adı girin.'
    return null
  } catch {
    return 'Mağaza adresi geçerli bir URL olmalıdır.'
  }
}

export function validateIdeasoftRedirectUri(raw: string): string | null {
  const s = raw.trim()
  if (!s) return 'Redirect URI zorunludur (Panel › Entegrasyonlar › API ile aynı olmalı).'
  try {
    const u = new URL(s)
    if (!['http:', 'https:'].includes(u.protocol)) return 'Redirect URI http veya https ile başlamalıdır.'
    return null
  } catch {
    return 'Redirect URI geçerli bir tam URL olmalıdır (örn. https://uygulamaniz.com/ideasoft-callback).'
  }
}

export function validateIdeasoftClientId(raw: string): string | null {
  if (!raw.trim()) return 'Client ID zorunludur.'
  return null
}

/**
 * Kaydetmeden önce: mağaza, client id, redirect.
 * Gizli alanlar: boş bırakılırsa sunucudaki değer korunur (PUT’a gönderilmez).
 */
export function validateIdeasoftSettingsForSave(s: IdeasoftSettings): string | null {
  const baseErr = validateIdeasoftStoreBase(s[IDEASOFT_SETTINGS_KEYS.storeBase] ?? '')
  if (baseErr) return baseErr
  const idErr = validateIdeasoftClientId(s[IDEASOFT_SETTINGS_KEYS.clientId] ?? '')
  if (idErr) return idErr
  const redErr = validateIdeasoftRedirectUri(s[IDEASOFT_SETTINGS_KEYS.redirectUri] ?? '')
  if (redErr) return redErr
  return null
}

/** Panel auth URL (döküman adım 1) */
export function buildIdeasoftAuthorizationUrl(
  storeBaseRaw: string,
  clientId: string,
  redirectUri: string,
  state: string
): string | null {
  const baseErr = validateIdeasoftStoreBase(storeBaseRaw)
  const idErr = validateIdeasoftClientId(clientId)
  const redErr = validateIdeasoftRedirectUri(redirectUri)
  if (baseErr || idErr || redErr) return null
  const base = normalizeIdeasoftStoreBaseInput(storeBaseRaw)
  const root = base.endsWith('/') ? base : `${base}/`
  const url = new URL('panel/auth/', root)
  url.searchParams.set('client_id', clientId.trim())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  url.searchParams.set('redirect_uri', redirectUri.trim())
  return url.toString()
}

export async function fetchIdeasoftSettings(): Promise<IdeasoftSettings> {
  const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(IDEASOFT_CATEGORY)}`)
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `API hatası: ${res.status}`)
  }
  return data
}

/**
 * Yalnızca dolu alanları yazar; secret/token boşsa mevcut DB değeri silinmez.
 */
export async function saveIdeasoftSettings(settings: IdeasoftSettings): Promise<IdeasoftSettings> {
  const toSave: Record<string, string> = {}

  const base = (settings[IDEASOFT_SETTINGS_KEYS.storeBase] ?? '').trim()
  toSave[IDEASOFT_SETTINGS_KEYS.storeBase] = normalizeIdeasoftStoreBaseInput(base)

  const cid = (settings[IDEASOFT_SETTINGS_KEYS.clientId] ?? '').trim()
  toSave[IDEASOFT_SETTINGS_KEYS.clientId] = cid

  const red = (settings[IDEASOFT_SETTINGS_KEYS.redirectUri] ?? '').trim()
  toSave[IDEASOFT_SETTINGS_KEYS.redirectUri] = red

  for (const key of [
    IDEASOFT_SETTINGS_KEYS.clientSecret,
    IDEASOFT_SETTINGS_KEYS.accessToken,
    IDEASOFT_SETTINGS_KEYS.refreshToken,
  ] as const) {
    const v = (settings[key] ?? '').trim()
    if (v) toSave[key] = v
  }

  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: IDEASOFT_CATEGORY, settings: toSave }),
  })
  const data = await parseJsonResponse<IdeasoftSettings>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
  }
  return data
}
