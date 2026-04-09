import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { ChevronDown, ImageIcon, Plus, Search, Trash2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { toastSuccess, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { IdeasoftProductListRow } from '@/pages/ideasoft/IdeasoftProductsPage'

/**
 * ProductImage — Admin API (ProductImage LIST/GET/POST/COUNT/DELETE _ Admin API.pdf).
 */
export interface IdeasoftProductImageRow {
  id: number
  filename?: string
  extension?: string
  sortOrder?: number
  thumbUrl?: string
  originalUrl?: string
  product?: { id?: number; name?: string; sku?: string; fullName?: string }
}

export interface ProductWithImagesRow {
  product: IdeasoftProductListRow
  images: IdeasoftProductImageRow[]
}

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
  productSort: 'id' as 'id' | '-id',
}

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'] as const
type AllowedExt = (typeof ALLOWED_EXTENSIONS)[number]

const ATTACHMENT_PREFIX_RE = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/i

function extractProductImagesList(json: unknown): { items: IdeasoftProductImageRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftProductImageRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftProductImageRow[], total }
    }
    const member = o.member
    if (Array.isArray(member)) {
      const total =
        typeof o['hydra:totalItems'] === 'number'
          ? (o['hydra:totalItems'] as number)
          : typeof o.total === 'number'
            ? o.total
            : member.length
      return { items: member as IdeasoftProductImageRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftProductImageRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as IdeasoftProductImageRow[]
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function extractProductsList(json: unknown): { items: IdeasoftProductListRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftProductListRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftProductListRow[], total }
    }
    const member = o.member
    if (Array.isArray(member)) {
      const total =
        typeof o['hydra:totalItems'] === 'number'
          ? (o['hydra:totalItems'] as number)
          : typeof o.total === 'number'
            ? o.total
            : member.length
      return { items: member as IdeasoftProductListRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftProductListRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as IdeasoftProductListRow[]
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function parseProductCount(json: unknown): number | null {
  if (typeof json === 'number' && Number.isFinite(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (typeof o.total === 'number') return o.total
    if (typeof o.count === 'number') return o.count
    if (typeof o['hydra:totalItems'] === 'number') return o['hydra:totalItems'] as number
  }
  return null
}

function sortImagesForProduct(images: IdeasoftProductImageRow[]): IdeasoftProductImageRow[] {
  return [...images].sort((a, b) => {
    const sa = a.sortOrder ?? 99
    const sb = b.sortOrder ?? 99
    if (sa !== sb) return sa - sb
    return a.id - b.id
  })
}

async function fetchImagesForProduct(productId: number): Promise<IdeasoftProductImageRow[]> {
  const params = new URLSearchParams({
    product: String(productId),
    limit: '100',
    page: '1',
    sort: 'id',
  })
  const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_images?${params}`)
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) return []
  const { items } = extractProductImagesList(data)
  return sortImagesForProduct(items)
}

function slugifyFilename(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255)
}

function mimeToExtension(mime: string): AllowedExt | null {
  const m = mime.toLowerCase()
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg'
  if (m === 'image/png') return 'png'
  if (m === 'image/gif') return 'gif'
  if (m === 'image/webp') return 'webp'
  return null
}

function ImageDetailBlock({ row }: { row: IdeasoftProductImageRow }) {
  return (
    <>
      {row.originalUrl || row.thumbUrl ? (
        <div className="flex justify-center">
          <img
            src={row.originalUrl || row.thumbUrl}
            alt=""
            className="max-h-48 rounded border object-contain bg-muted"
          />
        </div>
      ) : null}
      <dl className="grid grid-cols-[8rem_1fr] gap-x-2 gap-y-1">
        <dt className="text-muted-foreground">id</dt>
        <dd className="font-mono tabular-nums">{row.id}</dd>
        <dt className="text-muted-foreground">filename</dt>
        <dd className="font-mono text-xs break-all">{row.filename ?? '—'}</dd>
        <dt className="text-muted-foreground">extension</dt>
        <dd>{row.extension ?? '—'}</dd>
        <dt className="text-muted-foreground">sortOrder</dt>
        <dd className="tabular-nums">{row.sortOrder ?? '—'}</dd>
        <dt className="text-muted-foreground">thumbUrl</dt>
        <dd className="break-all text-xs">
          {row.thumbUrl ? (
            <a href={row.thumbUrl} target="_blank" rel="noreferrer" className="text-primary underline">
              {row.thumbUrl}
            </a>
          ) : (
            '—'
          )}
        </dd>
        <dt className="text-muted-foreground">originalUrl</dt>
        <dd className="break-all text-xs">
          {row.originalUrl ? (
            <a href={row.originalUrl} target="_blank" rel="noreferrer" className="text-primary underline">
              {row.originalUrl}
            </a>
          ) : (
            '—'
          )}
        </dd>
      </dl>
    </>
  )
}

export function IdeasoftProductImagesPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-product-images-v1', listDefaults)
  const { search, page, pageSize, fitLimit, productSort } = listState
  const [rows, setRows] = useState<ProductWithImagesRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [docOpen, setDocOpen] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [modalProduct, setModalProduct] = useState<IdeasoftProductListRow | null>(null)
  const [modalImages, setModalImages] = useState<IdeasoftProductImageRow[]>([])
  const [activeImageId, setActiveImageId] = useState<string>('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createProductId, setCreateProductId] = useState('')
  const [createFilename, setCreateFilename] = useState('')
  const [createExtension, setCreateExtension] = useState<AllowedExt>('jpg')
  const [createSortOrder, setCreateSortOrder] = useState('1')
  const [createAttachment, setCreateAttachment] = useState('')
  const [createSaving, setCreateSaving] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const hasFilter = search.length > 0 || productSort !== 'id'

  const buildProductListParams = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort: productSort,
      status: '1',
    })
    if (search.trim()) params.set('s', search.trim())
    return params
  }, [page, limit, search, productSort])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = buildProductListParams()
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/products?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Ürün listesi alınamadı'
        )
        setRows([])
        setTotal(0)
        return
      }
      let { items: products, total: t } = extractProductsList(data)
      const countParams = new URLSearchParams(params)
      const resCount = await fetch(`${API_URL}/api/ideasoft/admin-api/products/count?${countParams}`)
      if (resCount.ok) {
        try {
          const countData = await parseJsonResponse<unknown>(resCount)
          const c = parseProductCount(countData)
          if (c != null) t = c
        } catch {
          /* */
        }
      }
      setTotal(t)

      const imageLists = await Promise.all(products.map((p) => fetchImagesForProduct(p.id)))
      const combined: ProductWithImagesRow[] = products.map((product, i) => ({
        product,
        images: imageLists[i] ?? [],
      }))
      setRows(combined)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [buildProductListParams])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  const openDetail = useCallback((row: ProductWithImagesRow) => {
    setModalProduct(row.product)
    setModalImages(row.images)
    const first = row.images[0]
    setActiveImageId(first ? String(first.id) : '')
    setDetailOpen(true)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailOpen(false)
    setModalProduct(null)
    setModalImages([])
    setActiveImageId('')
  }, [])

  const activeImage = modalImages.find((im) => String(im.id) === activeImageId) ?? null

  const reloadModalImages = useCallback(async (productId: number) => {
    const next = await fetchImagesForProduct(productId)
    setModalImages(next)
    if (next.length === 0) {
      setActiveImageId('')
      closeDetail()
      return
    }
    setActiveImageId((prev) => {
      const still = next.some((im) => String(im.id) === prev)
      return still ? prev : String(next[0].id)
    })
  }, [closeDetail])

  const handleDelete = useCallback(async () => {
    const id = activeImage ? activeImage.id : null
    const pid = modalProduct?.id
    if (id == null || pid == null) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_images/${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        const data = await parseJsonResponse<{ error?: string; hint?: string }>(res).catch(() => ({}))
        toastError('Sil', formatIdeasoftProxyErrorForUi(data) || `HTTP ${res.status}`)
        return
      }
      toastSuccess('Görsel silindi (204).')
      setDeleteOpen(false)
      void reloadModalImages(pid)
      void fetchList()
    } catch (e) {
      toastError('Sil', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setDeleting(false)
    }
  }, [activeImage, modalProduct, reloadModalImages, fetchList])

  const resetCreateForm = () => {
    setCreateProductId('')
    setCreateFilename('')
    setCreateExtension('jpg')
    setCreateSortOrder('1')
    setCreateAttachment('')
  }

  const submitCreate = async () => {
    const pid = parseInt(createProductId.trim(), 10)
    if (!Number.isFinite(pid) || pid < 1) {
      toastError('Doğrulama', 'Ürün id (product) ≥ 1 olmalıdır (PDF).')
      return
    }
    const fn = slugifyFilename(createFilename)
    if (!fn || !/^[a-z0-9-]+$/.test(fn)) {
      toastError('Doğrulama', 'Dosya adı (filename) yalnızca küçük harf, rakam ve tire; uzantısız (PDF).')
      return
    }
    const so = parseInt(createSortOrder, 10)
    if (!Number.isFinite(so) || so < 1 || so > 8) {
      toastError('Doğrulama', 'sortOrder 1–8 arası olmalıdır (PDF).')
      return
    }
    if (!ATTACHMENT_PREFIX_RE.test(createAttachment.trim())) {
      toastError(
        'Doğrulama',
        'attachment: data:image/(jpeg|jpg|png|gif|webp);base64,... formatında olmalıdır (PDF).'
      )
      return
    }
    setCreateSaving(true)
    try {
      const body = {
        filename: fn,
        extension: createExtension,
        sortOrder: so,
        attachment: createAttachment.trim(),
        product: { id: pid },
      }
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/product_images`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Oluştur',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Kayıt oluşturulamadı'
        )
        return
      }
      toastSuccess('Görsel yüklendi (POST).')
      setCreateOpen(false)
      resetCreateForm()
      void fetchList()
      if (detailOpen && modalProduct?.id === pid) void reloadModalImages(pid)
    } catch (e) {
      toastError('Oluştur', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setCreateSaving(false)
    }
  }

  const onPickFile = (file: File | null) => {
    if (!file) return
    const extFromName = file.name.replace(/^.*\./, '').toLowerCase()
    if (ALLOWED_EXTENSIONS.includes(extFromName as AllowedExt)) {
      setCreateExtension(extFromName === 'jpeg' ? 'jpg' : (extFromName as AllowedExt))
    } else {
      const fromMime = mimeToExtension(file.type)
      if (fromMime) setCreateExtension(fromMime)
    }
    if (!createFilename.trim()) {
      setCreateFilename(slugifyFilename(file.name) || 'urun-gorseli')
    }
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      if (typeof r === 'string') setCreateAttachment(r)
    }
    reader.readAsDataURL(file)
  }

  return (
    <PageLayout
      title="IdeaSoft — Ürün görselleri"
      description="Ürünler Product LIST (ad / SKU: s) ile sayfalanır; görseller ProductImage LIST product=? ile ürün başına gruplanır."
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => void fetchList()}
      headerActions={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ürün adı veya stok kodu (SKU)…"
                value={search}
                onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                className="pl-8 w-56 h-9 rounded-r-none border-r-0"
              />
            </div>
            <select
              aria-label="Ürün sıralaması (sort)"
              value={productSort}
              onChange={(e) =>
                setListState({ productSort: e.target.value === '-id' ? '-id' : 'id', page: 1 })
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="id">Ürün sort=id</option>
              <option value="-id">Ürün sort=-id</option>
            </select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setListState({ search: '', productSort: 'id', page: 1 })}
                  className={`h-9 w-9 shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filtreleri sıfırla</TooltipContent>
            </Tooltip>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yeni görsel (POST)</TooltipContent>
          </Tooltip>
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
          onFitLimitChange={(fl) => setListState({ fitLimit: fl })}
          tableContainerRef={contentRef}
          hasFilter={hasFilter}
        />
      }
    >
      <Collapsible open={docOpen} onOpenChange={setDocOpen} className="shrink-0 border-b border-border pb-3 mb-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 px-2 -ml-2 text-muted-foreground">
            <ChevronDown className={cn('h-4 w-4 transition-transform', docOpen && 'rotate-180')} />
            API özeti (PDF)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2 bg-muted/30">
            <CardContent className="pt-4 text-sm text-muted-foreground space-y-3">
              <p>
                Bu sayfada ürün satırları <strong className="text-foreground">Product LIST</strong> (
                <code>s</code> arama, <code>status=1</code> aktif ürünler) ile gelir; her ürün için{' '}
                <strong className="text-foreground">ProductImage LIST</strong>{' '}
                <code>product=&#123;ürün id&#125;</code> ile görseller toplanır.
              </p>
              <p>
                <strong className="text-foreground">LIST</strong> —{' '}
                <code className="text-xs">GET …/admin-api/product_images</code>. Sorgu:{' '}
                <code>id</code>, <code>ids</code>, <code>limit</code> (1–100, varsayılan 20),{' '}
                <code>page</code> (≥1, varsayılan 1), <code>product</code> (ürün id), <code>q</code>,{' '}
                <code>s</code>, <code>sinceId</code>, <code>sort</code> (örn. <code>id</code>,{' '}
                <code>-id</code>). Yetki: <code>product_read</code>.
              </p>
              <p>
                <strong className="text-foreground">COUNT</strong> —{' '}
                <code className="text-xs">GET …/admin-api/product_images/count</code>; aynı sorgu
                parametreleri. Yetki: <code>product_read</code>.
              </p>
              <p>
                <strong className="text-foreground">GET</strong> —{' '}
                <code className="text-xs">GET …/admin-api/product_images/{"{id}"}</code>. Yetki:{' '}
                <code>product_read</code>.
              </p>
              <p>
                <strong className="text-foreground">POST</strong> —{' '}
                <code className="text-xs">POST …/admin-api/product_images</code>. Gövde:{' '}
                <code>filename</code> (uzantısız, <code>^[a-z0-9-]+$</code>), <code>extension</code>{' '}
                (jpg/jpeg/png/gif/webp), <code>sortOrder</code> (1–8; 1 ana görsel),{' '}
                <code>attachment</code> (base64,{' '}
                <code>data:image/(jpeg|jpg|png|gif|webp);base64,…</code>),{' '}
                <code>product</code> nesnesi. Yetki: <code>product_create</code>.
              </p>
              <p>
                <strong className="text-foreground">DELETE</strong> —{' '}
                <code className="text-xs">DELETE …/admin-api/product_images/{"{id}"}</code>. Yanıt{' '}
                <code>204</code>, gövde yok. Yetki: <code>product_delete</code>.
              </p>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          {listError && (
            <div className="px-4 py-3 text-sm text-destructive border-b border-border whitespace-pre-wrap shrink-0">
              {listError}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium w-20">Ürün ID</th>
                  <th className="text-left p-2 font-medium w-28">Önizleme</th>
                  <th className="text-left p-2 font-medium min-w-[160px]">Ürün adı</th>
                  <th className="text-left p-2 font-medium w-36">Stok kodu (SKU)</th>
                  <th className="text-center p-2 font-medium w-24">Görsel</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      Bu sayfada ürün yok veya arama sonucu boş.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const { product, images } = row
                    const title = (product.fullName || product.name || `Ürün #${product.id}`).trim()
                    const thumb = images[0]
                    const n = images.length
                    return (
                      <tr
                        key={product.id}
                        tabIndex={0}
                        className="border-b border-border/60 hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        onClick={() => openDetail(row)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openDetail(row)
                          }
                        }}
                      >
                        <td className="p-2 tabular-nums">{product.id}</td>
                        <td className="p-2">
                          <div className="relative inline-flex">
                            {thumb?.thumbUrl || thumb?.originalUrl ? (
                              <img
                                src={thumb.thumbUrl || thumb.originalUrl}
                                alt=""
                                className="h-10 w-10 rounded-full border object-cover bg-muted"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full border bg-muted flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            {n > 1 ? (
                              <Badge
                                variant="default"
                                className="absolute -right-1 -top-1 h-5 min-w-5 px-1 flex items-center justify-center p-0 text-[10px] font-bold shadow-sm"
                                aria-label={`${n} görsel`}
                              >
                                {n}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-2 max-w-md truncate" title={title}>
                          {title}
                        </td>
                        <td className="p-2 font-mono text-xs truncate" title={product.sku ?? ''}>
                          {product.sku?.trim() || '—'}
                        </td>
                        <td className="p-2 text-center tabular-nums text-muted-foreground">{n}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={(o) => !o && closeDetail()}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="pr-8">
              {modalProduct
                ? `Ürün görselleri — ${(modalProduct.fullName || modalProduct.name || '').trim() || `#${modalProduct.id}`}`
                : 'Ürün görselleri'}
              {modalProduct ? (
                <span className="block text-sm font-normal text-muted-foreground mt-1 tabular-nums">
                  Ürün #{modalProduct.id}
                  {modalProduct.sku?.trim() ? ` · SKU ${modalProduct.sku.trim()}` : ''}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 text-sm">
            {modalImages.length === 0 ? (
              <p className="text-muted-foreground">Bu ürüne bağlı görsel yok. Yeni görsel eklemek için + kullanın.</p>
            ) : modalImages.length === 1 && activeImage ? (
              <ImageDetailBlock row={activeImage} />
            ) : (
              <Tabs value={activeImageId} onValueChange={setActiveImageId} className="w-full">
                <TabsList className="flex flex-wrap h-auto gap-1 justify-start p-1 w-full max-h-32 overflow-y-auto">
                  {modalImages.map((im, idx) => (
                    <TabsTrigger
                      key={im.id}
                      value={String(im.id)}
                      className="text-xs shrink-0"
                    >
                      {im.sortOrder != null ? `Sıra ${im.sortOrder}` : `Görsel ${idx + 1}`}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {modalImages.map((im) => (
                  <TabsContent key={im.id} value={String(im.id)} className="mt-3 space-y-3">
                    <ImageDetailBlock row={im} />
                  </TabsContent>
                ))}
              </Tabs>
            )}
            {modalImages.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                GET yanıtında <code>attachment</code> alanı PDF’de tanımlıdır; POST’ta zorunludur.
              </p>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 border-t pt-4 mt-2 flex-row justify-between gap-2">
            <Button
              type="button"
              variant="delete"
              size="icon"
              disabled={!activeImage}
              onClick={() => setDeleteOpen(true)}
              aria-label="Sil"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" onClick={closeDetail}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o) resetCreateForm()
        }}
      >
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Yeni ürün görseli (POST)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 text-sm">
            <div className="space-y-1">
              <Label htmlFor="pi-product-id">product.id</Label>
              <Input
                id="pi-product-id"
                type="number"
                min={1}
                placeholder="≥ 1"
                value={createProductId}
                onChange={(e) => setCreateProductId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pi-filename">filename (uzantısız)</Label>
              <Input
                id="pi-filename"
                placeholder="ornek-urun-gorseli"
                value={createFilename}
                onChange={(e) => setCreateFilename(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pi-ext">extension</Label>
              <select
                id="pi-ext"
                aria-label="Dosya uzantısı (extension)"
                value={createExtension}
                onChange={(e) => setCreateExtension(e.target.value as AllowedExt)}
                className="w-full h-9 rounded-md border border-input bg-background px-2"
              >
                {ALLOWED_EXTENSIONS.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pi-sort">sortOrder (1–8)</Label>
              <Input
                id="pi-sort"
                type="number"
                min={1}
                max={8}
                value={createSortOrder}
                onChange={(e) => setCreateSortOrder(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pi-file">Dosya (attachment)</Label>
              <Input
                id="pi-file"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
              {createAttachment ? (
                <p className="text-xs text-muted-foreground break-all line-clamp-2">
                  {createAttachment.slice(0, 80)}…
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              İptal
            </Button>
            <Button type="button" variant="save" disabled={createSaving} onClick={() => void submitCreate()}>
              {createSaving ? 'Gönderiliyor...' : 'Gönder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Görseli sil"
        description={
          activeImage
            ? `Görsel #${activeImage.id} kalıcı olarak silinecek (DELETE …/admin-api/product_images/{id}, 204).`
            : 'Seçili görsel yok.'
        }
        onConfirm={() => void handleDelete()}
        loading={deleting}
      />
    </PageLayout>
  )
}
