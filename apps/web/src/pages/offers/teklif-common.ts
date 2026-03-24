import { normalizeForSearch } from '@/lib/utils'

export interface Offer {
  id: number
  date: string
  order_no?: string | null
  customer_id?: number | null
  contact_id?: number | null
  description?: string | null
  notes?: string | null
  discount_1?: number
  discount_2?: number
  discount_3?: number
  discount_4?: number
  status?: number
  customer_title?: string | null
  customer_code?: string | null
  total_amount?: number
  total_tl_offer?: number
  total_tl_current?: number
  currency_code?: string | null
  currency_symbol?: string | null
  company_name?: string | null
  authorized_name?: string | null
  company_phone?: string | null
  company_email?: string | null
  tax_office?: string | null
  tax_no?: string | null
  project_name?: string | null
  project_description?: string | null
  note_selections?: string | null
  prepared_by_name?: string | null
  prepared_by_title?: string | null
  prepared_by_phone?: string | null
  prepared_by_email?: string | null
  include_cover_page?: number
  include_attachment_ids?: string | null
  include_tag_ids?: string | null
  exclude_tag_ids?: string | null
}

export interface OfferItem {
  type?: 'product' | 'expense'
  product_id?: number | null
  product_name?: string | null
  product_sku?: string | null
  unit_name?: string | null
  currency_id?: number | null
  currency_symbol?: string | null
  description?: string | null
  amount: number
  unit_price: number
  line_discount: number
  discount_1?: number
  discount_2?: number
  discount_3?: number
  discount_4?: number
  discount_5?: number
  tax_rate: number
  discount_type?: 'percent' | 'fixed' | null
  discount_value?: number
}

export interface Customer {
  id: number
  title: string
  code?: string | null
  tax_no?: string | null
  tax_office?: string | null
  email?: string | null
  phone?: string | null
  phone_mobile?: string | null
}

export interface CustomerGroup {
  id: number
  name: string
}
export interface CustomerType {
  id: number
  name: string
}
export interface CustomerLegalType {
  id: number
  name: string
}

export interface CustomerContact {
  id: number
  full_name: string
  role?: string | null
  phone?: string | null
  phone_mobile?: string | null
  email?: string | null
}

/** Teklif kaydında tutulan müşteri çıktı alanları (PDF); müşteri kartından kopyalanır, kartı değiştirmez */
export type OfferCustomerSnapshotFields = {
  company_name: string
  company_phone: string
  company_email: string
  authorized_name: string
  tax_office: string
  tax_no: string
}

type CustomerLikeForOffer = {
  title?: string | null
  email?: string | null
  phone?: string | null
  phone_mobile?: string | null
  tax_office?: string | null
  tax_no?: string | null
}

/**
 * Kayıtlı müşteri (+ isteğe bağlı iletişim kişisi) → teklifte gösterilecek alanlar.
 * İletişimde telefon/e-posta varsa önce onlar kullanılır; yoksa müşteri kartı.
 */
export function offerFieldsFromCustomerRecord(
  customer: CustomerLikeForOffer,
  contact: Pick<CustomerContact, 'full_name' | 'email' | 'phone' | 'phone_mobile'> | null | undefined
): OfferCustomerSnapshotFields {
  const p1 = (customer.phone || '').trim()
  const p2 = (customer.phone_mobile || '').trim()
  const custPhone = [p1, p2].filter(Boolean).join(p1 && p2 ? ' / ' : '')

  const cPh = (contact?.phone || '').trim() || (contact?.phone_mobile || '').trim()
  const cEm = (contact?.email || '').trim()

  return {
    company_name: (customer.title || '').trim(),
    company_phone: cPh || custPhone,
    company_email: cEm || (customer.email || '').trim(),
    authorized_name: (contact?.full_name || '').trim(),
    tax_office: (customer.tax_office || '').trim(),
    tax_no: (customer.tax_no || '').trim(),
  }
}

/** Arama sonucu Customer → offerFieldsFromCustomerRecord girdisi */
export function customerSearchRowToOfferRecord(c: Customer): CustomerLikeForOffer {
  return {
    title: c.title,
    email: c.email,
    phone: c.phone,
    phone_mobile: c.phone_mobile,
    tax_office: c.tax_office,
    tax_no: c.tax_no,
  }
}

export interface Product {
  id: number
  name: string
  sku?: string | null
  price: number
  tax_rate?: number
  unit_name?: string | null
  currency_id?: number | null
  currency_symbol?: string | null
  product_item_group_id?: number | null
  product_item_group_name?: string | null
  product_item_group_color?: string | null
  product_item_group_sort_order?: number | null
}

export interface ProductCurrency {
  id: number
  name: string
  code: string
  symbol?: string
}

export function groupProductsByItemGroup(products: Product[]): { groupKey: string; groupName: string; groupColor: string | null; items: { product: Product; flatIndex: number }[] }[] {
  const byGroup = new Map<string, { name: string; color: string | null; sortOrder: number; products: Product[] }>()
  for (const p of products) {
    const key = String(p.product_item_group_id ?? '')
    const name = p.product_item_group_name || 'Grup yok'
    const color = p.product_item_group_color || null
    const sortOrder = p.product_item_group_sort_order ?? 9999
    if (!byGroup.has(key)) byGroup.set(key, { name, color, sortOrder, products: [] })
    byGroup.get(key)!.products.push(p)
  }
  const groups = Array.from(byGroup.entries()).map(([key, g]) => ({ key, ...g }))
  groups.sort((a, b) => {
    if (a.key === '') return 1
    if (b.key === '') return -1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return (a.name || '').localeCompare(b.name || '')
  })
  let flatIndex = 0
  return groups.map((g) => ({
    groupKey: g.key,
    groupName: g.name,
    groupColor: g.color,
    items: g.products.map((p) => ({ product: p, flatIndex: flatIndex++ })),
  }))
}

export const emptyItem = (): OfferItem => ({
  type: 'product',
  product_id: null,
  product_name: null,
  product_sku: null,
  unit_name: null,
  currency_id: null,
  currency_symbol: null,
  description: null,
  amount: 1,
  unit_price: 0,
  line_discount: 0,
  discount_1: 0,
  discount_2: 0,
  discount_3: 0,
  discount_4: 0,
  discount_5: 0,
  tax_rate: 0,
})

export const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  order_no: '',
  customer_id: '' as number | '',
  contact_id: '' as number | '',
  description: '',
  notes: '',
  discount_1: 0,
  discount_2: 0,
  discount_3: 0,
  discount_4: 0,
  currency_id: '' as number | '',
  exchange_rate: 1,
  company_name: '',
  authorized_name: '',
  company_phone: '',
  company_email: '',
  tax_office: '',
  tax_no: '',
  project_name: 'Tanımsız Proje',
  project_description: '',
  note_selections: {} as Record<string, number[]>,
  prepared_by_name: '',
  prepared_by_title: '',
  prepared_by_phone: '',
  prepared_by_email: '',
  include_cover_page: false,
  include_attachment_ids: [] as number[],
  include_tag_ids: [] as number[],
  exclude_tag_ids: [] as number[],
  items: [] as OfferItem[],
}

export function getOfferCurrencyInfo(form: { currency_id: number | '' }, currencies: ProductCurrency[]): { currency_id: number | null; currency_symbol: string } {
  if (form.currency_id === '') return { currency_id: null, currency_symbol: '₺' }
  const cur = currencies.find((c) => c.id === form.currency_id)
  return { currency_id: form.currency_id, currency_symbol: cur?.symbol || cur?.code || '₺' }
}

export function getItemLineDiscount(it: OfferItem): number {
  if (it.discount_type && it.discount_value != null) {
    const gross = it.amount * it.unit_price
    return it.discount_type === 'percent' ? gross * (it.discount_value / 100) : it.discount_value
  }
  const d1 = it.discount_1 ?? 0, d2 = it.discount_2 ?? 0, d3 = it.discount_3 ?? 0, d4 = it.discount_4 ?? 0, d5 = it.discount_5 ?? 0
  return it.line_discount || (d1 + d2 + d3 + d4 + d5)
}

export function getItemRowTotal(it: OfferItem): number {
  return it.amount * it.unit_price - getItemLineDiscount(it)
}

export function rateToTRY(code: string | undefined, exchangeRates: Record<string, number>): number {
  const c = (code || '').toUpperCase()
  if (c === 'TRY' || c === 'TL' || !c) return 1
  return exchangeRates[c] ?? 1
}

export function convertToOfferCurrency(
  amount: number,
  itemCurrencyId: number | null | undefined,
  offerCurrencyId: number | '' | undefined,
  currencies: ProductCurrency[],
  exchangeRates: Record<string, number>
): number {
  const itemCode = itemCurrencyId ? currencies.find((c) => c.id === itemCurrencyId)?.code : undefined
  const offerCode = offerCurrencyId === '' || offerCurrencyId == null
    ? undefined
    : currencies.find((c) => c.id === offerCurrencyId)?.code
  const rateItem = rateToTRY(itemCode, exchangeRates)
  const rateOffer = rateToTRY(offerCode, exchangeRates)
  return (amount * rateItem) / rateOffer
}

export function convertBetweenCurrencies(
  amount: number,
  fromCurrencyId: number | null | undefined,
  toCurrencyId: number | null | undefined,
  currencies: ProductCurrency[],
  exchangeRates: Record<string, number>
): number {
  const fromCode = fromCurrencyId ? currencies.find((c) => c.id === fromCurrencyId)?.code : undefined
  const toCode = toCurrencyId ? currencies.find((c) => c.id === toCurrencyId)?.code : undefined
  const rateFrom = rateToTRY(fromCode, exchangeRates)
  const rateTo = rateToTRY(toCode, exchangeRates)
  return (amount * rateFrom) / rateTo
}

export function filterCustomersByWords(customers: Customer[], inputWords: string[]): Customer[] {
  if (inputWords.length === 0) return []
  return customers.filter((c) => {
    const titleNorm = normalizeForSearch(c.title)
    const codeNorm = c.code ? normalizeForSearch(c.code) : ''
    return inputWords.every((w) => titleNorm.includes(w) || codeNorm.includes(w))
  })
}
