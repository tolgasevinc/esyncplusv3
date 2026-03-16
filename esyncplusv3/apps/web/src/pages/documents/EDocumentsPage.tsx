import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, FileText, Inbox, Send, Archive, LayoutGrid, Upload, Loader2, Share2, FileDown, Printer, ArrowUp, ArrowDown, ArrowUpDown, Trash2, SquarePen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { API_URL } from '@/lib/api'
import { toastSuccess, toastError } from '@/lib/toast'
import {
  parseInvoiceHeader,
  buildFallbackInvoiceHtml,
  getEdocumentStoragePath,
  type InvoiceHeaderInfo,
} from '@/lib/ublInvoiceParser'
import {
  renderXmlToHtml,
  type ContentApiResponse,
} from '@/lib/xsltClient'
import { cn, formatDate, formatPrice } from '@/lib/utils'

type DocFilter = 'gelen' | 'giden' | 'arsiv' | 'tumu'

interface EDocument {
  id: number
  uuid?: string
  invoice_no?: string
  type: 'gelen' | 'giden' | 'arsiv'
  status: 'active' | 'archived'
  date: string
  sender?: string
  receiver?: string
  amount?: number
  currency?: string
  description?: string
  directory?: string
  file_name?: string
}

type SortBy = 'date' | 'amount' | 'invoice_no' | 'description'
type SortOrder = 'asc' | 'desc'
const docFilterDefaults = {
  search: '',
  filter: 'tumu' as DocFilter,
  filterYear: '' as string,
  filterMonth: '' as string,
  sortBy: 'date' as SortBy,
  sortOrder: 'desc' as SortOrder,
  page: 1,
  pageSize: 'fit' as PageSizeValue,
  fitLimit: 10,
}

const MONTHS = [
  { value: '01', label: 'Ocak' }, { value: '02', label: 'Şubat' }, { value: '03', label: 'Mart' },
  { value: '04', label: 'Nisan' }, { value: '05', label: 'Mayıs' }, { value: '06', label: 'Haziran' },
  { value: '07', label: 'Temmuz' }, { value: '08', label: 'Ağustos' }, { value: '09', label: 'Eylül' },
  { value: '10', label: 'Ekim' }, { value: '11', label: 'Kasım' }, { value: '12', label: 'Aralık' },
]

interface PreviewItem {
  header: InvoiceHeaderInfo
  htmlPreview?: string
  xsltError?: string
  /** Upload için dosyalar */
  xmlFile: File
  xsltFile?: File
}

function getBaseName(fileName: string): string {
  return fileName.replace(/\.(xml|xslt|xsl)$/i, '')
}


/** HTML'in anlamlı içerik içerip içermediğini kontrol eder (boş/beyaz sayfa önlemi) */
function hasMeaningfulContent(html: string): boolean {
  if (!html || html.trim().length < 50) return false
  // <body> varsa içeriğini al, yoksa tüm HTML'i kullan (DOMPurify body tagini kaldırabilir)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodyContent = (bodyMatch?.[1] ?? html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .trim()
  return bodyContent.length > 50
}

/** XSLT çıktısındaki QRCode hatasını önlemek için fallback ekler (GİB şablonu makeCode kullanır) */
function wrapInvoiceHtmlWithFallbacks(html: string): string {
  const qrFallback = `<script>
(function(){if(typeof QRCode==='undefined'){window.QRCode=function(el,o){var r={makeCode:function(t){try{if(el&&el.appendChild){var d=document.createElement('div');d.style.cssText='width:80px;height:80px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999';d.textContent='QR';el.innerHTML='';el.appendChild(d);}}catch(e){}}};r.CorrectLevel={L:1,M:0,Q:3,H:2};return r;};}}());
<\/script>`
  if (html.includes('<head>')) {
    return html.replace('<head>', '<head>' + qrFallback)
  }
  if (html.includes('<html')) {
    return html.replace(/<html[^>]*>/i, (m) => m + qrFallback)
  }
  return qrFallback + html
}

export function EDocumentsPage() {
  const [listState, setListState] = usePersistedListState('e-documents', docFilterDefaults)
  const { search, filter, filterYear, filterMonth, sortBy, sortOrder, page, pageSize, fitLimit } = listState
  const [data, setData] = useState<EDocument[]>([])
  const [total, setTotal] = useState(0)
  const [totalAmountTry, setTotalAmountTry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [previewLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{
    fileIndex: number
    total: number
    fileName: string
    step: 'storage' | 'db' | 'done'
    success: number
    failed: number
  } | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadFileResults, setUploadFileResults] = useState<{
    name: string
    status: 'pending' | 'uploading' | 'done' | 'failed'
    error?: string
  }[]>([])
  const [overwriteModalOpen, setOverwriteModalOpen] = useState(false)
  const [existingFiles, setExistingFiles] = useState<string[]>([])
  const existingKeysRef = useRef<string[]>([])
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<EDocument | null>(null)
  const [viewHtml, setViewHtml] = useState<string | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editDoc, setEditDoc] = useState<EDocument | null>(null)
  const [editSender, setEditSender] = useState('')
  const [editReceiver, setEditReceiver] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadModalCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const hasFilter = search.length > 0 || filter !== 'tumu' || filterYear !== '' || filterMonth !== ''
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchAvailableYears = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/e-documents/years`).catch(() => null)
      if (res?.ok) {
        const json = await res.json()
        setAvailableYears(Array.isArray(json.years) ? json.years : [])
      } else {
        setAvailableYears([])
      }
    } catch {
      setAvailableYears([])
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), sort_by: sortBy, sort_order: sortOrder })
      if (search) params.set('search', search)
      if (filter !== 'tumu') params.set('filter', filter)
      if (filterYear) params.set('year', filterYear)
      if (filterMonth) params.set('month', filterMonth)
      const res = await fetch(`${API_URL}/api/e-documents?${params}`).catch(() => null)
      if (res?.ok) {
        const json = await res.json()
        setData(json.data || [])
        setTotal(json.total ?? 0)
        setTotalAmountTry(json.total_amount_try ?? 0)
      } else {
        setData([])
        setTotal(0)
        setTotalAmountTry(0)
      }
    } catch {
      setData([])
      setTotal(0)
      setTotalAmountTry(0)
    } finally {
      setLoading(false)
    }
  }, [page, search, filter, filterYear, filterMonth, limit, sortBy, sortOrder])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    fetchAvailableYears()
  }, [fetchAvailableYears])

  useEffect(() => () => {
    highlightTimeoutRef.current && clearTimeout(highlightTimeoutRef.current)
  }, [])

  const handleRefresh = () => {
    setListState({ search: '', filter: 'tumu', filterYear: '', filterMonth: '', page: 1 })
    setSelectedIds(new Set())
    fetchData()
  }

  const toggleSelection = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openEditModal = (item: EDocument, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditDoc(item)
    setEditSender(item.sender ?? '')
    setEditReceiver(item.receiver ?? '')
    setEditModalOpen(true)
  }

  const handleEditSave = async () => {
    if (!editDoc) return
    setEditSaving(true)
    try {
      const body: { seller_title?: string; buyer_title?: string } = {
        seller_title: editSender,
        buyer_title: editReceiver,
      }
      const res = await fetch(`${API_URL}/api/e-documents/${editDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        toastSuccess('Güncellendi', 'Gönderen/Alıcı bilgisi kaydedildi.')
        setEditModalOpen(false)
        const id = editDoc.id
        setEditDoc(null)
        setData((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, sender: editSender, receiver: editReceiver } : d
          )
        )
        setHighlightedId(id)
        highlightTimeoutRef.current && clearTimeout(highlightTimeoutRef.current)
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedId(null)
          highlightTimeoutRef.current = null
        }, 2500)
      } else {
        toastError('Güncelleme hatası', json?.error || res.statusText)
      }
    } catch (err) {
      toastError('Güncelleme hatası', err instanceof Error ? err.message : 'Bilinmeyen hata')
    } finally {
      setEditSaving(false)
    }
  }

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/e-documents`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const json = await res.json()
      if (res.ok) {
        toastSuccess('Silindi', `${json.deleted ?? ids.length} kayıt silindi.`)
        setSelectedIds(new Set())
        setDeleteModalOpen(false)
        fetchData()
      } else {
        toastError('Silme hatası', json?.error || res.statusText)
      }
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Bilinmeyen hata')
    } finally {
      setDeleting(false)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer?.files
    if (files?.length) uploadFilesDirectly(files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const performUpload = async (itemsToUpload?: PreviewItem[]) => {
    const source = itemsToUpload ?? previewItems
    if (source.length === 0 || uploading) return
    setOverwriteModalOpen(false)
    setUploading(true)
    const uploadItems = source.filter((i) => !i.header.rawError)
    const total = uploadItems.length
    let success = 0
    let failed = 0
    try {
      for (let idx = 0; idx < uploadItems.length; idx++) {
        const item = uploadItems[idx]
        const fileName = item.xmlFile.name

        setUploadProgress({ fileIndex: idx, total, fileName, step: 'storage', success, failed })

        const h = item.header
        const metadata = {
          invoiceId: h.invoiceId,
          issueDate: h.issueDate,
          supplierName: h.supplierName,
          customerName: h.customerName,
          payableAmount: h.payableAmount,
          taxValue: h.taxValue,
          taxRate: h.taxRate,
          invoiceType: h.invoiceType,
          uuid: h.uuid,
          currency: h.currency || 'TRY',
        }
        const formData = new FormData()
        formData.append('file', item.xmlFile)
        formData.append('metadata', JSON.stringify(metadata))
        if (item.xsltFile) formData.append('xsltFile', item.xsltFile)

        const res = await fetch(`${API_URL}/api/e-documents/upload`, {
          method: 'POST',
          body: formData,
        })
        const json = await res.json()

        // Storage bitti, kısa süre DB adımını göster
        setUploadProgress({ fileIndex: idx, total, fileName, step: 'db', success, failed })
        await new Promise((r) => setTimeout(r, 250))

        if (res.ok && json.path) {
          success++
        } else {
          failed++
        }
      }

      setUploadProgress({ fileIndex: total, total, fileName: '', step: 'done', success, failed })
      await new Promise((r) => setTimeout(r, 800))

      if (success > 0) {
        toastSuccess('Yükleme tamamlandı', `${success} dosya e-documents klasörüne kaydedildi.${failed > 0 ? ` ${failed} başarısız.` : ''}`)
        setPreviewModalOpen(false)
        setPreviewItems([])
        fetchData()
        fetchAvailableYears()
      }
      if (failed > 0 && success === 0) {
        toastError('Yükleme hatası', 'Dosyalar yüklenemedi.')
      }
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Bilinmeyen hata')
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  const getTargetKey = (folder: string, fileName: string): string => {
    const baseName = fileName.replace(/\.[^.]+$/, '')
    const ext = fileName.split('.').pop()?.toLowerCase() || 'xml'
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file'
    const finalName = `${safeName}.${ext}`
    return `${folder.replace(/\/+$/, '')}/${finalName}`
  }

  const handleDoUpload = async () => {
    if (previewItems.length === 0 || uploading) return
    const keysToCheck: string[] = []
    for (const item of previewItems) {
      if (item.header.rawError) continue
      const folder = getEdocumentStoragePath(item.header.invoiceType, item.header.issueDate)
      keysToCheck.push(getTargetKey(folder, item.xmlFile.name))
      if (item.xsltFile) {
        keysToCheck.push(getTargetKey(folder, item.xsltFile.name))
      }
    }
    if (keysToCheck.length === 0) return
    try {
      const res = await fetch(`${API_URL}/storage/check-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: keysToCheck }),
      })
      const json = await res.json()
      const existing: string[] = json?.existing ?? []
      if (existing.length > 0) {
        existingKeysRef.current = existing
        setExistingFiles(existing.map((k: string) => k.split('/').pop() ?? k))
        setOverwriteModalOpen(true)
        return
      }
    } catch {
      /* devam et */
    }
    await performUpload()
  }

  /** Önizleme göstermeden doğrudan yükler */
  const uploadFilesDirectly = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.name.match(/\.(xml|xslt|xsl)$/i))
    if (!fileArray.length) return

    // XML/XSLT'leri base isimle eşleştir
    const byBase = new Map<string, { xml?: File; xslt?: File }>()
    for (const f of fileArray) {
      const base = getBaseName(f.name)
      const ext = f.name.split('.').pop()?.toLowerCase()
      const entry = byBase.get(base) ?? {}
      if (ext === 'xml') entry.xml = f
      else if (ext === 'xslt' || ext === 'xsl') entry.xslt = f
      byBase.set(base, entry)
    }
    const xmlEntries = Array.from(byBase.values()).filter((v) => v.xml)
    if (!xmlEntries.length) return

    // Metadata parse (hızlı, HTML yok)
    const queue: { header: ReturnType<typeof parseInvoiceHeader>; xmlFile: File; xsltFile?: File }[] = []
    for (const entry of xmlEntries) {
      if (!entry.xml) continue
      const xmlText = await entry.xml.text()
      const header = parseInvoiceHeader(xmlText, entry.xml.name)
      queue.push({ header, xmlFile: entry.xml, xsltFile: entry.xslt })
    }

    if (uploadModalCloseTimeoutRef.current) {
      clearTimeout(uploadModalCloseTimeoutRef.current)
      uploadModalCloseTimeoutRef.current = null
    }
    const initialResults = queue.map((q) => ({ name: q.xmlFile.name, status: 'pending' as const }))
    setUploadFileResults(initialResults)
    setUploadModalOpen(true)

    // Üzerine yazma kontrolü
    const keysToCheck: string[] = []
    for (const q of queue) {
      if (q.header.rawError) continue
      const folder = getEdocumentStoragePath(q.header.invoiceType, q.header.issueDate)
      keysToCheck.push(getTargetKey(folder, q.xmlFile.name))
      if (q.xsltFile) keysToCheck.push(getTargetKey(folder, q.xsltFile.name))
    }
    if (keysToCheck.length > 0) {
      try {
        const res = await fetch(`${API_URL}/storage/check-keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: keysToCheck }),
        })
        const json = await res.json()
        const existing: string[] = json?.existing ?? []
        if (existing.length > 0) {
          existingKeysRef.current = existing
          setExistingFiles(existing.map((k: string) => k.split('/').pop() ?? k))
          setOverwriteModalOpen(true)
          pendingDirectUploadRef.current = queue
          return
        }
      } catch { /* devam */ }
    }

    await performDirectUpload(queue)
  }

  const pendingDirectUploadRef = useRef<{ header: ReturnType<typeof parseInvoiceHeader>; xmlFile: File; xsltFile?: File }[]>([])

  const performDirectUpload = async (
    queue: { header: ReturnType<typeof parseInvoiceHeader>; xmlFile: File; xsltFile?: File }[]
  ) => {
    const validQueue = queue.filter((q) => !q.header.rawError)
    const total = validQueue.length
    let success = 0
    let failed = 0
    setUploading(true)

    const results = queue.map((q) => ({
      name: q.xmlFile.name,
      status: (q.header.rawError ? 'failed' : 'pending') as 'pending' | 'uploading' | 'done' | 'failed',
      error: q.header.rawError,
    }))
    setUploadFileResults([...results])

    for (let idx = 0; idx < validQueue.length; idx++) {
      const q = validQueue[idx]
      const queueIdx = queue.findIndex((x) => x.xmlFile === q.xmlFile)

      results[queueIdx] = { name: q.xmlFile.name, status: 'uploading', error: undefined }
      setUploadFileResults([...results])
      setUploadProgress({ fileIndex: idx, total, fileName: q.xmlFile.name, step: 'storage', success, failed })

      try {
        const h = q.header
        const metadata = {
          invoiceId: h.invoiceId,
          issueDate: h.issueDate,
          supplierName: h.supplierName,
          customerName: h.customerName,
          payableAmount: h.payableAmount,
          taxValue: h.taxValue,
          taxRate: h.taxRate,
          invoiceType: h.invoiceType,
          uuid: h.uuid,
          currency: h.currency || 'TRY',
        }
        const formData = new FormData()
        formData.append('file', q.xmlFile)
        formData.append('metadata', JSON.stringify(metadata))
        if (q.xsltFile) formData.append('xsltFile', q.xsltFile)

        const res = await fetch(`${API_URL}/api/e-documents/upload`, { method: 'POST', body: formData })
        const json = await res.json()

        setUploadProgress({ fileIndex: idx, total, fileName: q.xmlFile.name, step: 'db', success, failed })
        await new Promise((r) => setTimeout(r, 200))

        if (res.ok && json.path) {
          success++
          results[queueIdx] = { name: q.xmlFile.name, status: 'done', error: undefined }
        } else {
          failed++
          results[queueIdx] = { name: q.xmlFile.name, status: 'failed', error: json?.error || 'Hata' }
        }
      } catch (err) {
        failed++
        results[queueIdx] = { name: q.xmlFile.name, status: 'failed', error: err instanceof Error ? err.message : 'Hata' }
      }
      setUploadFileResults([...results])
    }

    setUploadProgress({ fileIndex: total, total, fileName: '', step: 'done', success, failed })
    await new Promise((r) => setTimeout(r, 600))

    setUploading(false)
    setUploadProgress(null)

    uploadModalCloseTimeoutRef.current = setTimeout(() => {
      uploadModalCloseTimeoutRef.current = null
      setUploadModalOpen(false)
    }, 5000)

    if (success > 0) {
      toastSuccess('Yükleme tamamlandı', `${success} dosya kaydedildi.${failed > 0 ? ` ${failed} başarısız.` : ''}`)
      fetchData()
      fetchAvailableYears()
    }
    if (failed > 0 && success === 0) {
      toastError('Yükleme hatası', 'Hiçbir dosya yüklenemedi.')
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    await uploadFilesDirectly(files)
    e.target.value = ''
  }

  const handleRowClick = async (item: EDocument) => {
    if (!item.directory || !item.file_name) return
    const key = `${item.directory}${item.file_name}`
    setSelectedDoc(item)
    setViewModalOpen(true)
    setViewHtml(null)
    setViewLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/e-documents/content?key=${encodeURIComponent(key)}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toastError('Önizleme hatası', json?.error || res.statusText)
        setViewModalOpen(false)
        return
      }
      const api: ContentApiResponse = await res.json()
      if (api.error) {
        toastError('Önizleme hatası', api.error)
        return
      }
      if (api.html) {
        setViewHtml(wrapInvoiceHtmlWithFallbacks(api.html))
        return
      }
      if (!api.xml) {
        toastError('Önizleme hatası', 'XML alınamadı')
        return
      }
      const { html, error } = await renderXmlToHtml(api.xml, api)
      if (error || !html || !hasMeaningfulContent(html)) {
        const header = parseInvoiceHeader(api.xml, item.file_name || 'fatura.xml')
        setViewHtml(buildFallbackInvoiceHtml(header))
      } else {
        setViewHtml(wrapInvoiceHtmlWithFallbacks(html))
      }
    } catch (err) {
      toastError('Önizleme hatası', err instanceof Error ? err.message : 'Bilinmeyen hata')
      setViewModalOpen(false)
    } finally {
      setViewLoading(false)
    }
  }

  const handlePaylas = async () => {
    if (!selectedDoc) return
    const shareUrl = `${window.location.origin}${window.location.pathname}?doc=${selectedDoc.id}`
    try {
      if (navigator.share) {
        await navigator.share({
          title: `E-Fatura: ${selectedDoc.description || selectedDoc.invoice_no || 'Belge'}`,
          url: shareUrl,
        })
        toastSuccess('Paylaşıldı', 'Belge paylaşıldı.')
      } else {
        await navigator.clipboard.writeText(shareUrl)
        toastSuccess('Link kopyalandı', 'Panoya kopyalandı.')
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toastError('Paylaşım hatası', err instanceof Error ? err.message : 'Bilinmeyen hata')
      }
    }
  }

  const handlePdfKaydet = () => {
    if (!viewHtml) return
    const printWin = window.open('', '_blank')
    if (!printWin) {
      toastError('PDF Kaydet', 'Popup engellendi. Lütfen tarayıcı ayarlarından izin verin.')
      return
    }
    printWin.document.write(wrapInvoiceHtmlWithFallbacks(viewHtml))
    printWin.document.close()
    printWin.focus()
    setTimeout(() => {
      printWin.print()
      printWin.close()
    }, 250)
  }

  const handleYazdir = () => {
    handlePdfKaydet()
  }

  const logoNode = (
    <>
      {!logoError ? (
        <img
          src="/logo-gib.png"
          alt="GİB"
          className="w-full h-full object-contain"
          onError={() => setLogoError(true)}
        />
      ) : (
        <FileText className="w-5 h-5 text-muted-foreground" />
      )}
    </>
  )

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setListState({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc', page: 1 })
    } else {
      setListState({ sortBy: col, sortOrder: 'asc', page: 1 })
    }
  }

  const SortIcon = ({ col }: { col: SortBy }) =>
    sortBy === col ? (
      sortOrder === 'asc' ? (
        <ArrowUp className="h-3.5 w-3.5" />
      ) : (
        <ArrowDown className="h-3.5 w-3.5" />
      )
    ) : (
      <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
    )

  const filterButtons: { value: DocFilter; label: string; icon: React.ReactNode }[] = [
    { value: 'gelen', label: 'Gelen', icon: <Inbox className="h-4 w-4" /> },
    { value: 'giden', label: 'Giden', icon: <Send className="h-4 w-4" /> },
    { value: 'arsiv', label: 'Arşiv', icon: <Archive className="h-4 w-4" /> },
    { value: 'tumu', label: 'Tümü', icon: <LayoutGrid className="h-4 w-4" /> },
  ]

  return (
    <PageLayout
      title="E-Dökümanlar"
      description="E-fatura ve e-arşiv belgeleri"
      logo={logoNode}
      contentRef={contentRef}
      showRefresh
      onRefresh={handleRefresh}
      headerActions={
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.xslt,.xsl"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'flex items-center gap-2 rounded-lg border-2 border-dashed px-4 py-2 transition-colors cursor-pointer min-w-[140px] justify-center',
              isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
            )}
            onClick={handleUploadClick}
          >
            <Upload className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{isDragOver ? 'Bırakın...' : 'Sürükle bırak'}</span>
          </div>
          <div className="flex items-center rounded-md border bg-muted/50 p-0.5">
            {filterButtons.map(({ value, label, icon }) => (
              <Button
                key={value}
                type="button"
                variant={filter === value ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'h-8 px-3 text-xs gap-1.5',
                  filter === value && 'ring-1 ring-primary/50 font-semibold'
                )}
                onClick={() => setListState({ filter: value, page: 1 })}
              >
                {icon}
                {label}
              </Button>
            ))}
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[90px]"
            value={filterYear}
            onChange={(e) => setListState({ filterYear: e.target.value, filterMonth: '', page: 1 })}
          >
            <option value="">Yıl</option>
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          <select
            className={cn('h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[100px]', !filterYear && 'opacity-60 cursor-not-allowed')}
            value={filterMonth}
            onChange={(e) => setListState({ filterMonth: e.target.value, page: 1 })}
            disabled={!filterYear}
          >
            <option value="">Ay</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ara..."
              value={search}
              onChange={(e) => setListState({ search: e.target.value, page: 1 })}
              className="pl-8 w-48 h-9"
            />
          </div>
          {selectedIds.size > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => setDeleteModalOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Seçilenleri Sil ({selectedIds.size})
            </Button>
          )}
        </div>
      }
      footerContent={
        <TablePaginationFooter
          total={total}
          page={page}
          pageSize={pageSize}
          fitLimit={fitLimit}
          onPageChange={(p) => setListState({ page: p })}
          onPageSizeChange={(s) => setListState({ pageSize: s, page: 1 })}
          onFitLimitChange={(v) => setListState({ fitLimit: v })}
          tableContainerRef={contentRef}
          hasFilter={hasFilter}
        />
      }
    >
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-14rem)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky top-0 z-10 bg-muted/95 backdrop-blur w-10 p-3">
                    <input
                      type="checkbox"
                      checked={data.length > 0 && data.every((d) => selectedIds.has(d.id))}
                      onChange={(e) => {
                        const allIds = data.map((d) => d.id)
                        setSelectedIds(e.target.checked ? new Set(allIds) : new Set())
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-pointer"
                    />
                  </th>
                  <th
                    className="sticky top-0 z-10 bg-muted/95 backdrop-blur text-left p-3 font-medium cursor-pointer hover:bg-muted/70 select-none"
                    onClick={() => handleSort('date')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Tarih
                      <SortIcon col="date" />
                    </span>
                  </th>
                  <th className="sticky top-0 z-10 bg-muted/95 backdrop-blur text-left p-3 font-medium">Tür</th>
                  <th className="sticky top-0 z-10 bg-muted/95 backdrop-blur text-left p-3 font-medium">Gönderen / Alıcı</th>
                  <th
                    className="sticky top-0 z-10 bg-muted/95 backdrop-blur text-right p-3 font-medium cursor-pointer hover:bg-muted/70 select-none"
                    onClick={() => handleSort('amount')}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Tutar
                      <SortIcon col="amount" />
                    </span>
                  </th>
                  <th
                    className="sticky top-0 z-10 bg-muted/95 backdrop-blur text-left p-3 font-medium cursor-pointer hover:bg-muted/70 select-none"
                    onClick={() => handleSort('description')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Açıklama
                      <SortIcon col="description" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Henüz e-döküman kaydı yok. Sürükle bırak alanına dosya bırakın veya Yükle ile fatura yükleyebilirsiniz.
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        'border-b hover:bg-muted/30 cursor-pointer',
                        selectedIds.has(item.id) && 'bg-muted/50',
                        highlightedId === item.id && 'animate-row-highlight'
                      )}
                      onClick={() => handleRowClick(item)}
                    >
                      <td className="p-3" onClick={(e) => toggleSelection(item.id, e)}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="p-3">{formatDate(item.date)}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded text-xs font-medium',
                            item.type === 'gelen'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                              : item.type === 'arsiv'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          )}
                        >
                          {item.type === 'gelen' ? 'Gelen' : item.type === 'arsiv' ? 'Arşiv' : 'Giden'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-500/15"
                            onClick={(e) => openEditModal(item, e)}
                            title="Gönderen/Alıcı düzenle"
                          >
                            <SquarePen className="h-4 w-4" />
                          </Button>
                          <span>{item.type === 'gelen' ? item.sender : item.receiver}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {item.amount != null ? `${item.amount.toLocaleString('tr-TR')} ${item.currency || 'TRY'}` : '—'}
                      </td>
                      <td className="p-3 text-muted-foreground truncate max-w-[200px]">{item.description || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {!loading && data.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/50 font-semibold">
                    <td colSpan={4} className="p-3 text-right">
                      Toplam (vergiler dahil ödenecek TL):
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatPrice(totalAmountTry)} TRY
                    </td>
                    <td className="p-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editModalOpen} onOpenChange={(open) => { if (!open) setEditModalOpen(false); setEditDoc(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gönderen / Alıcı Düzenle</DialogTitle>
            <DialogDescription>
              {editDoc?.invoice_no && `Fatura No: ${editDoc.invoice_no}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Gönderen (Satıcı)</label>
              <Input
                value={editSender}
                onChange={(e) => setEditSender(e.target.value)}
                placeholder="Satıcı adı"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Alıcı (Müşteri)</label>
              <Input
                value={editReceiver}
                onChange={(e) => setEditReceiver(e.target.value)}
                placeholder="Müşteri adı"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)} disabled={editSaving}>
              İptal
            </Button>
            <Button type="button" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Kaydediliyor...</> : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Toplu Silme</DialogTitle>
            <DialogDescription>
              {selectedIds.size} kayıt silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>
              İptal
            </Button>
            <Button type="button" variant="destructive" onClick={handleBatchDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Siliniyor...
                </>
              ) : (
                'Sil'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Fatura Önizleme</DialogTitle>
            <DialogDescription>
              XML + XSLT ile HTML önizleme. Aynı isimde .xml ve .xslt/.xsl dosyaları birlikte kullanılır.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto py-2 min-h-[200px]">
            {previewLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Faturalar işleniyor...</p>
                <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full w-1/3 bg-primary rounded-full"
                    style={{ animation: 'loading-slider 1.5s ease-in-out infinite' }}
                  />
                </div>
              </div>
            ) : previewItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz dosya seçilmedi.</p>
            ) : (
              <div className="space-y-6">
                {previewItems.map((item, idx) => {
                  const { header: h, htmlPreview, xsltError } = item
                  return (
                    <div key={idx} className="rounded-lg border overflow-hidden bg-background">
                      <div
                        className={cn(
                          'p-3 border-b text-sm',
                          h.rawError ? 'border-destructive/50 bg-destructive/5' : 'bg-muted/30'
                        )}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground truncate">{h.fileName}</span>
                          {h.invoiceType && (
                            <span
                              className={cn(
                                'inline-flex px-2 py-0.5 rounded text-xs font-medium shrink-0',
                                h.invoiceType === 'gelen' &&
                                  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                                h.invoiceType === 'giden' &&
                                  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                                h.invoiceType === 'earsiv' &&
                                  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                              )}
                            >
                              {h.invoiceType === 'gelen' && 'Gelen E-Fatura'}
                              {h.invoiceType === 'giden' && 'Giden E-Fatura'}
                              {h.invoiceType === 'earsiv' && 'E-Arşiv Fatura'}
                            </span>
                          )}
                        </div>
                        {h.rawError ? (
                          <p className="text-destructive font-medium mt-1">{h.rawError}</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-muted-foreground text-xs">
                            {h.invoiceId && (
                              <span>
                                Fatura No: <span className="text-foreground">{h.invoiceId}</span>
                              </span>
                            )}
                            {h.issueDate && (
                              <span>
                                Tarih: <span className="text-foreground">{h.issueDate}</span>
                              </span>
                            )}
                            {h.supplierName && (
                              <span className="col-span-2">
                                Satıcı: <span className="text-foreground">{h.supplierName}</span>
                                {h.supplierId && (
                                  <span className="text-muted-foreground"> ({h.supplierId})</span>
                                )}
                              </span>
                            )}
                            {h.payableAmount != null && (
                              <span>
                                Toplam:{' '}
                                <span className="text-foreground font-semibold">
                                  {h.payableAmount} {h.currency || 'TRY'}
                                </span>
                              </span>
                            )}
                          </div>
                        )}
                        {xsltError && (
                          <p className="text-destructive text-xs mt-2">XSLT: {xsltError}</p>
                        )}
                      </div>
                      {htmlPreview && (
                        <div className="relative w-full min-h-[200px] max-h-[50vh] overflow-auto bg-white">
                          <iframe
                            title={`Önizleme: ${h.fileName}`}
                            srcDoc={wrapInvoiceHtmlWithFallbacks(htmlPreview)}
                            sandbox="allow-scripts"
                            className="w-full min-h-[200px] border-0"
                            style={{ height: 'min(400px, 50vh)' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {uploadProgress && (
            <div className="border-t pt-4 px-1 pb-1 space-y-4">
              {/* Adım göstergesi */}
              <div className="flex items-center justify-center gap-0">
                {/* Adım 1: Storage */}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300',
                      uploadProgress.step === 'storage'
                        ? 'border-primary bg-primary text-primary-foreground animate-pulse'
                        : uploadProgress.step === 'db' || uploadProgress.step === 'done'
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-muted bg-muted text-muted-foreground'
                    )}
                  >
                    {uploadProgress.step === 'db' || uploadProgress.step === 'done' ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : '1'}
                  </div>
                  <span className={cn('text-[10px] font-medium whitespace-nowrap', uploadProgress.step === 'storage' ? 'text-primary' : 'text-muted-foreground')}>R2 Storage</span>
                </div>

                {/* Bağlayıcı çizgi */}
                <div className="relative h-0.5 w-16 mx-1 bg-muted overflow-hidden mb-4">
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 bg-green-500 transition-all duration-500',
                      uploadProgress.step === 'storage' ? 'w-0' : 'w-full'
                    )}
                  />
                </div>

                {/* Adım 2: Veritabanı */}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300',
                      uploadProgress.step === 'db'
                        ? 'border-primary bg-primary text-primary-foreground animate-pulse'
                        : uploadProgress.step === 'done'
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-muted bg-muted text-muted-foreground'
                    )}
                  >
                    {uploadProgress.step === 'done' ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : '2'}
                  </div>
                  <span className={cn('text-[10px] font-medium whitespace-nowrap', uploadProgress.step === 'db' ? 'text-primary' : 'text-muted-foreground')}>D1 Veritabanı</span>
                </div>

                {/* Bağlayıcı çizgi */}
                <div className="relative h-0.5 w-16 mx-1 bg-muted overflow-hidden mb-4">
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 bg-green-500 transition-all duration-500',
                      uploadProgress.step === 'done' ? 'w-full' : 'w-0'
                    )}
                  />
                </div>

                {/* Adım 3: Tamamlandı */}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300',
                      uploadProgress.step === 'done'
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-muted bg-muted text-muted-foreground'
                    )}
                  >
                    {uploadProgress.step === 'done' ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : '3'}
                  </div>
                  <span className={cn('text-[10px] font-medium whitespace-nowrap', uploadProgress.step === 'done' ? 'text-green-600' : 'text-muted-foreground')}>Tamamlandı</span>
                </div>
              </div>

              {/* Genel ilerleme slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {uploadProgress.step === 'done'
                      ? `✓ ${uploadProgress.success} başarılı${uploadProgress.failed > 0 ? `, ${uploadProgress.failed} başarısız` : ''}`
                      : uploadProgress.step === 'storage'
                        ? `R2 Storage'a aktarılıyor…`
                        : `D1 veritabanına kaydediliyor…`}
                  </span>
                  <span className="font-medium text-foreground">{Math.min(uploadProgress.fileIndex + 1, uploadProgress.total)}/{uploadProgress.total}</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-primary"
                    style={{
                      width: `${uploadProgress.total > 0
                        ? Math.round(
                            ((uploadProgress.fileIndex + (uploadProgress.step === 'db' ? 0.7 : uploadProgress.step === 'done' ? 1 : 0.3)) /
                              uploadProgress.total) *
                              100
                          )
                        : 0}%`,
                    }}
                  />
                </div>
                {uploadProgress.fileName && (
                  <p className="text-xs text-muted-foreground truncate">{uploadProgress.fileName}</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewModalOpen(false)} disabled={uploading}>
              Kapat
            </Button>
            <Button
              type="button"
              onClick={handleDoUpload}
              disabled={uploading || previewItems.length === 0 || previewItems.some((i) => i.header.rawError)}
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Yükleniyor…</>
              ) : 'R2\'ye Yükle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Doğrudan yükleme modalı */}
      <Dialog open={uploadModalOpen} onOpenChange={(open) => { if (!open && !uploading) setUploadModalOpen(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {uploading ? 'Yükleniyor…' : uploadProgress?.step === 'done' ? 'Yükleme Tamamlandı' : `${uploadFileResults.length} Dosya Hazır`}
            </DialogTitle>
            <DialogDescription>
              {uploading ? 'Dosyalar işleniyor, lütfen bekleyin.' : 'Dosyalar R2 Storage ve D1 veritabanına kaydedilecek.'}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-52 overflow-auto space-y-1 py-1">
            {uploadFileResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm px-1 py-0.5 rounded">
                <span className={cn(
                  'shrink-0 w-5 h-5 rounded-full flex items-center justify-center',
                  r.status === 'done' && 'bg-green-100 text-green-600',
                  r.status === 'failed' && 'bg-red-100 text-red-500',
                  r.status === 'uploading' && 'bg-primary/10 text-primary',
                  r.status === 'pending' && 'bg-muted text-muted-foreground',
                )}>
                  {r.status === 'done' && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  {r.status === 'failed' && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                  {r.status === 'uploading' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {r.status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 block" />}
                </span>
                <span className={cn('truncate flex-1', r.status === 'failed' && 'text-destructive')}>{r.name}</span>
                {r.error && <span className="text-xs text-destructive shrink-0 max-w-[130px] truncate">{r.error}</span>}
              </div>
            ))}
          </div>

          {uploading && uploadProgress && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-center">
                {(['storage', 'db', 'done'] as const).map((key, i, arr) => {
                  const order = { storage: 0, db: 1, done: 2 }
                  const cur = order[uploadProgress.step]
                  const isActive = uploadProgress.step === key
                  const isDone = cur > order[key]
                  const labels = { storage: 'R2 Storage', db: 'D1 Veritabanı', done: 'Tamamlandı' }
                  return (
                    <div key={key} className="flex items-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300',
                          isActive && 'border-primary bg-primary text-primary-foreground animate-pulse',
                          isDone && 'border-green-500 bg-green-500 text-white',
                          !isActive && !isDone && 'border-muted bg-muted text-muted-foreground',
                        )}>
                          {isDone
                            ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            : i + 1}
                        </div>
                        <span className={cn('text-[10px] font-medium whitespace-nowrap', isActive ? 'text-primary' : isDone ? 'text-green-600' : 'text-muted-foreground')}>{labels[key]}</span>
                      </div>
                      {i < arr.length - 1 && (
                        <div className="relative h-0.5 w-12 mx-1 bg-muted overflow-hidden mb-4">
                          <div className={cn('absolute inset-y-0 left-0 bg-green-500 transition-all duration-500', isDone ? 'w-full' : 'w-0')} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{uploadProgress.step === 'storage' ? "R2'ye aktarılıyor…" : uploadProgress.step === 'db' ? 'Veritabanına kaydediliyor…' : 'Tamamlandı'}</span>
                  <span className="font-medium text-foreground">{Math.min(uploadProgress.fileIndex + 1, uploadProgress.total)}/{uploadProgress.total}</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500 bg-primary"
                    style={{ width: `${uploadProgress.total > 0 ? Math.round(((uploadProgress.fileIndex + (uploadProgress.step === 'db' ? 0.7 : uploadProgress.step === 'done' ? 1 : 0.3)) / uploadProgress.total) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" disabled={uploading} onClick={() => setUploadModalOpen(false)}>
              {uploading ? 'Yükleniyor…' : 'Kapat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewModalOpen}
        onOpenChange={(open) => {
          setViewModalOpen(open)
          if (!open) {
            setSelectedDoc(null)
            setViewHtml(null)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Fatura Önizleme</DialogTitle>
            <DialogDescription>
              {selectedDoc?.description || selectedDoc?.invoice_no || 'Belge'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto py-2 min-h-[200px]">
            {viewLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-5">
                <p className="text-sm font-medium text-foreground">R2 storage'dan dosya okunuyor</p>
                <p className="text-xs text-muted-foreground">XML ve XSLT tarayıcıda işleniyor</p>
                <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full w-1/3 bg-primary rounded-full"
                    style={{ animation: 'loading-slider 1.5s ease-in-out infinite' }}
                  />
                </div>
              </div>
            ) : viewHtml ? (
              <div className="relative w-full min-h-[200px] max-h-[60vh] overflow-auto bg-white">
                <iframe
                  title="Fatura önizleme"
                  srcDoc={viewHtml}
                  sandbox="allow-scripts"
                  className="w-full min-h-[200px] border-0"
                  style={{ height: 'min(500px, 60vh)' }}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Önizleme yüklenemedi.</p>
            )}
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setViewModalOpen(false)}>
              Kapat
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handlePaylas}
              disabled={!viewHtml || viewLoading}
            >
              <Share2 className="h-4 w-4" />
              Paylaş
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handlePdfKaydet}
              disabled={!viewHtml || viewLoading}
            >
              <FileDown className="h-4 w-4" />
              PDF Kaydet
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleYazdir}
              disabled={!viewHtml || viewLoading}
            >
              <Printer className="h-4 w-4" />
              Yazdır
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overwriteModalOpen} onOpenChange={setOverwriteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mevcut Dosya Uyarısı</DialogTitle>
            <DialogDescription>
              Aşağıdaki dosyalar storage'da zaten mevcut. Üzerine yazmak veya atlamak istediğinizi seçin.
            </DialogDescription>
          </DialogHeader>
          <ul className="py-2 space-y-1 text-sm text-muted-foreground max-h-40 overflow-auto">
            {existingFiles.map((name, i) => (
              <li key={i} className="font-mono truncate">
                {name}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOverwriteModalOpen(false)}>
              İptal Et
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOverwriteModalOpen(false)
                const existingSet = new Set(existingKeysRef.current)
                if (pendingDirectUploadRef.current.length > 0) {
                  const queue = pendingDirectUploadRef.current
                  const filtered = queue.filter((q) => {
                    if (q.header.rawError) return false
                    const folder = getEdocumentStoragePath(q.header.invoiceType, q.header.issueDate)
                    const xmlKey = getTargetKey(folder, q.xmlFile.name)
                    return !existingSet.has(xmlKey)
                  })
                  pendingDirectUploadRef.current = []
                  if (filtered.length > 0) performDirectUpload(filtered)
                  else {
                    setUploadModalOpen(false)
                    toastSuccess('Atlandı', 'Mevcut dosyalar atlandı, yüklenecek yeni dosya yok.')
                  }
                } else {
                  const filtered = previewItems.filter((item) => {
                    if (item.header.rawError) return false
                    const folder = getEdocumentStoragePath(item.header.invoiceType, item.header.issueDate)
                    const xmlKey = getTargetKey(folder, item.xmlFile.name)
                    return !existingSet.has(xmlKey)
                  })
                  if (filtered.length > 0) performUpload(filtered)
                  else {
                    setPreviewModalOpen(false)
                    setPreviewItems([])
                    toastSuccess('Atlandı', 'Mevcut dosyalar atlandı, yüklenecek yeni dosya yok.')
                  }
                }
              }}
            >
              Atla
            </Button>
            <Button
              type="button"
              onClick={() => {
                setOverwriteModalOpen(false)
                if (pendingDirectUploadRef.current.length > 0) {
                  performDirectUpload(pendingDirectUploadRef.current)
                  pendingDirectUploadRef.current = []
                } else {
                  performUpload()
                }
              }}
            >
              Üstüne Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
