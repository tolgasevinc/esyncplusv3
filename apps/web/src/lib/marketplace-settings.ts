/** Marketplace API entegrasyon ayarları - app_settings ile saklanır */
export type MarketplaceSettings = Record<string, string | undefined>

const API_URL = (import.meta.env.VITE_API_URL || 'https://api.e-syncplus.com').replace(/\/+$/, '')

/** Kategoriye ait ayarları getir */
export async function fetchMarketplaceSettings(category: string): Promise<MarketplaceSettings> {
  const res = await fetch(
    `${API_URL}/api/app-settings?category=${encodeURIComponent(category)}`
  )
  if (res.status === 404) return {}
  if (!res.ok) throw new Error('Ayarlar yüklenemedi')
  return (await res.json()) as MarketplaceSettings
}

/** Ayarları kaydet */
export async function saveMarketplaceSettings(
  category: string,
  settings: MarketplaceSettings
): Promise<MarketplaceSettings> {
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, settings }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Kaydedilemedi')
  }
  return (await res.json()) as MarketplaceSettings
}

/** Bağlantı testi */
export async function testMarketplaceConnection(
  category: string,
  settings: MarketplaceSettings
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_URL}/api/marketplace/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, settings }),
  })
  const data = (await res.json()) as { ok?: boolean; error?: string }
  if (!res.ok) return { ok: false, error: data.error || 'Test başarısız' }
  return { ok: data.ok ?? true, error: data.error }
}

/** Pazaryeri kategori listesi */
export async function fetchMarketplaceCategoryList(
  category: string,
  settings: MarketplaceSettings
): Promise<{ id: number; name: string; parentId: number | null }[]> {
  const res = await fetch(`${API_URL}/api/marketplace/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, settings }),
  })
  const data = (await res.json()) as { categories?: { id: number; name: string; parentId: number | null }[]; error?: string }
  if (!res.ok) throw new Error(data.error || 'Kategoriler alınamadı')
  return data.categories ?? []
}
