import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, FileText, Inbox, Send, Archive, LayoutGrid, Upload, Loader2, Share2, FileDown, Printer, ArrowUp, ArrowDown, ArrowUpDown, Trash2 } from 'lucide-react'
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
  transformXmlWithXslt,
  extractEmbeddedXslt,
  isHtmlOutput,
  buildFallbackInvoiceHtml,
  getEdocumentStoragePath,
  type InvoiceHeaderInfo,
} from '@/lib/ublInvoiceParser'
import {
  renderXmlToHtml,
  extractEmbeddedXsltFromBinaryObject,
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
  sortBy: 'date' as SortBy,
  sortOrder: 'desc' as SortOrder,
  page: 1,
  pageSize: 'fit' as PageSizeValue,
  fitLimit: 10,
}

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

/** XSLT version 2.0 -> 1.0 (tarayıcı sadece 1.0 destekler) */
function normalizeXsltVersion(xslt: string): string {
  return xslt
    .replace(/version\s*=\s*["']2\.0["']/gi, 'version="1.0"')
    .replace(/version\s*=\s*["']4\.0["']/gi, 'version="1.0"')
    .replace(/\s+use-character-maps\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<xsl:character-map\b[^>]*>[\s\S]*?<\/xsl:character-map>/gi, '')
}

/** HTML'in anlamlı içerik içerip içermediğini kontrol eder (boş/beyaz sayfa önlemi) */
function hasMeaningfulContent(html: string): boolean {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodyContent = (bodyMatch?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').trim()
  return bodyContent.length > 50
}

/** XSLT çıktısındaki QRCode hatasını önlemek için fallback ekler (GİB şablonu makeCode kullanır) */
function wrapInvoiceHtmlWithFallbacks(html: string): string {
  const qrFallback = `<script>
(function(){if(typeof QRCode==='undefined'){window.QRCode=function(el,o){var r={makeCode:function(t){try{if(el&&el.appendChild){var d=document.createElement('div');d.style.cssText='width:80px;height:80px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999';d.textContent='QR';el.innerHTML='';el.appendChild(d);}}catch(e){}}};r.CorrectLevel={L:1,M:0,Q:3,H:2};return r;}})();
})();
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
  const { search, filter, sortBy, sortOrder, page, pageSize, fitLimit } = listState
  const [data, setData] = useState<EDocument[]>([])
  const [total, setTotal] = useState(0)
  const [totalAmountTry, setTotalAmountTry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [overwriteModalOpen, setOverwriteModalOpen] = useState(false)
  const [existingFiles, setExistingFiles] = useState<string[]>([])
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<EDocument | null>(null)
  const [viewHtml, setViewHtml] = useState<string | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const hasFilter = search.length > 0 || filter !== 'tumu'
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), sort_by: sortBy, sort_order: sortOrder })
      if (search) params.set('search', search)
      if (filter !== 'tumu') params.set('filter', filter)
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
  }, [page, search, filter, limit, sortBy, sortOrder])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setListState({ search: '', filter: 'tumu', page: 1 })
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

  const handleFolderUploadClick = () => {
    folderInputRef.current?.click()
  }

  const performUpload = async () => {
    if (previewItems.length === 0 || uploading) return
    setOverwriteModalOpen(false)
    setUploading(true)
    let success = 0
    let failed = 0
    try {
      for (const item of previewItems) {
        if (item.header.rawError) {
          failed++
          continue
        }
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
        if (res.ok && json.path) {
          success++
        } else {
          failed++
        }
      }
      if (success > 0) {
        toastSuccess('Yükleme tamamlandı', `${success} dosya e-documents klasörüne kaydedildi.${failed > 0 ? ` ${failed} başarısız.` : ''}`)
        setPreviewModalOpen(false)
        setPreviewItems([])
        fetchData()
      }
      if (failed > 0 && success === 0) {
        toastError('Yükleme hatası', 'Dosyalar yüklenemedi.')
      }
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Bilinmeyen hata')
    } finally {
      setUploading(false)
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
        setExistingFiles(existing.map((k: string) => k.split('/').pop() ?? k))
        setOverwriteModalOpen(true)
        return
      }
    } catch {
      /* devam et */
    }
    await performUpload()
  }

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (!fileArray.length) return
    setPreviewLoading(true)
    setPreviewItems([])
    setPreviewModalOpen(true)
    const byBase = new Map<string, { xml?: File; xslt?: File }>()
    const allXslt: File[] = []
    for (const f of fileArray) {
      const base = getBaseName(f.name)
      const ext = f.name.split('.').pop()?.toLowerCase()
      const entry = byBase.get(base) ?? {}
      if (ext === 'xml') entry.xml = f
      else if (ext === 'xslt' || ext === 'xsl') {
        entry.xslt = f
        allXslt.push(f)
      }
      byBase.set(base, entry)
    }
    const xmlEntries = Array.from(byBase.entries()).filter(([, v]) => v.xml)
    const unpairedXslt = allXslt.filter((xf) => !xmlEntries.some(([, v]) => v.xslt === xf))
    const sharedXslt = unpairedXslt[0]
    const items: PreviewItem[] = []
    for (const [, { xml, xslt }] of byBase) {
      if (!xml) continue
      const xmlText = await xml.text()
      const header = parseInvoiceHeader(xmlText, xml.name)
      let htmlPreview: string | undefined
      let xsltError: string | undefined
      const xsltFileToUse = xslt ?? sharedXslt
      let xsltText = xsltFileToUse
        ? await xsltFileToUse.text()
        : extractEmbeddedXslt(xmlText) ?? extractEmbeddedXsltFromBinaryObject(xmlText)
      if (xsltText) xsltText = normalizeXsltVersion(xsltText)
      if (!xsltText && header.invoiceType === 'earsiv') {
        try {
          const res = await fetch('/earsiv/general.xslt')
          if (res.ok) xsltText = await res.text()
        } catch {
          /* GİB şablonu yüklenemedi */
        }
      }
      if (xsltText) {
        try {
          const result = await transformXmlWithXslt(xmlText, xsltText)
          const useResult = isHtmlOutput(result) && hasMeaningfulContent(result)
          htmlPreview = useResult ? result : buildFallbackInvoiceHtml(header)
          if (!useResult) xsltError = 'XSLT çıktısı yetersiz veya HTML değil'
        } catch (err) {
          xsltError = err instanceof Error ? err.message : 'XSLT hatası'
          htmlPreview = buildFallbackInvoiceHtml(header)
        }
      }
      if (!htmlPreview && !header.rawError) {
        htmlPreview = buildFallbackInvoiceHtml(header)
      }
      items.push({ header, htmlPreview, xsltError, xmlFile: xml, xsltFile: xsltFileToUse })
    }
    setPreviewItems(items)
    setPreviewLoading(false)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    await processFiles(files)
    e.target.value = ''
  }

  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    await processFiles(files)
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
        if (error) console.warn('[E-Documents] XSLT:', error)
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
          <input
            ref={folderInputRef}
            type="file"
            accept=".xml,.xslt,.xsl"
            {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
            className="hidden"
            onChange={handleFolderChange}
          />
          <Button type="button" variant="default" size="sm" className="gap-2" onClick={handleUploadClick}>
            <Upload className="h-4 w-4" />
            Dosya Seç
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleFolderUploadClick}
            title="Klasör seç: Aynı isimde .xml ve .xslt dosyaları otomatik eşleşir"
          >
            <Upload className="h-4 w-4" />
            Klasör Seç
          </Button>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-10 p-3">
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
                    className="text-left p-3 font-medium cursor-pointer hover:bg-muted/70 select-none"
                    onClick={() => handleSort('date')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Tarih
                      <SortIcon col="date" />
                    </span>
                  </th>
                  <th className="text-left p-3 font-medium">Tür</th>
                  <th className="text-left p-3 font-medium">Gönderen / Alıcı</th>
                  <th
                    className="text-right p-3 font-medium cursor-pointer hover:bg-muted/70 select-none"
                    onClick={() => handleSort('amount')}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      Tutar
                      <SortIcon col="amount" />
                    </span>
                  </th>
                  <th
                    className="text-left p-3 font-medium cursor-pointer hover:bg-muted/70 select-none"
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
                      Henüz e-döküman kaydı yok. Dosya Seç veya Klasör Seç ile fatura yükleyebilirsiniz.
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className={cn('border-b hover:bg-muted/30 cursor-pointer', selectedIds.has(item.id) && 'bg-muted/50')}
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
                      <td className="p-3">{item.type === 'gelen' ? item.sender : item.receiver}</td>
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
                            sandbox="allow-same-origin allow-scripts"
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewModalOpen(false)} disabled={uploading}>
              Kapat
            </Button>
            <Button
              type="button"
              onClick={handleDoUpload}
              disabled={uploading || previewItems.length === 0 || previewItems.some((i) => i.header.rawError)}
            >
              {uploading ? 'Yükleniyor...' : 'R2\'ye Yükle'}
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
                  sandbox="allow-same-origin allow-scripts"
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
              Aşağıdaki dosyalar storage'da zaten mevcut. Üzerine yazmak istediğinize emin misiniz?
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
            <Button type="button" onClick={performUpload}>
              Üstüne Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
