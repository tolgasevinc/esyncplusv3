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
