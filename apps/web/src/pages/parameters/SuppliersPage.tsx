import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import * as XLSX from 'xlsx'
import { Search, Plus, X, Trash2, Pencil, FileSpreadsheet, RefreshCw, Play, List, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FileOrLinkInput } from '@/components/FileOrLinkInput'
import { toastSuccess, toastError } from '@/lib/toast'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'

import { API_URL } from '@/lib/api'

/** products tablosu sütunları - column_mappings eşleştirmesi için */
const PRODUCT_COLUMNS = [
  { value: 'name', label: 'Ürün Adı' },
  { value: 'sku', label: 'SKU' },
  { value: 'barcode', label: 'Barkod' },
  { value: 'brand_id', label: 'Marka ID' },
  { value: 'category_id', label: 'Kategori ID' },
  { value: 'type_id', label: 'Tip ID' },
  { value: 'unit_id', label: 'Birim ID' },
  { value: 'currency_id', label: 'Para Birimi ID' },
  { value: 'price', label: 'Fiyat' },
  { value: 'quantity', label: 'Miktar' },
  { value: 'image', label: 'Görsel' },
  { value: 'tax_rate', label: 'Vergi Oranı' },
  { value: 'supplier_code', label: 'Tedarikçi Kodu' },
  { value: 'erpcode', label: 'ERP Kodu' },
  { value: 'gtip_code', label: 'GTIP Kodu' },
]

const NUMERIC_COLUMNS = ['price', 'quantity', 'tax_rate']

/** Tedarikçi kodunu eşleştirme için normalize et (123.0 -> 123, trim, lowercase) */
function normalizeSupplierCode(s: string | number | undefined): string {
  const str = String(s ?? '').trim()
  const withoutTrailingZero = str.replace(/^(\d+)\.0+$/, '$1')
  return withoutTrailingZero.toLowerCase()
}

/** Kayıttan ERP kodunu çıkar - Excel erpcode ile products.supplier_code eşleşmesi için */
function getRecordSupplierCode(rec: Record<string, string>): string {
  return normalizeSupplierCode(rec.erpcode ?? rec.supplier_code ?? '')
}

function formatCellValue(col: string, val: string): string {
  if (!val) return '—'
  if (!NUMERIC_COLUMNS.includes(col)) return val
  const num = parseFloat(String(val).replace(',', '.'))
  if (isNaN(num)) return val
  if (col === 'price') {
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

const SOURCE_TYPES = [
  { value: 'excel', label: 'Excel' },
  { value: 'xml', label: 'XML' },
  { value: 'csv', label: 'CSV' },
]

interface Supplier {
  id: number
  name: string
  brand_id?: number | null
  brand_name?: string
  source_type: string
  currency_id?: number | null
  currency_symbol?: string
  source_file?: string | null
  header_row?: number | null
  record_count?: number
  column_mappings?: string | null
  column_types?: string | null
  sort_order: number
  status?: number
  created_at?: string
}

const emptyForm = {
  name: '',
  brand_id: '' as number | '',
  source_type: 'excel',
  currency_id: '' as number | '',
  source_file: '',
  header_row: 1,
  record_count: 0,
  column_mappings: '{}',
  column_types: '{}',
  sort_order: 0,
  status: 1,
}

function parseColumnMappings(json: string | null | undefined): Record<string, string> {
  if (!json?.trim()) return {}
  try {
    const parsed = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function stringifyColumnMappings(obj: Record<string, string>): string {
  return JSON.stringify(obj, null, 2)
}

async function fetchSourceHeaders(
  sourceFile: string,
  sourceType: string,
  headerRow: number,
  apiUrl: string
): Promise<string[]> {
  if (!sourceFile?.trim()) return []
  const isUrl = sourceFile.startsWith('http')
  const fetchUrl = isUrl ? sourceFile : `${apiUrl}/storage/serve?key=${encodeURIComponent(sourceFile)}`
  const res = await fetch(fetchUrl)
  if (!res.ok) throw new Error('Dosya alınamadı')
  const buf = await res.arrayBuffer()

  const rowIndex = Math.max(0, (headerRow || 1) - 1)

  if (sourceType === 'csv') {
    let text = new TextDecoder('utf-8').decode(buf)
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const lines = text.split(/\r?\n/)
    const line = lines[rowIndex] || ''
    return line
      .split(/[,;\t]/)
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
  }

  if (sourceType === 'excel' || sourceType === 'xlsx' || sourceType === 'xls') {
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return []
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    const targetRow = data[rowIndex] || []
    return targetRow.map((c) => String(c ?? '').trim()).filter(Boolean)
  }

  if (sourceType === 'xml') {
    const text = new TextDecoder('utf-8').decode(buf)
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const rows = doc.querySelectorAll('row, Row, record, Record, item, Item, product, Product, DataRow')
    if (rows.length > 0) {
      const first = rows[0] as Element
      const headers: string[] = []
      Array.from(first.children).forEach((el) => {
        const name = el.getAttribute('name') || el.getAttribute('ss:Name') || el.nodeName
        if (name && !headers.includes(name)) headers.push(name)
      })
      if (headers.length > 0) return headers
      Array.from(first.attributes).forEach((a) => {
        if (a.name !== 'xmlns' && !headers.includes(a.name)) headers.push(a.name)
      })
      if (headers.length > 0) return headers
    }
    const firstEl = doc.documentElement?.firstElementChild
    if (firstEl) {
      const names = Array.from(firstEl.children).map((el) => el.getAttribute('name') || el.nodeName)
      if (names.length > 0) return names
    }
  }

  return []
}

/** Kaynak dosyadan eşleştirilmiş alanlarla birkaç kayıt oku (deneme için) */
async function fetchSourceRecords(
  sourceFile: string,
  sourceType: string,
  headerRow: number,
  columnMappings: Record<string, string>,
  apiUrl: string,
  limit = 5
): Promise<Record<string, string>[]> {
  if (!sourceFile?.trim() || Object.keys(columnMappings).length === 0) return []
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
    const out: Record<string, string>[] = []
    for (let i = rowIndex + 1; i < Math.min(lines.length, rowIndex + 1 + limit); i++) {
      const vals = lines[i].split(/[,;\t]/).map((s) => s.trim().replace(/^["']|["']$/g, ''))
      const rec: Record<string, string> = {}
      sourceCols.forEach((srcCol, idx) => {
        const productCol = columnMappings[srcCol]
        if (productCol) rec[productCol] = vals[colIndexes[idx]] ?? ''
      })
      out.push(rec)
    }
    return out
  }

  if (sourceType === 'excel' || sourceType === 'xlsx' || sourceType === 'xls') {
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) return []
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    const headers = (data[rowIndex] || []).map((c) => String(c ?? '').trim())
    const colIndexes = sourceCols.map((col) => headers.indexOf(col))
    const out: Record<string, string>[] = []
    for (let i = rowIndex + 1; i < Math.min(data.length, rowIndex + 1 + limit); i++) {
      const row = data[i] || []
      const rec: Record<string, string> = {}
      sourceCols.forEach((srcCol, idx) => {
        const productCol = columnMappings[srcCol]
        if (productCol) rec[productCol] = String(row[colIndexes[idx]] ?? '').trim()
      })
      out.push(rec)
    }
    return out
  }

  if (sourceType === 'xml') {
    const text = new TextDecoder('utf-8').decode(buf)
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'text/xml')
    const rows = doc.querySelectorAll('row, Row, record, Record, item, Item, product, Product, DataRow')
    const out: Record<string, string>[] = []
    for (let r = 0; r < Math.min(rows.length, limit); r++) {
      const el = rows[r] as Element
      const rec: Record<string, string> = {}
      sourceCols.forEach((srcCol) => {
        const productCol = columnMappings[srcCol]
        if (!productCol) return
        const child = Array.from(el.children).find((c) => (c.getAttribute('name') || c.nodeName) === srcCol)
        const val = child?.textContent?.trim() ?? el.getAttribute(srcCol) ?? ''
        rec[productCol] = val
      })
      out.push(rec)
    }
    return out
  }

  return []
}

const tedarikcilerListDefaults = { search: '' }

export function SuppliersPage() {
  const [listState, setListState] = usePersistedListState('tedarikciler', tedarikcilerListDefaults)
  const { search } = listState
  const [data, setData] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null; onSuccess?: () => void }>({ open: false, id: null })
  const [error, setError] = useState<string | null>(null)
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([])
  const [currencies, setCurrencies] = useState<{ id: number; name: string; symbol?: string }[]>([])
  const [sourceHeaders, setSourceHeaders] = useState<string[]>([])
  const [headersLoading, setHeadersLoading] = useState(false)
  const [headersError, setHeadersError] = useState<string | null>(null)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testRecords, setTestRecords] = useState<Record<string, string>[]>([])
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [testSupplierName, setTestSupplierName] = useState('')

  const [listModalOpen, setListModalOpen] = useState(false)
  const [listRecords, setListRecords] = useState<Record<string, string>[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [listSupplierName, setListSupplierName] = useState('')
  const [listSupplierBrandId, setListSupplierBrandId] = useState<number | null>(null)
  const [listSupplierCurrencySymbol, setListSupplierCurrencySymbol] = useState<string>('')
  const [matchedCodes, setMatchedCodes] = useState<Set<string>>(new Set())
  const [listSearch, setListSearch] = useState('')
  const [listPage, setListPage] = useState(1)
  const [listMatchFilter, setListMatchFilter] = useState<'all' | 'matched' | 'unmatched'>('all')
  const LIST_PAGE_SIZE = 50

  const listFilteredData = useMemo(() => {
    if (listRecords.length === 0) return { filtered: [], totalPages: 1, currentPage: 1, pageRecords: [] }
    const searchLower = listSearch.trim().toLowerCase()
    let filtered = searchLower
      ? listRecords.filter((rec) =>
          Object.values(rec).some((v) => String(v || '').toLowerCase().includes(searchLower))
        )
      : listRecords
    if (listMatchFilter === 'matched') {
      filtered = filtered.filter((rec) => {
        const code = getRecordSupplierCode(rec)
        return code ? matchedCodes.has(code) : false
      })
    } else if (listMatchFilter === 'unmatched') {
      filtered = filtered.filter((rec) => {
        const code = getRecordSupplierCode(rec)
        return !code || !matchedCodes.has(code)
      })
    }
    const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE))
    const currentPage = Math.min(Math.max(1, listPage), totalPages)
    const start = (currentPage - 1) * LIST_PAGE_SIZE
    const pageRecords = filtered.slice(start, start + LIST_PAGE_SIZE)
    return { filtered, totalPages, currentPage, pageRecords }
  }, [listRecords, listSearch, listMatchFilter, listPage, matchedCodes])

  const hasFilter = search.length > 0

  const handleDeneme = useCallback(async (item: Supplier) => {
    const mappings = parseColumnMappings(item.column_mappings)
    if (Object.keys(mappings).length === 0) {
      toastError('Eşleştirme yok', 'Önce sütun eşleştirmesi yapın.')
      return
    }
    if (!item.source_file?.trim()) {
      toastError('Dosya yok', 'Kaynak dosya tanımlanmamış.')
      return
    }
    setTestModalOpen(true)
    setTestSupplierName(item.name)
    setTestRecords([])
    setTestError(null)
    setTestLoading(true)
    try {
      const records = await fetchSourceRecords(
        item.source_file,
        item.source_type || 'excel',
        item.header_row ?? 1,
        mappings,
        API_URL,
        5
      )
      setTestRecords(records)
      if (records.length === 0) setTestError('Kayıt bulunamadı')
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Dosya okunamadı')
      setTestRecords([])
    } finally {
      setTestLoading(false)
    }
  }, [])

  const handleListe = useCallback(async (item: Supplier) => {
    const mappings = parseColumnMappings(item.column_mappings)
    if (Object.keys(mappings).length === 0) {
      toastError('Eşleştirme yok', 'Önce sütun eşleştirmesi yapın.')
      return
    }
    if (!item.source_file?.trim()) {
      toastError('Dosya yok', 'Kaynak dosya tanımlanmamış.')
      return
    }
    setListModalOpen(true)
    setListSupplierName(item.name)
    setListSupplierBrandId(item.brand_id ?? null)
    setListSupplierCurrencySymbol(item.currency_symbol ?? '')
    setListRecords([])
    setListError(null)
    setListSearch('')
    setListPage(1)
    setListMatchFilter('all')
    setMatchedCodes(new Set())
    setListLoading(true)
    try {
      const [records, codesRes] = await Promise.all([
        fetchSourceRecords(item.source_file, item.source_type || 'excel', item.header_row ?? 1, mappings, API_URL, 10000),
        item.brand_id ? fetch(`${API_URL}/api/products/supplier-codes?brand_id=${item.brand_id}`) : Promise.resolve(null),
      ])
      setListRecords(records)
      if (codesRes?.ok) {
        const json = await codesRes.json()
        const codes = (json.codes || []).map((c: string | number) => normalizeSupplierCode(String(c ?? '')))
        setMatchedCodes(new Set(codes.filter(Boolean)))
      }
      if (records.length === 0) setListError('Kayıt bulunamadı')
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Dosya okunamadı')
      setListRecords([])
    } finally {
      setListLoading(false)
    }
  }, [])

  const loadSourceHeaders = useCallback(async () => {
    if (!form.source_file?.trim()) {
      setSourceHeaders([])
      return
    }
    setHeadersLoading(true)
    setHeadersError(null)
    try {
      const headers = await fetchSourceHeaders(
        form.source_file,
        form.source_type,
        form.header_row ?? 1,
        API_URL
      )
      setSourceHeaders(headers)
      if (headers.length === 0) setHeadersError('Başlık bulunamadı')
    } catch (err) {
      setSourceHeaders([])
      setHeadersError(err instanceof Error ? err.message : 'Dosya okunamadı')
    } finally {
      setHeadersLoading(false)
    }
  }, [form.source_file, form.source_type, form.header_row])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '9999' })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/suppliers?${params}`)
      const text = await res.text()
      let json: { data?: Supplier[]; error?: string }
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(res.status === 404 ? 'Suppliers API bulunamadı. Migration uygulandı mı? API deploy edildi mi?' : `Sunucu hatası (${res.status})`)
      }
      if (!res.ok) throw new Error(json?.error || `Yüklenemedi (${res.status})`)
      setData(json.data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [search])

  const fetchOptions = useCallback(async () => {
    try {
      const [bRes, cRes] = await Promise.all([
        fetch(`${API_URL}/api/product-brands?limit=9999`),
        fetch(`${API_URL}/api/product-currencies?limit=9999`),
      ])
      let b: { data?: { id: number; name: string }[] } = { data: [] }
      let c: { data?: { id: number; name: string; symbol?: string }[] } = { data: [] }
      if (bRes.ok) try { b = JSON.parse(await bRes.text()) } catch { /* ignore */ }
      if (cRes.ok) try { c = JSON.parse(await cRes.text()) } catch { /* ignore */ }
      setBrands((b.data || []).map((x) => ({ id: x.id, name: x.name })))
      setCurrencies((c.data || []).map((x) => ({ id: x.id, name: x.name, symbol: x.symbol })))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchData()
    fetchOptions()
  }, [fetchData, fetchOptions])

  const openNew = async () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
    try {
      const res = await fetch(`${API_URL}/api/suppliers/next-sort-order`)
      const text = await res.text()
      if (res.ok && text) {
        const json = JSON.parse(text)
        if (json.next != null) setForm((f) => ({ ...f, sort_order: json.next }))
      }
    } catch { /* ignore */ }
  }

  const openEdit = (item: Supplier) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      brand_id: item.brand_id ?? '',
      source_type: item.source_type || 'excel',
      currency_id: item.currency_id ?? '',
      source_file: item.source_file || '',
      header_row: item.header_row ?? 1,
      record_count: item.record_count ?? 0,
      column_mappings: item.column_mappings || '{}',
      column_types: item.column_types || '{}',
      sort_order: item.sort_order ?? 0,
      status: item.status ?? 1,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `${API_URL}/api/suppliers/${editingId}` : `${API_URL}/api/suppliers`
      const method = editingId ? 'PUT' : 'POST'
      const cleanMappings: Record<string, string> = {}
      Object.entries(parseColumnMappings(form.column_mappings)).forEach(([k, v]) => {
        if (k.trim() && v.trim()) cleanMappings[k.trim()] = v.trim()
      })
      const body = {
        ...form,
        brand_id: form.brand_id === '' ? undefined : Number(form.brand_id),
        currency_id: form.currency_id === '' ? undefined : Number(form.currency_id),
        column_mappings: Object.keys(cleanMappings).length > 0 ? stringifyColumnMappings(cleanMappings) : null,
        column_types: form.column_types || null,
        status: form.status,
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Tedarikçi güncellendi' : 'Tedarikçi eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  function openDeleteConfirm(id: number, onSuccess?: () => void) {
    setDeleteConfirm({ open: true, id, onSuccess })
  }

  async function executeDelete() {
    const { id, onSuccess } = deleteConfirm
    if (!id) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/suppliers/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Tedarikçi silindi', 'Tedarikçi başarıyla silindi.')
      setDeleteConfirm({ open: false, id: null })
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleting(false)
    }
  }

  const mappings = parseColumnMappings(form.column_mappings)

  return (
    <PageLayout
      title="Tedarikçiler"
      description="Tedarikçi kartları ve sütun eşleştirmeleri"
      backTo="/parametreler"
      showRefresh
      onRefresh={() => {
        setListState({ search: '' })
        fetchData()
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ara..."
              value={search}
              onChange={(e) => setListState({ search: e.target.value })}
              className="pl-8 w-48 h-9"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Tedarikçi Ekle
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yeni tedarikçi kartı</TooltipContent>
          </Tooltip>
          {hasFilter && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setListState({ search: '' })}>
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filtreleri sıfırla</TooltipContent>
            </Tooltip>
          )}
        </div>
      }
    >
      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Yükleniyor...</CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">{error}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Ekle kartı - her zaman ilk sırada */}
          <Card
            className="border-dashed cursor-pointer hover:bg-muted/50 transition-colors min-h-[140px] flex items-center justify-center"
            onClick={openNew}
          >
            <CardContent className="p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Plus className="h-10 w-10" />
              <span className="text-sm font-medium">Tedarikçi Ekle</span>
            </CardContent>
          </Card>

          {data.map((item) => {
            const itemMappings = parseColumnMappings(item.column_mappings)
            const mappingCount = Object.keys(itemMappings).length
            return (
              <Card
                key={item.id}
                className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openEdit(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                        <p className="font-medium truncate">{item.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {SOURCE_TYPES.find((t) => t.value === item.source_type)?.label || item.source_type}
                        {item.brand_name && ` • ${item.brand_name}`}
                        {item.currency_symbol && ` • ${item.currency_symbol}`}
                      </p>
                      {mappingCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {mappingCount} sütun eşleştirmesi
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {mappingCount > 0 && item.source_file && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleListe(item)}
                              >
                                <List className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Liste – kayıtları göster (eşleşenler vurgulu)</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDeneme(item)}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Deneme – eşleştirilmiş kayıtları oku</TooltipContent>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Düzenle</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); openDeleteConfirm(item.id) }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Sil</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'}</DialogTitle>
            <DialogDescription>
              Tedarikçi bilgileri ve kaynak dosya sütunlarını products tablosuyla eşleştirin.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tedarikçi Adı *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Örn: Tedarikçi A"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source_type">Kaynak Tipi</Label>
                <select
                  id="source_type"
                  value={form.source_type}
                  onChange={(e) => setForm((f) => ({ ...f, source_type: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brand_id">Marka</Label>
                <select
                  id="brand_id"
                  value={form.brand_id}
                  onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value ? Number(e.target.value) : '' }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seçiniz</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency_id">Para Birimi</Label>
                <select
                  id="currency_id"
                  value={form.currency_id}
                  onChange={(e) => setForm((f) => ({ ...f, currency_id: e.target.value ? Number(e.target.value) : '' }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seçiniz</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.symbol || ''})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FileOrLinkInput
                id="source_file"
                label="Kaynak Dosya"
                value={form.source_file}
                onChange={(v) => setForm((f) => ({ ...f, source_file: v }))}
                placeholder="Dosya yolu veya URL"
              />
              <div className="space-y-2">
                <Label htmlFor="header_row">Başlık Satırı</Label>
                <Input
                  id="header_row"
                  type="number"
                  min={1}
                  value={form.header_row}
                  onChange={(e) => setForm((f) => ({ ...f, header_row: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">
                  Kaynak dosyada başlıkların bulunduğu satır numarası (1 = ilk satır)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Sütun Eşleştirmesi (column_mappings)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadSourceHeaders}
                  disabled={!form.source_file?.trim() || headersLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${headersLoading ? 'animate-spin' : ''}`} />
                  {headersLoading ? 'Yükleniyor...' : 'Başlıkları Getir'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Önce kaynak dosyayı girin, Başlıkları Getir ile dosyadaki sütunları çekin. Kaynak sütun → products sütunu.
              </p>
              {headersError && <p className="text-xs text-destructive">{headersError}</p>}
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3 bg-muted/30">
                {Object.entries(mappings).map(([sourceCol, productCol], idx) => {
                  const sourceOptions = [...sourceHeaders]
                  if (sourceCol && !sourceOptions.includes(sourceCol) && sourceCol !== '__custom__') sourceOptions.unshift(sourceCol)
                  return (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={sourceCol}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '__custom__') {
                          const custom = prompt('Kaynak sütun adını girin:')
                          if (custom?.trim()) {
                            const next = { ...mappings }
                            delete next[sourceCol]
                            next[custom.trim()] = productCol
                            setForm((f) => ({ ...f, column_mappings: stringifyColumnMappings(next) }))
                          }
                          return
                        }
                        const next = { ...mappings }
                        delete next[sourceCol]
                        if (v) next[v] = productCol
                        setForm((f) => ({ ...f, column_mappings: stringifyColumnMappings(next) }))
                      }}
                      className="flex h-9 flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      <option value="">Kaynak sütun seçin</option>
                      {sourceOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option value="__custom__">— Özel (yaz) —</option>
                    </select>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <select
                      value={productCol}
                      onChange={(e) => {
                        const next = { ...mappings, [sourceCol]: e.target.value }
                        setForm((f) => ({ ...f, column_mappings: stringifyColumnMappings(next) }))
                      }}
                      className="flex h-9 w-36 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {PRODUCT_COLUMNS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => {
                        const next = { ...mappings }
                        delete next[sourceCol]
                        setForm((f) => ({ ...f, column_mappings: stringifyColumnMappings(next) }))
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  )
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = { ...mappings, '': '' }
                    setForm((f) => ({ ...f, column_mappings: stringifyColumnMappings(next) }))
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Eşleştirme Ekle
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="column_mappings_raw">column_mappings (JSON)</Label>
              <textarea
                id="column_mappings_raw"
                value={form.column_mappings}
                onChange={(e) => setForm((f) => ({ ...f, column_mappings: e.target.value }))}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder='{"Ürün Adı":"name","Fiyat":"price"}'
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeModal}>
                İptal
              </Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((p) => ({ ...p, open: o }))}
        description="Bu tedarikçiyi silmek istediğinize emin misiniz?"
        onConfirm={executeDelete}
        loading={deleting}
      />

      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Deneme – {testSupplierName}</DialogTitle>
            <DialogDescription>
              Kaynak dosyadan eşleştirilmiş alanlarla okunan ilk kayıtlar
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {testLoading ? (
              <p className="py-8 text-center text-muted-foreground">Yükleniyor...</p>
            ) : testError ? (
              <p className="py-8 text-center text-destructive">{testError}</p>
            ) : testRecords.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Kayıt bulunamadı</p>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {testRecords[0] && Object.keys(testRecords[0]).map((col) => (
                        <th
                          key={col}
                          className={`p-2 font-medium tabular-nums ${NUMERIC_COLUMNS.includes(col) ? 'text-right' : 'text-left'} ${(col === 'sku' || col === 'erpcode') ? 'font-mono' : ''}`}
                        >
                          {PRODUCT_COLUMNS.find((c) => c.value === col)?.label || col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {testRecords.map((rec, idx) => (
                      <tr key={idx} className="border-b hover:bg-muted/30">
                        {Object.entries(rec).map(([col, val]) => (
                          <td
                            key={col}
                            className={`p-2 tabular-nums ${NUMERIC_COLUMNS.includes(col) ? 'text-right' : 'text-left'} ${col === 'price' ? 'font-bold' : ''} ${(col === 'sku' || col === 'erpcode') ? 'font-mono text-sm' : ''}`}
                          >
                            {formatCellValue(col, val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestModalOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={listModalOpen} onOpenChange={(open) => { setListModalOpen(open); if (!open) { setListSearch(''); setListPage(1); setListMatchFilter('all') } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Liste – {listSupplierName}</DialogTitle>
            <DialogDescription>
              Kaynak dosyadan okunan kayıtlar (en fazla 10.000). Excel erpcode ile products.supplier_code eşleşenler yeşil arka planla gösterilir.
              {!listLoading && listRecords.length > 0 && !listSupplierBrandId && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Eşleşme için tedarikçiye marka atayın.
                </span>
              )}
            </DialogDescription>
            {!listLoading && !listError && listRecords.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <div
                  role="group"
                  aria-label="Eşleşme filtresi"
                  className="inline-flex rounded-md border border-input bg-muted/30 p-0.5"
                >
                  {(['all', 'matched', 'unmatched'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={listMatchFilter === f}
                      aria-label={f === 'all' ? 'Tümü' : f === 'matched' ? 'Eşleşmiş' : 'Eşleşmemiş'}
                      className={`h-8 px-3 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                        listMatchFilter === f
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => { setListMatchFilter(f); setListPage(1) }}
                    >
                      {f === 'all' ? 'Tümü' : f === 'matched' ? 'Eşleşmiş' : 'Eşleşmemiş'}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ara (herhangi bir sütunda)..."
                    value={listSearch}
                    onChange={(e) => { setListSearch(e.target.value); setListPage(1) }}
                    className="pl-8 h-9"
                  />
                </div>
              </div>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0 border rounded-md">
            {listLoading ? (
              <p className="py-8 text-center text-muted-foreground">Yükleniyor...</p>
            ) : listError ? (
              <p className="py-8 text-center text-destructive">{listError}</p>
            ) : listRecords.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Kayıt bulunamadı</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="sticky top-0 z-10 bg-muted/95 backdrop-blur p-2 font-medium w-8 text-center border-b">✓</th>
                    {listRecords[0] && Object.keys(listRecords[0]).map((col) => (
                      <th
                        key={col}
                        className={`sticky top-0 z-10 bg-muted/95 backdrop-blur p-2 font-medium tabular-nums border-b ${NUMERIC_COLUMNS.includes(col) ? 'text-right' : 'text-left'} ${(col === 'sku' || col === 'erpcode') ? 'font-mono' : ''}`}
                      >
                        {PRODUCT_COLUMNS.find((c) => c.value === col)?.label || col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listFilteredData.pageRecords.map((rec, idx) => {
                    const code = getRecordSupplierCode(rec)
                    const isMatched = code ? matchedCodes.has(code) : false
                    const start = (listFilteredData.currentPage - 1) * LIST_PAGE_SIZE
                    return (
                      <tr
                        key={start + idx}
                        className={`border-b hover:bg-muted/30 ${isMatched ? 'bg-emerald-100 dark:bg-emerald-950/40' : ''}`}
                      >
                        <td className="p-2 text-center">
                          {isMatched ? (
                            <span className="text-green-600 font-bold" title="Ürünlerde eşleşme var">✓</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {Object.entries(rec).map(([col, val]) => (
                          <td
                            key={col}
                            className={`p-2 tabular-nums ${NUMERIC_COLUMNS.includes(col) ? 'text-right' : 'text-left'} ${col === 'price' ? 'font-bold' : ''} ${(col === 'sku' || col === 'erpcode') ? 'font-mono text-sm' : ''}`}
                          >
                            {col === 'price' && listSupplierCurrencySymbol
                              ? `${formatCellValue(col, val)} ${listSupplierCurrencySymbol}`.trim()
                              : formatCellValue(col, val)}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between gap-4">
            <div className="flex items-center justify-start gap-4">
              {!listLoading && !listError && listRecords.length > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {listSearch.trim() || listMatchFilter !== 'all'
                      ? `${listFilteredData.filtered.length} / ${listRecords.length} kayıt`
                      : `${listRecords.length} kayıt`}
                    {listRecords.length >= 10000 && ' (limit)'}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setListPage((p) => Math.max(1, p - 1))}
                      disabled={listFilteredData.currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm tabular-nums min-w-[80px] text-center">
                      {listFilteredData.currentPage} / {listFilteredData.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setListPage((p) => Math.min(listFilteredData.totalPages, p + 1))}
                      disabled={listFilteredData.currentPage >= listFilteredData.totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
            <Button variant="outline" onClick={() => setListModalOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
