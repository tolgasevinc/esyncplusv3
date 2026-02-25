import * as XLSX from 'xlsx'
import { API_URL } from '@/lib/api'

const MAX_SEARCH_ROWS = 10000

/** Kaynak dosyadan tedarikçi kodu ile eşleşen kaydı bul */
export async function fetchSourceRecordBySupplierCode(
  sourceFile: string,
  sourceType: string,
  headerRow: number,
  columnMappings: Record<string, string>,
  supplierCode: string,
  apiUrl = API_URL
): Promise<Record<string, string> | null> {
  if (!sourceFile?.trim() || Object.keys(columnMappings).length === 0 || !supplierCode?.trim()) return null
  const code = supplierCode.trim()
  const isUrl = sourceFile.startsWith('http')
  const fetchUrl = isUrl ? sourceFile : `${apiUrl}/storage/serve?key=${encodeURIComponent(sourceFile)}`
  const res = await fetch(fetchUrl)
  if (!res.ok) throw new Error('Dosya alınamadı')
  const buf = await res.arrayBuffer()
  const rowIndex = Math.max(0, (headerRow || 1) - 1)
  const sourceCols = Object.keys(columnMappings)

  if (sourceType === 'csv') {
    let text = new TextDecoder('utf-8').decode(buf)
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const lines = text.split(/\r?\n/).filter(Boolean)
    const headerLine = lines[rowIndex] || ''
    const headers = headerLine.split(/[,;\t]/).map((s) => s.trim().replace(/^["']|["']$/g, ''))
    const colIndexes = sourceCols.map((col) => headers.indexOf(col))
    for (let i = rowIndex + 1; i < Math.min(lines.length, rowIndex + 1 + MAX_SEARCH_ROWS); i++) {
      const vals = lines[i].split(/[,;\t]/).map((s) => s.trim().replace(/^["']|["']$/g, ''))
      const rec: Record<string, string> = {}
      sourceCols.forEach((srcCol, idx) => {
        const productCol = columnMappings[srcCol]
        if (productCol) rec[productCol] = vals[colIndexes[idx]] ?? ''
      })
      if ((rec.supplier_code || '').trim() === code) return rec
    }
    return null
  }

  if (sourceType === 'excel' || sourceType === 'xlsx' || sourceType === 'xls') {
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return null
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    const headers = (data[rowIndex] || []).map((c) => String(c ?? '').trim())
    const colIndexes = sourceCols.map((col) => headers.indexOf(col))
    for (let i = rowIndex + 1; i < Math.min(data.length, rowIndex + 1 + MAX_SEARCH_ROWS); i++) {
      const row = data[i] || []
      const rec: Record<string, string> = {}
      sourceCols.forEach((srcCol, idx) => {
        const productCol = columnMappings[srcCol]
        if (productCol) rec[productCol] = String(row[colIndexes[idx]] ?? '').trim()
      })
      if ((rec.supplier_code || '').trim() === code) return rec
    }
    return null
  }

  if (sourceType === 'xml') {
    const text = new TextDecoder('utf-8').decode(buf)
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const rows = doc.querySelectorAll('row, Row, record, Record, item, Item, product, Product, DataRow')
    for (let r = 0; r < Math.min(rows.length, MAX_SEARCH_ROWS); r++) {
      const el = rows[r] as Element
      const rec: Record<string, string> = {}
      sourceCols.forEach((srcCol) => {
        const productCol = columnMappings[srcCol]
        if (!productCol) return
        const child = Array.from(el.children).find((c) => (c.getAttribute('name') || c.nodeName) === srcCol)
        const val = child?.textContent?.trim() ?? el.getAttribute(srcCol) ?? ''
        rec[productCol] = val
      })
      if ((rec.supplier_code || '').trim() === code) return rec
    }
    return null
  }

  return null
}

/** Kaynak dosyadan tüm tedarikçi kodlarını topla */
async function fetchAllSupplierCodesFromSource(
  sourceFile: string,
  sourceType: string,
  headerRow: number,
  columnMappings: Record<string, string>,
  apiUrl: string
): Promise<Set<string>> {
  const codes = new Set<string>()
  if (!sourceFile?.trim() || Object.keys(columnMappings).length === 0) return codes
  const supplierCodeCol = Object.entries(columnMappings).find(([, v]) => v === 'supplier_code')?.[0]
  if (!supplierCodeCol) return codes
  const isUrl = sourceFile.startsWith('http')
  const fetchUrl = isUrl ? sourceFile : `${apiUrl}/storage/serve?key=${encodeURIComponent(sourceFile)}`
  const res = await fetch(fetchUrl)
  if (!res.ok) return codes
  const buf = await res.arrayBuffer()
  const rowIndex = Math.max(0, (headerRow || 1) - 1)
  const sourceCols = Object.keys(columnMappings)
  const supplierCodeIdx = sourceCols.indexOf(supplierCodeCol)

  if (sourceType === 'csv') {
    let text = new TextDecoder('utf-8').decode(buf)
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const lines = text.split(/\r?\n/).filter(Boolean)
    const headerLine = lines[rowIndex] || ''
    const headers = headerLine.split(/[,;\t]/).map((s) => s.trim().replace(/^["']|["']$/g, ''))
    const colIndexes = sourceCols.map((col) => headers.indexOf(col))
    for (let i = rowIndex + 1; i < Math.min(lines.length, rowIndex + 1 + MAX_SEARCH_ROWS); i++) {
      const vals = lines[i].split(/[,;\t]/).map((s) => s.trim().replace(/^["']|["']$/g, ''))
      const code = (vals[colIndexes[supplierCodeIdx]] ?? '').trim()
      if (code) codes.add(code)
    }
    return codes
  }

  if (sourceType === 'excel' || sourceType === 'xlsx' || sourceType === 'xls') {
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return codes
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    const headers = (data[rowIndex] || []).map((c) => String(c ?? '').trim())
    const colIndexes = sourceCols.map((col) => headers.indexOf(col))
    for (let i = rowIndex + 1; i < Math.min(data.length, rowIndex + 1 + MAX_SEARCH_ROWS); i++) {
      const row = data[i] || []
      const code = String(row[colIndexes[supplierCodeIdx]] ?? '').trim()
      if (code) codes.add(code)
    }
    return codes
  }

  if (sourceType === 'xml') {
    const text = new TextDecoder('utf-8').decode(buf)
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const rows = doc.querySelectorAll('row, Row, record, Record, item, Item, product, Product, DataRow')
    for (let r = 0; r < Math.min(rows.length, MAX_SEARCH_ROWS); r++) {
      const el = rows[r] as Element
      const child = Array.from(el.children).find((c) => (c.getAttribute('name') || c.nodeName) === supplierCodeCol)
      const code = (child?.textContent?.trim() ?? el.getAttribute(supplierCodeCol) ?? '').trim()
      if (code) codes.add(code)
    }
    return codes
  }
  return codes
}

/** Marka için tedarikçi kaynaklarında eşleşen tedarikçi kodlarını döndür */
export async function fetchMatchedSupplierCodesFromBrand(
  brandId: number,
  apiUrl = API_URL
): Promise<Set<string>> {
  const allCodes = new Set<string>()
  if (!brandId) return allCodes
  const res = await fetch(`${apiUrl}/api/suppliers?brand_id=${brandId}&limit=50`)
  const json = await res.json()
  const suppliers = json?.data ?? []
  for (const s of suppliers) {
    const sourceFile = s.source_file
    const sourceType = s.source_type || 'excel'
    const headerRow = s.header_row ?? 1
    const mappingsJson = s.column_mappings
    if (!sourceFile || !mappingsJson) continue
    let columnMappings: Record<string, string> = {}
    try {
      const parsed = JSON.parse(mappingsJson)
      columnMappings = typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      continue
    }
    if (!columnMappings || Object.keys(columnMappings).length === 0) continue
    if (!Object.values(columnMappings).includes('supplier_code')) continue
    try {
      const codes = await fetchAllSupplierCodesFromSource(
        sourceFile,
        sourceType,
        headerRow,
        columnMappings,
        apiUrl
      )
      codes.forEach((c) => allCodes.add(c))
    } catch {
      /* ignore */
    }
  }
  return allCodes
}

/** Marka için tedarikçi kaynak dosyalarında tedarikçi koduna göre fiyat ara */
export async function lookupFromSupplierSource(
  brandId: number,
  supplierCode: string,
  apiUrl = API_URL
): Promise<{ price: number; currency_id: number | null } | null> {
  const code = supplierCode?.trim()
  if (!code || !brandId) return null
  const res = await fetch(`${apiUrl}/api/suppliers?brand_id=${brandId}&limit=50`)
  const json = await res.json()
  const suppliers = json?.data ?? []
  for (const s of suppliers) {
    const sourceFile = s.source_file
    const sourceType = s.source_type || 'excel'
    const headerRow = s.header_row ?? 1
    const mappingsJson = s.column_mappings
    if (!sourceFile || !mappingsJson) continue
    let columnMappings: Record<string, string> = {}
    try {
      const parsed = JSON.parse(mappingsJson)
      columnMappings = typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      continue
    }
    if (!columnMappings || Object.keys(columnMappings).length === 0) continue
    const hasSupplierCodeMapping = Object.values(columnMappings).includes('supplier_code')
    if (!hasSupplierCodeMapping) continue
    try {
      const rec = await fetchSourceRecordBySupplierCode(
        sourceFile,
        sourceType,
        headerRow,
        columnMappings,
        code,
        apiUrl
      )
      if (!rec) continue
      const rawPrice = rec.price
      const price = typeof rawPrice === 'number' && !isNaN(rawPrice)
        ? rawPrice
        : (typeof rawPrice === 'string' ? parseFloat(String(rawPrice).replace(',', '.')) : parseFloat(String(rawPrice || 0))) || 0
      if (isNaN(price) || price <= 0) continue
      let currencyId: number | null = s.currency_id != null ? Number(s.currency_id) : null
      if (rec.currency_id) {
        const parsedCur = parseInt(String(rec.currency_id), 10)
        if (!isNaN(parsedCur)) currencyId = parsedCur
      }
      return { price, currency_id: currencyId }
    } catch {
      continue
    }
  }
  return null
}
