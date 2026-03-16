import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Türkçe karakterleri arama için normalize eder. toLowerCase öncesi replace ile İ/ı sorunu önlenir. */
export function normalizeForSearch(s: string): string {
  return (s || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
}

/** Tarihi yerel formatta göster (tr-TR: gg.aa.yyyy) */
export function formatDate(value: string | null | undefined): string {
  if (!value || value === '—') return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('tr-TR')
}

/** Virgül veya nokta ile girilen metni sayıya çevirir (16,50 veya 16.50 → 16.5) */
export function parseDecimal(value: string): number {
  if (!value || typeof value !== 'string') return 0
  const normalized = value.trim().replace(',', '.')
  const parsed = parseFloat(normalized)
  return isNaN(parsed) ? 0 : parsed
}

/** Para değerini Türkçe formatta render et: binlik ayırıcı (.) ve ondalık ayırıcı (,) */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—'
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Fiyat + sembol (sağa yaslı gösterim için) */
export function formatPriceWithSymbol(value: number | null | undefined, symbol?: string | null): string {
  const formatted = formatPrice(value)
  if (formatted === '—') return '—'
  return symbol ? `${formatted} ${symbol}`.trim() : formatted
}

/** Türkiye telefon formatı: XXX XXX XX XX (3-3-2-2, 10 rakam, örn: 532 207 12 53) */
export function formatPhoneInput(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  digits = digits.slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 8) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`
}

/** Telefon numarasını görüntüleme formatında döndürür (XXX XXX XX XX, 10 rakam) */
export function formatPhone(value: string | null | undefined): string {
  if (!value || value.trim() === '') return '—'
  let digits = value.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  digits = digits.slice(0, 10)
  if (digits.length === 0) return '—'
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 8) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`
}

/** Hex rengi rgba'ya çevirir (alpha 0-1) */
export function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex)) return ''
  const m = hex.slice(1).match(hex.length === 4 ? /(.)(.)(.)/ : /(.{2})(.{2})(.{2})/)
  if (!m) return ''
  const r = parseInt(m[1].length === 1 ? m[1] + m[1] : m[1], 16)
  const g = parseInt(m[2].length === 1 ? m[2] + m[2] : m[2], 16)
  const b = parseInt(m[3].length === 1 ? m[3] + m[3] : m[3], 16)
  return `rgba(${r},${g},${b},${alpha})`
}
