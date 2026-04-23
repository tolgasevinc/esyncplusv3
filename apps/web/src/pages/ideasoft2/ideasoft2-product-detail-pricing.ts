/** IdeaSoft Admin ürün yanıtı: liste satırı ile uyumlu fiyat alanları */

export function formatMoneyTr(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatIdeasoftProductPriceLine(p: Record<string, unknown>): string {
  const p1 = p.price1
  if (p1 == null || !Number.isFinite(Number(p1))) return '—'
  const price = Number(p1)
  const cur = p.currency
  const abbr =
    cur && typeof cur === 'object' && 'abbr' in cur
      ? String((cur as { abbr?: string }).abbr ?? '').trim()
      : ''
  return `${formatMoneyTr(price)}${abbr ? ` ${abbr}` : ''}`
}

export function readIdeasoftStockTypeLabel(p: Record<string, unknown>): string {
  const st = p.stockTypeLabel
  return typeof st === 'string' && st.trim() ? st.trim() : 'Piece'
}

/**
 * `products` API tek ürün cevabı: ana fiyat (tablo `price`).
 */
export function readMasterListPrice(p: Record<string, unknown>): number | null {
  const v = p.price
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export function readMasterCurrencyLabel(p: Record<string, unknown>): string {
  const sym = p.currency_symbol
  const name = p.currency_name
  const s = typeof sym === 'string' && sym.trim() ? sym.trim() : ''
  const n = typeof name === 'string' && name.trim() ? name.trim() : ''
  if (s && n) return `${n} (${s})`
  return s || n || '—'
}

export function readMasterUnitName(p: Record<string, unknown>): string {
  const u = p.unit_name
  return typeof u === 'string' && u.trim() ? u.trim() : '—'
}

/**
 * Kullanıcı girdisinden iskontolu fiyat. `fixed`: para biriminde tutar, `percent`: 0–100+ arası oran.
 */
export function priceAfterUserDiscount(
  base: number,
  rawInput: string,
  kind: 'percent' | 'fixed'
): number | null {
  if (!Number.isFinite(base) || base < 0) return null
  const t = rawInput.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '') return base
  const d = parseFloat(t)
  if (!Number.isFinite(d) || d < 0) return null
  if (kind === 'fixed') return Math.max(0, base - d)
  return Math.max(0, base * (1 - d / 100))
}
