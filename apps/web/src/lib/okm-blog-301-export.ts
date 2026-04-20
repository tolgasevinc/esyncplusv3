/**
 * OKM blog satırından SEF yolu çıkarımı — API’deki `okmRowToIdeasoftBlogPayload` ile aynı sütun önceliği.
 * 301 listesi: eski `/blog/{tail}` → yeni `/blog/icerik/{tail}`
 */

import * as XLSX from 'xlsx'

export const OKM_BLOG_SEF_COLUMN_CANDIDATES = [
  'slug',
  'seo_slug',
  'sef',
  'sef_link',
  'seflink',
  'permalink',
  'friendly_url',
  'friendlyurl',
  'uri',
  'path',
  'blog_path',
  'detay_link',
  'link_rewrite',
  'rewrite',
  'haber_url',
  'yazi_url',
  'url',
  'link',
  'seo_url',
] as const

const OKM_BLOG_EXT_COLUMN_CANDIDATES = [
  'extension',
  'url_extension',
  'slug_extension',
  'sef_extension',
  'uzanti',
] as const

function pickFromRow(row: Record<string, unknown>, candidates: readonly string[]): string {
  const keys = Object.keys(row).filter((k) => k !== '_ideasoft')
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k] as const))
  for (const c of candidates) {
    const k = lower.get(c.toLowerCase())
    if (!k) continue
    const v = row[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

export function okmBlogNormalizeSefPath(raw: string): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s)
      s = u.pathname || ''
    }
  } catch {
    /* olduğu gibi */
  }
  s = (s.split(/[?#]/)[0] ?? '').replace(/^\/+|\/+$/g, '')
  try {
    s = decodeURIComponent(s.replace(/\+/g, ' ')).trim()
  } catch {
    s = s.trim()
  }
  return s
}

/** Pathname’deki gereksiz `blog/` önekini kaldır (örn. /blog/yazi → yazi). */
function stripLeadingBlogPrefix(path: string): string {
  let p = (path ?? '').trim().replace(/^\/+|\/+$/g, '')
  const low = p.toLowerCase()
  if (low === 'blog') return ''
  if (low.startsWith('blog/')) p = p.slice(5).replace(/^\/+|\/+$/g, '')
  return p
}

function mergeExtensionIfBareSlug(path: string, extRaw: string): string {
  const base = path.trim()
  if (!base) return ''
  if (base.includes('.')) return base
  const e = extRaw.trim().replace(/^\./, '').toLowerCase()
  if (!e || !/^[a-z0-9]{1,8}$/.test(e)) return base
  return `${base}.${e}`
}

/**
 * 301 satırı için yol gövdesi (başında/sonunda slash yok); boşsa null.
 * Eski URL: `/blog/${tail}` — Yeni: `/blog/icerik/${tail}`
 */
export function pickOkmBlog301PathTail(row: Record<string, unknown>): string | null {
  const raw = pickFromRow(row, OKM_BLOG_SEF_COLUMN_CANDIDATES)
  let path = okmBlogNormalizeSefPath(raw)
  path = stripLeadingBlogPrefix(path)
  const extRaw = pickFromRow(row, OKM_BLOG_EXT_COLUMN_CANDIDATES)
  path = mergeExtensionIfBareSlug(path, extRaw)
  const tail = path.replace(/^\/+|\/+$/g, '')
  return tail ? tail : null
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type OkmBlog301ExportResult = { exported: number; skipped: number }

/** İki sütun: eski URL, yeni URL — Excel 97–2003 (.xls). */
export function downloadOkmBlog301RedirectSheet(
  rows: Record<string, unknown>[],
  opts?: { fileBase?: string },
): OkmBlog301ExportResult {
  const dataRows: string[][] = []
  for (const row of rows) {
    const tail = pickOkmBlog301PathTail(row)
    if (!tail) continue
    const t = tail.replace(/^\/+/, '')
    dataRows.push([`/blog/${t}`, `/blog/icerik/${t}`])
  }
  const aoa: string[][] = [['Eski URL', 'Yeni URL'], ...dataRows]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  XLSX.utils.book_append_sheet(wb, ws, '301')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'biff8' })
  const blob = new Blob([buf], { type: 'application/vnd.ms-excel' })
  const base =
    (opts?.fileBase?.trim() && opts.fileBase.replace(/[^\w\-]+/g, '_').slice(0, 80)) ||
    `okm-blog-301-${new Date().toISOString().slice(0, 10)}`
  downloadBlob(blob, `${base}.xls`)
  return { exported: dataRows.length, skipped: rows.length - dataRows.length }
}
