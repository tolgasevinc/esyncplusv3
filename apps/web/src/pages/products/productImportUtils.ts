import * as XLSX from 'xlsx'

export type ImportFileKind = 'excel' | 'xml'

export type MasterImportField =
  | 'name'
  | 'sku'
  | 'barcode'
  | 'supplier_code'
  | 'gtip_code'
  | 'price'
  | 'quantity'
  | 'tax_rate'
  | 'ecommerce_price'
  | 'image'
  | 'brand_id'
  | 'type_id'
  | 'unit_id'
  | 'currency_id'
  | 'product_item_group_id'

export const MASTER_IMPORT_FIELD_META: { value: MasterImportField; label: string }[] = [
  { value: 'name', label: 'Ürün adı' },
  { value: 'sku', label: 'SKU' },
  { value: 'barcode', label: 'Barkod' },
  { value: 'supplier_code', label: 'Tedarikçi kodu' },
  { value: 'gtip_code', label: 'GTIP' },
  { value: 'price', label: 'Fiyat' },
  { value: 'quantity', label: 'Miktar' },
  { value: 'tax_rate', label: 'KDV (%)' },
  { value: 'ecommerce_price', label: 'E-ticaret fiyatı' },
  { value: 'image', label: 'Görsel (yol/URL)' },
  { value: 'brand_id', label: 'Marka ID' },
  { value: 'type_id', label: 'Ürün tipi ID' },
  { value: 'unit_id', label: 'Birim ID' },
  { value: 'currency_id', label: 'Para birimi ID' },
  { value: 'product_item_group_id', label: 'Ürün grubu ID' },
]

function dedupeHeaderNames(raw: string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((h) => {
    const base = h.trim() || 'Sütun'
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base} (${n})`
  })
}

function normalizeHeaderKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
}

const HEADER_GUESS: Record<string, MasterImportField> = {
  'urun adi': 'name',
  'ürün adı': 'name',
  ad: 'name',
  name: 'name',
  'product name': 'name',
  baslik: 'name',
  başlık: 'name',
  sku: 'sku',
  'stok kodu': 'sku',
  'urun kodu': 'sku',
  barkod: 'barcode',
  barcode: 'barcode',
  'tedarikci kodu': 'supplier_code',
  'tedarikçi kodu': 'supplier_code',
  'supplier code': 'supplier_code',
  gtip: 'gtip_code',
  'gtip kodu': 'gtip_code',
  fiyat: 'price',
  price: 'price',
  miktar: 'quantity',
  quantity: 'quantity',
  stok: 'quantity',
  kdv: 'tax_rate',
  'tax rate': 'tax_rate',
  'e-ticaret fiyat': 'ecommerce_price',
  'e ticaret fiyat': 'ecommerce_price',
  ecommerce_price: 'ecommerce_price',
  gorsel: 'image',
  görsel: 'image',
  image: 'image',
  resim: 'image',
  'marka id': 'brand_id',
  brand_id: 'brand_id',
  'tip id': 'type_id',
  type_id: 'type_id',
  'birim id': 'unit_id',
  unit_id: 'unit_id',
  'para birimi id': 'currency_id',
  currency_id: 'currency_id',
  'urun grubu id': 'product_item_group_id',
  'ürün grubu id': 'product_item_group_id',
  product_item_group_id: 'product_item_group_id',
}

export function guessImportField(header: string): MasterImportField | '' {
  const k = normalizeHeaderKey(header)
  return HEADER_GUESS[k] ?? ''
}

export function parseExcelImport(buf: ArrayBuffer): { headers: string[]; rows: Record<string, string>[] } {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const sheet = sheetName ? wb.Sheets[sheetName] : undefined
  if (!sheet) return { headers: [], rows: [] }
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  if (data.length === 0) return { headers: [], rows: [] }
  const rawHeaders = (data[0] || []).map((c, i) => {
    const s = String(c ?? '').trim()
    return s || `Sütun ${i + 1}`
  })
  const headers = dedupeHeaderNames(rawHeaders)
  const rows: Record<string, string>[] = []
  for (let r = 1; r < data.length; r++) {
    const line = data[r] || []
    const row: Record<string, string> = {}
    let hasAny = false
    headers.forEach((h, i) => {
      const v = String(line[i] ?? '').trim()
      row[h] = v
      if (v) hasAny = true
    })
    if (hasAny) rows.push(row)
  }
  return { headers, rows }
}

function stripNs(tag: string): string {
  return tag.replace(/^.*:/, '')
}

export function parseXmlImport(buf: ArrayBuffer): { headers: string[]; rows: Record<string, string>[] } {
  const text = new TextDecoder('utf-8').decode(buf)
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('XML dosyası çözümlenemedi')
  }

  const rowEls = doc.querySelectorAll('row, Row, record, Record, item, Item, product, Product, DataRow')
  if (rowEls.length > 0) {
    const first = rowEls[0] as Element
    const headerCandidates: string[] = []
    Array.from(first.children).forEach((el) => {
      const name = stripNs(el.getAttribute('name') || el.nodeName)
      if (name && !headerCandidates.includes(name)) headerCandidates.push(name)
    })
    if (headerCandidates.length === 0) {
      Array.from(first.attributes).forEach((a) => {
        if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) return
        if (!headerCandidates.includes(a.name)) headerCandidates.push(a.name)
      })
    }
    const headers = dedupeHeaderNames(headerCandidates.length > 0 ? headerCandidates : ['value'])
    const rows: Record<string, string>[] = []
    rowEls.forEach((node) => {
      const el = node as Element
      const row: Record<string, string> = {}
      let has = false
      if (first.children.length > 0 && headerCandidates.length > 0) {
        headerCandidates.forEach((h, idx) => {
          const headerKey = headers[idx] ?? h
          const child = Array.from(el.children).find(
            (c) => stripNs(c.getAttribute('name') || c.nodeName) === h
          )
          const v = child?.textContent?.trim() ?? ''
          row[headerKey] = v
          if (v) has = true
        })
      } else {
        headerCandidates.forEach((h, idx) => {
          const headerKey = headers[idx] ?? h
          const v = el.getAttribute(h)?.trim() ?? ''
          row[headerKey] = v
          if (v) has = true
        })
      }
      if (has) rows.push(row)
    })
    return { headers, rows }
  }

  const root = doc.documentElement
  if (!root) return { headers: [], rows: [] }
  const children = Array.from(root.children).filter((e) => e.nodeType === 1)
  if (children.length === 0) return { headers: [], rows: [] }
  const firstChild = children[0]!
  const rawTags = Array.from(firstChild.children).map((el) => stripNs(el.nodeName))
  const headers = dedupeHeaderNames(rawTags)
  const rows: Record<string, string>[] = []
  children.forEach((item) => {
    const row: Record<string, string> = {}
    let has = false
    Array.from(item.children).forEach((el, i) => {
      const h = headers[i] ?? stripNs(el.nodeName)
      const v = el.textContent?.trim() ?? ''
      row[h] = v
      if (v) has = true
    })
    if (has) rows.push(row)
  })
  return { headers, rows }
}

export async function parseImportFile(
  file: File,
  kind: ImportFileKind
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const buf = await file.arrayBuffer()
  if (kind === 'excel') return parseExcelImport(buf)
  return parseXmlImport(buf)
}

function numOrUndef(s: string): number | undefined {
  const t = s.trim()
  if (!t) return undefined
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function intOrUndef(s: string): number | undefined {
  const t = s.trim()
  if (!t) return undefined
  const n = parseInt(t, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Satır + başlık eşlemesinden POST /api/products gövdesi üretir (category_id ayrı eklenir). */
export function buildProductPayloadFromRow(
  row: Record<string, string>,
  headerToField: Record<string, MasterImportField | ''>,
  categoryId: number
): Record<string, unknown> {
  const body: Record<string, unknown> = { category_id: categoryId }
  for (const [header, field] of Object.entries(headerToField)) {
    if (!field) continue
    const raw = row[header] ?? ''
    switch (field) {
      case 'name':
        body.name = raw.trim()
        break
      case 'sku':
      case 'barcode':
      case 'supplier_code':
      case 'gtip_code':
      case 'image':
        if (raw.trim()) body[field] = raw.trim()
        break
      case 'price':
      case 'quantity':
      case 'tax_rate':
      case 'ecommerce_price': {
        const n = numOrUndef(raw)
        if (n !== undefined) body[field] = n
        break
      }
      case 'brand_id':
      case 'type_id':
      case 'unit_id':
      case 'currency_id':
      case 'product_item_group_id': {
        const id = intOrUndef(raw)
        if (id !== undefined) body[field] = id
        break
      }
      default:
        break
    }
  }
  return body
}

/** Eşlenen tedarikçi kodu sütunundan değer (mevcut kayıt kontrolü bu alan üzerinden). */
export function getRowSupplierCode(row: Record<string, string>, headerToField: Record<string, MasterImportField | ''>): string {
  for (const [h, f] of Object.entries(headerToField)) {
    if (f === 'supplier_code') return (row[h] ?? '').trim()
  }
  return ''
}
