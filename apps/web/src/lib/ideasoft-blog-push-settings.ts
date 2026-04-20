import { API_URL, parseJsonResponse } from '@/lib/api'

const CATEGORY = 'ideasoft'

/** D1 `app_settings` `ideasoft` satırları — Admin API Blog POST/PUT varsayılanları */
export const IDEASOFT_BLOG_PUSH_KEYS = {
  categoryId: 'BLOG_PUSH_CATEGORY_ID',
  tagsJson: 'BLOG_PUSH_TAGS_JSON',
  status: 'BLOG_PUSH_STATUS',
  blockVisibility: 'BLOG_PUSH_BLOCK_VISIBILITY',
} as const

export type IdeasoftBlogPushFormValues = Record<(typeof IDEASOFT_BLOG_PUSH_KEYS)[keyof typeof IDEASOFT_BLOG_PUSH_KEYS], string>

export function defaultBlogPushFormValues(): IdeasoftBlogPushFormValues {
  return {
    [IDEASOFT_BLOG_PUSH_KEYS.categoryId]: '',
    [IDEASOFT_BLOG_PUSH_KEYS.tagsJson]: '[]',
    [IDEASOFT_BLOG_PUSH_KEYS.status]: '1',
    [IDEASOFT_BLOG_PUSH_KEYS.blockVisibility]: '1',
  }
}

export function extractBlogPushFromIdeasoftSettings(all: Record<string, string>): IdeasoftBlogPushFormValues {
  const d = defaultBlogPushFormValues()
  for (const k of Object.keys(IDEASOFT_BLOG_PUSH_KEYS) as (keyof typeof IDEASOFT_BLOG_PUSH_KEYS)[]) {
    const key = IDEASOFT_BLOG_PUSH_KEYS[k]
    if (all[key] !== undefined && all[key] !== null) d[key] = String(all[key])
  }
  return d
}

export async function fetchIdeasoftSettingsRaw(): Promise<Record<string, string>> {
  const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(CATEGORY)}`)
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) throw new Error((data as { error?: string }).error || `API: ${res.status}`)
  return data
}

export async function saveIdeasoftBlogPushSettings(patch: Partial<IdeasoftBlogPushFormValues>): Promise<void> {
  const settings: Record<string, string> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== null) settings[k] = String(v)
  }
  if (Object.keys(settings).length === 0) return
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: CATEGORY, settings }),
  })
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
}
