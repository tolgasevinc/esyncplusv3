/** Genel fiyat (products.price) - product_price_types dışında */
export const GENERAL_PRICE_FIELD = { id: 'price', label: 'Genel Fiyat' } as const

/** Kaynak/hedef fiyat ID - 'price' (Genel) veya price_type_id string ('1', '2' vb.) */
export type PriceFieldId = string

/** İşlem tipleri */
export const OPERATION_TYPES = [
  { id: 'add', label: 'Ekle (+)' },
  { id: 'subtract', label: 'Çıkar (-)' },
  { id: 'multiply', label: 'Çarp (×)' },
  { id: 'divide', label: 'Böl (÷)' },
  { id: 'add_percent', label: 'Yüzde Ekle (+%)' },
  { id: 'subtract_percent', label: 'Yüzde Çıkar (-%)' },
] as const

export type OperationTypeId = (typeof OPERATION_TYPES)[number]['id']

export interface CalculationOperation {
  type: OperationTypeId
  value: number
}

export interface CalculationRule {
  id: string
  name: string
  source: PriceFieldId
  target: PriceFieldId
  operations: CalculationOperation[]
  /** Hesaplama sonucunun para birimi (opsiyonel; boşsa kaynak para birimi kullanılır) */
  result_currency_id?: number | null
  /** Marka ID; null/undefined = tüm markalar için geçerli */
  brand_id?: number | null
  /** Kategori ID; null/undefined = tüm kategoriler için geçerli */
  category_id?: number | null
}

export interface PriceValue {
  price: number
  currency_id: number | null
  status: number
}

function applyOperation(current: number, op: CalculationOperation): number {
  const type = op?.type ?? 'add_percent'
  const value = Number(op?.value) || 0
  switch (type) {
    case 'add':
      return current + value
    case 'subtract':
      return current - value
    case 'multiply':
      return current * value
    case 'divide':
      return value !== 0 ? current / value : current
    case 'add_percent':
      return current * (1 + value / 100)
    case 'subtract_percent':
      return current * (1 - value / 100)
    default:
      return current
  }
}

/** Ürün marka/kategorisine göre en özel uygun kuralı bulur. */
export function findRuleForProduct(
  rules: CalculationRule[],
  target: string,
  brandId: number | null | undefined,
  categoryId?: number | null
): CalculationRule | undefined {
  let best: { rule: CalculationRule; score: number } | undefined
  for (const rule of rules) {
    if (String(rule.target) !== target) continue
    const brandMatches = rule.brand_id == null || rule.brand_id === brandId
    const categoryMatches = rule.category_id == null || rule.category_id === categoryId
    if (!brandMatches || !categoryMatches) continue
    const score = (rule.brand_id != null ? 2 : 0) + (rule.category_id != null ? 1 : 0)
    if (!best || score > best.score) best = { rule, score }
  }
  return best?.rule
}

/** Hesaplama kurallarını uygular, sonucu yuvarlar. Formül yoksa kaynak değer aynen döner. */
export function applyCalculation(sourceValue: number, operations: CalculationOperation[]): number {
  const base = Number(sourceValue) || 0
  if (!Array.isArray(operations) || operations.length === 0) {
    return base
  }
  let result = base
  for (const op of operations) {
    if (op && typeof op === 'object') result = applyOperation(result, op)
  }
  return Math.round(result * 100) / 100
}

export function normalizeCalculationRules(raw: unknown): CalculationRule[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((rule): rule is CalculationRule => !!rule && typeof rule === 'object')
    .map((rule) => ({
      ...rule,
      source: String(rule.source === 'ecommerce_price' ? '1' : rule.source ?? 'price'),
      target: String(rule.target === 'ecommerce_price' ? '1' : rule.target ?? ''),
      operations: Array.isArray(rule.operations) ? rule.operations : [],
      result_currency_id:
        rule.result_currency_id != null && Number(rule.result_currency_id) > 0
          ? Number(rule.result_currency_id)
          : null,
      brand_id: rule.brand_id != null && Number(rule.brand_id) > 0 ? Number(rule.brand_id) : null,
      category_id: rule.category_id != null && Number(rule.category_id) > 0 ? Number(rule.category_id) : null,
    }))
    .filter((rule) => !!rule.target)
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : null
}

function normalizePriceValue(value: PriceValue | undefined): PriceValue | undefined {
  const price = finiteNumber(value?.price)
  if (price == null) return undefined
  return {
    price,
    currency_id: value?.currency_id != null ? Number(value.currency_id) : null,
    status: value?.status ?? 1,
  }
}

export function resolveCalculatedPrice(
  target: string,
  options: {
    basePrice: number
    baseCurrencyId: number | null
    prices: Record<number, PriceValue | undefined>
    rules: CalculationRule[]
    brandId?: number | null
    categoryId?: number | null
    preferExisting?: boolean
  }
): PriceValue | null {
  const targetId = String(target)
  const targetNum = Number(targetId)
  const existing = Number.isFinite(targetNum) ? normalizePriceValue(options.prices[targetNum]) : undefined
  if (options.preferExisting !== false && existing) return existing

  const visiting = new Set<string>()
  const resolveSource = (source: string): PriceValue | null => {
    const sourceId = String(source)
    if (sourceId === 'price') {
      const base = finiteNumber(options.basePrice)
      return base == null ? null : { price: base, currency_id: options.baseCurrencyId, status: 1 }
    }
    const sourceNum = Number(sourceId)
    if (!Number.isFinite(sourceNum)) return null
    const sourceExisting = normalizePriceValue(options.prices[sourceNum])
    if (sourceExisting) return sourceExisting
    return resolveTarget(sourceId)
  }
  const resolveTarget = (id: string): PriceValue | null => {
    if (visiting.has(id)) return null
    visiting.add(id)
    const rule = findRuleForProduct(options.rules, id, options.brandId, options.categoryId)
    if (!rule || !rule.operations?.length) {
      visiting.delete(id)
      return null
    }
    const source = resolveSource(rule.source)
    visiting.delete(id)
    if (!source) return null
    const ruleCurrencyId =
      rule.result_currency_id != null && Number(rule.result_currency_id) > 0
        ? Number(rule.result_currency_id)
        : source.currency_id
    return {
      price: applyCalculation(source.price, rule.operations),
      currency_id: ruleCurrencyId ?? null,
      status: 1,
    }
  }

  return resolveTarget(targetId)
}

export function applyCalculationRulesToPrices(options: {
  basePrice: number
  baseCurrencyId: number | null
  prices: Record<number, PriceValue | undefined>
  rules: CalculationRule[]
  targets: number[]
  brandId?: number | null
  categoryId?: number | null
}): Record<number, PriceValue> {
  const next: Record<number, PriceValue> = {}
  for (const [id, value] of Object.entries(options.prices)) {
    const normalized = normalizePriceValue(value)
    if (normalized) next[Number(id)] = normalized
  }
  for (const target of options.targets) {
    const rule = findRuleForProduct(options.rules, String(target), options.brandId, options.categoryId)
    if (!rule?.operations?.length) continue
    const resolved = resolveCalculatedPrice(String(target), {
      ...options,
      prices: next,
      preferExisting: false,
    })
    if (resolved) {
      next[target] = {
        ...(next[target] ?? { status: 1 }),
        ...resolved,
        status: next[target]?.status ?? resolved.status ?? 1,
      }
    }
  }
  return next
}

export function generateId(): string {
  return `calc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** İşlemleri okunabilir formül metnine çevirir (örn: "Genel Fiyat + 18%") */
export function formatOperationsAsFormula(
  operations: CalculationOperation[],
  sourceLabel = 'Genel Fiyat'
): string {
  if (!operations?.length) return `${sourceLabel} (formül yok)`
  const parts: string[] = []
  for (const op of operations) {
    const v = op.value
    const vStr = Number.isInteger(v) ? String(v) : v.toFixed(2)
    switch (op.type) {
      case 'add':
        parts.push(`+ ${vStr}`)
        break
      case 'subtract':
        parts.push(`- ${vStr}`)
        break
      case 'multiply':
        parts.push(`× ${vStr}`)
        break
      case 'divide':
        parts.push(`÷ ${vStr}`)
        break
      case 'add_percent':
        parts.push(`+ ${vStr}%`)
        break
      case 'subtract_percent':
        parts.push(`- ${vStr}%`)
        break
      default:
        parts.push(`? ${vStr}`)
    }
  }
  return [sourceLabel, ...parts].join(' ')
}
