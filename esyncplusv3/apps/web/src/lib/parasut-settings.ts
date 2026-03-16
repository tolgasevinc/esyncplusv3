import { API_URL, parseJsonResponse } from '@/lib/api'

const PARASUT_CATEGORY = 'parasut'

/** app_settings parasut kategorisinde kullanılan anahtarlar (D1 tablosundaki key ile birebir eşleşmeli) */
export const PARASUT_SETTINGS_SCHEMA = [
  {
    key: 'PARASUT_CLIENT_ID',
    label: 'Client ID',
    type: 'text' as const,
    placeholder: 'OAuth client_id',
    description: 'Paraşüt destekten alınan OAuth client_id',
  },
  {
    key: 'PARASUT_CLIENT_SECRET',
    label: 'Client Secret',
    type: 'password' as const,
    placeholder: '••••••••',
    description: 'OAuth client_secret',
  },
  {
    key: 'PARASUT_CALLBACK_URL',
    label: 'Callback URL',
    type: 'text' as const,
    placeholder: 'urn:ietf:wg:oauth:2.0:oob',
    description: 'OAuth callback URL. Genellikle urn:ietf:wg:oauth:2.0:oob',
  },
  {
    key: 'PARASUT_USERNAME',
    label: 'Kullanıcı adı (E-posta)',
    type: 'text' as const,
    placeholder: 'ornek@firma.com',
    description: 'Paraşüt giriş e-posta adresi',
  },
  {
    key: 'PARASUT_PASSWORD',
    label: 'Şifre',
    type: 'password' as const,
    placeholder: '••••••••',
    description: 'Paraşüt giriş şifresi',
  },
  {
    key: 'PARASUT_COMPANY_ID',
    label: 'Firma ID',
    type: 'text' as const,
    placeholder: '123456',
    description: 'Paraşüt panelinde firma numarası. API çağrıları için zorunludur.',
  },
] as const

export type ParasutSettings = Record<string, string>

/** app_settings'ten Paraşüt ayarlarını çeker */
export async function fetchParasutSettings(): Promise<ParasutSettings> {
  const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(PARASUT_CATEGORY)}`)
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `API hatası: ${res.status}`)
  }
  return data
}

/** Paraşüt ayarlarını app_settings'e kaydeder */
export async function saveParasutSettings(settings: ParasutSettings): Promise<ParasutSettings> {
  const toSave: Record<string, string> = {}
  for (const { key } of PARASUT_SETTINGS_SCHEMA) {
    const v = settings[key]
    if (v !== undefined && v !== null) toSave[key] = String(v).trim()
  }
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: PARASUT_CATEGORY, settings: toSave }),
  })
  const data = await parseJsonResponse<ParasutSettings>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
  }
  return data
}
