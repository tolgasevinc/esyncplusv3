/**
 * IdeaSoft Admin API — ürün "hedef / arama anahtar kelimesi" alanı
 *
 * **Resmi şema (Product GET _ Admin API.pdf):** Ürün gövdesinde düz alan
 * `searchKeywords` (string, ≤255) — açıklama: "Arama anahtar kelimeleri (virgülle ayrılmış)".
 * Aynı alan Product PUT gövdesinde de geçer.
 *
 * **Pratikte:** JSON serileştirmesi mağaza sürümüne göre değişebilir:
 * - `search_keywords` (snake_case), Türkçe panel alan adları, `seo` / `seoSetting` içi
 * - Değer bazen dizi veya `{ "tr": "..." }` gibi nesne olarak gelebilir
 *
 * Paneldeki "Hedef kelime" çoğu kurulumda bu alana denk gelir; ayrıca bazı sürümlerde
 * yalnızca `metaKeywords` içinde (virgülle ayrılmış listenin ilk ifadesi) tutulabiliyor.
 */
function coerceKeywordField(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).trim()
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === 'string' ? x.trim() : String(x ?? '').trim()))
      .filter(Boolean)
      .join(', ')
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    for (const val of Object.values(o)) {
      const s = coerceKeywordField(val)
      if (s) return s
    }
  }
  return ''
}

const TOP_LEVEL_KEYS: string[] = [
  'searchKeywords',
  'search_keywords',
  'searchKeyword',
  'search_keyword',
  'hedefKelime',
  'hedef_kelime',
  'targetKeyword',
  'target_keyword',
  'targetKeywords',
  'target_keywords',
  'aramaAnahtarKelimeleri',
  'arama_anahtar_kelimeleri',
]

const NESTED_SEO_KEYS: string[] = [
  ...TOP_LEVEL_KEYS,
  'metaSearchKeywords',
  'meta_search_keywords',
]

function readFromKeyBag(bag: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const s = coerceKeywordField(bag[k])
    if (s) return s
  }
  return ''
}

function readFromSeoLike(raw: unknown, keys: string[]): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  return readFromKeyBag(raw as Record<string, unknown>, keys)
}

export function extractIdeasoftProductSearchKeywords(raw: Record<string, unknown>): string {
  let s = readFromKeyBag(raw, TOP_LEVEL_KEYS)
  if (s) return s

  for (const seoKey of ['seoSetting', 'seo', 'seo_settings', 'seoSettings']) {
    s = readFromSeoLike(raw[seoKey], NESTED_SEO_KEYS)
    if (s) return s
  }

  const trans = raw.translations ?? raw.translation ?? raw.productTranslations
  if (Array.isArray(trans)) {
    for (const row of trans) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      s = readFromKeyBag(row as Record<string, unknown>, TOP_LEVEL_KEYS)
      if (s) return s
    }
  } else if (trans && typeof trans === 'object' && !Array.isArray(trans)) {
    for (const row of Object.values(trans as Record<string, unknown>)) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      s = readFromKeyBag(row as Record<string, unknown>, TOP_LEVEL_KEYS)
      if (s) return s
    }
  }

  for (const key of ['metaKeywords', 'meta_keywords'] as const) {
    const full =
      typeof raw[key] === 'string'
        ? String(raw[key]).trim()
        : coerceKeywordField(raw[key])
    if (!full) continue
    const first = full.split(/[,;]/u)[0]?.trim() ?? ''
    if (first) return first
  }

  return ''
}
