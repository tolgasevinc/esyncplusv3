const TR = 'tr-TR'

/**
 * Her kelimenin yalnızca ilk harfini Türkçe kurallarıyla büyütür (i→İ, ı→I, ü→Ü, …).
 * Boşluklarla ayrılmış kelimelere uygulanır; önce/sonda trim.
 */
export function toTurkishTitleCaseName(raw: string): string {
  const t = raw.trim()
  if (!t) return raw
  return t
    .split(/\s+/)
    .map((word) => {
      if (!word) return word
      const [first, ...restChars] = Array.from(word)
      const head = (first as string).toLocaleUpperCase(TR)
      const tail = restChars.join('').toLocaleLowerCase(TR)
      return head + tail
    })
    .join(' ')
}

/** Metin, harf varsa, tamamı için Türkçe küçük harf biçiminde mi? */
export function isFullTurkishLowercase(s: string): boolean {
  if (!s) return false
  return s === s.toLocaleLowerCase(TR)
}

export interface CustomerTitleFixPreview {
  id: number
  from: string
  to: string
}

/**
 * Sadece tamamı küçük harf (tr-TR) olan ve başlık metnine çevrildiğinde farklı olan kayıtları listeler.
 */
export function listCustomerTitleFixes(
  items: { id: number; title: string }[]
): CustomerTitleFixPreview[] {
  const out: CustomerTitleFixPreview[] = []
  for (const item of items) {
    const title = item.title ?? ''
    if (!title) continue
    if (!isFullTurkishLowercase(title)) continue
    const to = toTurkishTitleCaseName(title)
    if (to === title) continue
    out.push({ id: item.id, from: title, to })
  }
  return out
}
