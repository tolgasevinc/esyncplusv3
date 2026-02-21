import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
