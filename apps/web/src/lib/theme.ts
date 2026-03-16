import { API_URL } from '@/lib/api'

const THEME_CATEGORY = 'theme'
const STORAGE_KEY = 'esync-theme'
const STORAGE_EVENT = 'esync-theme-updated'

export type ThemeKeys =
  | 'page_background'
  | 'sidebar_background'
  | 'sidebar_text'
  | 'sidebar_header_background'
  | 'sidebar_footer_background'
  | 'body_background'
  | 'footer_background'
  | 'btn_save'
  | 'btn_close'
  | 'btn_update'
  | 'btn_delete'

export interface ThemeSettings {
  page_background?: string
  sidebar_background?: string
  sidebar_text?: string
  sidebar_header_background?: string
  sidebar_footer_background?: string
  body_background?: string
  footer_background?: string
  btn_save?: string
  btn_close?: string
  btn_update?: string
  btn_delete?: string
}

const CSS_VAR_MAP: Record<ThemeKeys, string> = {
  page_background: '--theme-page-bg',
  sidebar_background: '--theme-sidebar-bg',
  sidebar_text: '--theme-sidebar-text',
  sidebar_header_background: '--theme-sidebar-header-bg',
  sidebar_footer_background: '--theme-sidebar-footer-bg',
  body_background: '--theme-body-bg',
  footer_background: '--theme-footer-bg',
  btn_save: '--theme-btn-save',
  btn_close: '--theme-btn-close',
  btn_update: '--theme-btn-update',
  btn_delete: '--theme-btn-delete',
}

function isValidHex(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color) || /^#[0-9A-Fa-f]{3}$/.test(color)
}

/** API'den tema ayarlarını çeker */
export async function fetchTheme(): Promise<ThemeSettings> {
  try {
    const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(THEME_CATEGORY)}`)
    if (!res.ok) return getTheme()
    const data = (await res.json()) as Record<string, string>
    const theme: ThemeSettings = {}
    for (const k of Object.keys(CSS_VAR_MAP) as ThemeKeys[]) {
      const v = data[k]
      if (v && isValidHex(v)) theme[k] = v
    }
    if (Object.keys(theme).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
    }
    return theme
  } catch {
    return getTheme()
  }
}

/** localStorage'dan tema ayarlarını okur */
export function getTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ThemeSettings
    return typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Tema ayarlarını API'ye kaydeder */
export async function saveTheme(settings: ThemeSettings): Promise<ThemeSettings> {
  const toSave: Record<string, string> = {}
  for (const [k, v] of Object.entries(settings)) {
    if (v && isValidHex(v)) toSave[k] = v
  }
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: THEME_CATEGORY, settings: toSave }),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'Kaydedilemedi')
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT))
  applyTheme(settings)
  return settings
}

/** Tema ayarlarını CSS değişkenleri olarak uygular */
export function applyTheme(settings: ThemeSettings) {
  const root = document.documentElement
  for (const key of Object.keys(CSS_VAR_MAP) as ThemeKeys[]) {
    const cssVar = CSS_VAR_MAP[key]
    const value = settings[key]
    if (value && isValidHex(value)) {
      root.style.setProperty(cssVar, value)
    } else {
      root.style.removeProperty(cssVar)
    }
  }
}

/** Tema değişikliklerini dinler */
export function onThemeUpdated(callback: () => void): () => void {
  const handler = () => callback()
  window.addEventListener(STORAGE_EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(STORAGE_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}
