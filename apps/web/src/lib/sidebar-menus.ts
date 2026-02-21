import { API_URL } from '@/lib/api'

const STORAGE_KEY = 'esync-sidebar-menus'
const HEADER_STORAGE_KEY = 'esync-sidebar-header'
const API_CATEGORY = 'sidebar'

/** Ayırıcı renk seçenekleri */
export const SEPARATOR_COLORS = [
  { id: 'border', label: 'Varsayılan', class: 'border-border' },
  { id: 'primary', label: 'Birincil', class: 'border-primary' },
  { id: 'orange', label: 'Turuncu', class: 'border-orange-500' },
  { id: 'muted', label: 'Soluk', class: 'border-muted-foreground/50' },
  { id: 'destructive', label: 'Kırmızı', class: 'border-destructive' },
] as const

/** Ayırıcı kalınlık seçenekleri (px) */
export const SEPARATOR_THICKNESSES = [
  { id: '1', label: 'İnce (1px)', value: 1 },
  { id: '2', label: 'Orta (2px)', value: 2 },
  { id: '4', label: 'Kalın (4px)', value: 4 },
] as const

export interface SidebarMenuItem {
  id: string
  type?: 'menu' | 'separator'
  label: string
  link: string
  /** Modül ID - varsa link bu modülden türetilir (app-modules) */
  moduleId?: string
  /** Base64 data URL (eski format, geriye uyumluluk) */
  iconDataUrl?: string
  /** Storage path (ikonlar klasörüne yüklenen dosya yolu) */
  iconPath?: string
  /** Ayırıcı rengi (separator için) */
  separatorColor?: string
  /** Ayırıcı kalınlığı px (separator için) */
  separatorThickness?: number
}

/** Sidebar başlık (logo + uygulama adı) */
export interface SidebarHeaderConfig {
  logoPath?: string
  title?: string
}

const DEFAULT_TITLE = 'eSync+'
const STORAGE_EVENT = 'esync-sidebar-menus-updated'

// ---------- Senkron (localStorage - fallback / cache) ----------

export function getSidebarMenus(): SidebarMenuItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getSidebarHeader(): SidebarHeaderConfig {
  try {
    const raw = localStorage.getItem(HEADER_STORAGE_KEY)
    if (!raw) return { title: DEFAULT_TITLE }
    const parsed = JSON.parse(raw) as SidebarHeaderConfig
    return {
      logoPath: parsed.logoPath,
      title: parsed.title ?? DEFAULT_TITLE,
    }
  } catch {
    return { title: DEFAULT_TITLE }
  }
}

// ---------- API (sidebar_menu_items tablosu) ----------

/** API'den sidebar menülerini çeker. */
export async function fetchSidebarMenus(): Promise<SidebarMenuItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/sidebar-menu-items`, { cache: 'no-store' })
    if (!res.ok) return getSidebarMenus()
    const items = (await res.json()) as SidebarMenuItem[]
    if (Array.isArray(items) && items.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
      return items
    }
    return getSidebarMenus()
  } catch {
    return getSidebarMenus()
  }
}

/** API'den sidebar header'ı çeker (app_settings). */
export async function fetchSidebarHeader(): Promise<SidebarHeaderConfig> {
  try {
    const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(API_CATEGORY)}`)
    if (!res.ok) return getSidebarHeader()
    const data = (await res.json()) as Record<string, string>
    const raw = data?.header
    if (!raw) return getSidebarHeader()
    const parsed = JSON.parse(raw) as SidebarHeaderConfig
    const config = {
      logoPath: parsed.logoPath,
      title: parsed.title ?? DEFAULT_TITLE,
    }
    localStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(config))
    return config
  } catch {
    return getSidebarHeader()
  }
}

/** Menüleri API'ye ve localStorage'a kaydeder. API hatasında sessizce geçer (localStorage güncellenir). */
export async function saveSidebarMenus(items: SidebarMenuItem[]): Promise<void> {
  const toSave = items.map(({ iconDataUrl, ...rest }) => rest)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT))
  try {
    const res = await fetch(`${API_URL}/api/sidebar-menu-items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSave),
    })
    if (res.ok) {
      const saved = (await res.json()) as SidebarMenuItem[]
      if (Array.isArray(saved) && saved.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
      }
    }
  } catch {
    // API hatası - localStorage zaten güncellendi
  }
}

/** Menüleri API'ye aktarır. Hata durumunda throw eder (sync butonu için). */
export async function syncSidebarMenusToApi(items: SidebarMenuItem[]): Promise<void> {
  const toSave = items.map(({ iconDataUrl, ...rest }) => rest)
  const res = await fetch(`${API_URL}/api/sidebar-menu-items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toSave),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string })?.error || `HTTP ${res.status}`)
  }
  const saved = (await res.json()) as SidebarMenuItem[]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT))
}

/** Header'ı API'ye ve localStorage'a kaydeder */
export async function saveSidebarHeader(config: SidebarHeaderConfig): Promise<void> {
  const toSave = {
    logoPath: config.logoPath,
    title: config.title ?? DEFAULT_TITLE,
  }
  localStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(toSave))
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT))
  try {
    await fetch(`${API_URL}/api/app-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: API_CATEGORY,
        settings: { header: JSON.stringify(toSave) },
      }),
    })
  } catch {
    // API hatası - localStorage zaten güncellendi
  }
}
