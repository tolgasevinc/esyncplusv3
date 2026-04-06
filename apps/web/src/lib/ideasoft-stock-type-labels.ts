/**
 * IdeaSoft Admin API — ürün `stockTypeLabel` (Product GET/PUT PDF).
 * Mağazada `/admin-api/units` uç noktası yok; stok birimi bu sabit kodlarla seçilir.
 */
export const IDEASOFT_STOCK_TYPE_LABELS = [
  'Piece',
  'cm',
  'Dozen',
  'gram',
  'kg',
  'Person',
  'Package',
  'metre',
  'm2',
  'pair',
] as const

export type IdeasoftStockTypeLabel = (typeof IDEASOFT_STOCK_TYPE_LABELS)[number]
