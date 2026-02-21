const STORAGE_KEY = 'esync-sidebar-menus'
const HEADER_STORAGE_KEY = 'esync-sidebar-header'

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

const STORAGE_EVENT = 'esync-sidebar-menus-updated'

export function saveSidebarMenus(items: SidebarMenuItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT))
}

/** Sidebar başlık (logo + uygulama adı) */
export interface SidebarHeaderConfig {
  logoPath?: string
  title?: string
}

const DEFAULT_TITLE = 'eSync+'

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

export function saveSidebarHeader(config: SidebarHeaderConfig): void {
  localStorage.setItem(HEADER_STORAGE_KEY, JSON.stringify(config))
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT))
}
