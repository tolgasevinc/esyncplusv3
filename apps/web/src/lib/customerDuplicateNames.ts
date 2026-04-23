const TR = 'tr-TR'

export interface CustomerDuplicateRow {
  id: number
  title: string
  code?: string | null
}

export interface CustomerDuplicateNameGroup {
  /** Karşılaştırma anahtarı (trim + tr küçük harf) */
  key: string
  /** Görüntü için temsilî ünvan (gruptaki bir kayıt) */
  displayTitle: string
  rows: CustomerDuplicateRow[]
}

/**
 * Aynı isim (Türkçe büyük/küçük harf ayrımı dikkate alınmadan, baş/son boşluk yok sayılarak) birden fazla kayıt varsa gruplar.
 */
export function findDuplicateCustomerNames(items: CustomerDuplicateRow[]): CustomerDuplicateNameGroup[] {
  const map = new Map<string, CustomerDuplicateRow[]>()
  for (const item of items) {
    const raw = (item.title ?? '').trim()
    if (!raw) continue
    const key = raw.toLocaleLowerCase(TR)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push({ id: item.id, title: item.title ?? '', code: item.code })
  }
  const out: CustomerDuplicateNameGroup[] = []
  for (const [key, rows] of map) {
    if (rows.length < 2) continue
    const sorted = [...rows].sort((a, b) => a.id - b.id)
    out.push({
      key,
      displayTitle: (sorted[0]!.title ?? '').trim(),
      rows: sorted,
    })
  }
  out.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, TR))
  return out
}

export function countDuplicateInvolved(groups: CustomerDuplicateNameGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.length, 0)
}
