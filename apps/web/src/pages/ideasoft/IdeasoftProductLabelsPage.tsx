import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { ChevronDown, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { toastSuccess, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * ProductLabel — Admin API (PDF): ürün ↔ kişisel etiket bağı.
 * Yol: `/admin-api/label_to_products` (LIST/GET/POST/PUT/DELETE/COUNT).
 */
export interface IdeasoftLabelNested {
  id?: number
  name?: string
  slug?: string
  sortOrder?: number
  status?: number
  hasChildren?: number
  pageTitle?: string
  metaDescription?: string
  metaKeywords?: string
  tree?: string
  parent?: unknown
  children?: unknown
  updatedAt?: string
  createdAt?: string
}

export interface IdeasoftLabelToProductRow {
  id: number
  label?: IdeasoftLabelNested
  product?: Record<string, unknown>
}

const listDefaults = {
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
  productFilter: '',
  labelFilter: '',
}

const SLUG_RE = /^[a-z0-9-]+$/

function extractLabelToProductsList(json: unknown): { items: IdeasoftLabelToProductRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftLabelToProductRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftLabelToProductRow[], total }
    }
    const member = o.member
    if (Array.isArray(member)) {
      const total =
        typeof o['hydra:totalItems'] === 'number'
          ? (o['hydra:totalItems'] as number)
          : typeof o.total === 'number'
            ? o.total
            : member.length
      return { items: member as IdeasoftLabelToProductRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftLabelToProductRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
    if (Array.isArray(o.items)) {
      const items = o.items as IdeasoftLabelToProductRow[]
      const total = typeof o.total === 'number' ? o.total : items.length
      return { items, total }
    }
  }
  return { items: [], total: 0 }
}

function parseCount(json: unknown): number | null {
  if (typeof json === 'number' && Number.isFinite(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (typeof o.total === 'number') return o.total
    if (typeof o.count === 'number') return o.count
    if (typeof o['hydra:totalItems'] === 'number') return o['hydra:totalItems'] as number
  }
  return null
}

function productTitle(p: Record<string, unknown> | undefined): string {
  if (!p) return '—'
  const fn = typeof p.fullName === 'string' ? p.fullName.trim() : ''
  const n = typeof p.name === 'string' ? p.name.trim() : ''
  const id = typeof p.id === 'number' ? p.id : null
  return (fn || n || (id != null ? `Ürün #${id}` : '—')).trim() || '—'
}

function productSku(p: Record<string, unknown> | undefined): string {
  if (!p) return '—'
  const sku = typeof p.sku === 'string' ? p.sku.trim() : ''
  return sku || '—'
}

export function IdeasoftProductLabelsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-product-labels-v1', listDefaults)
  const { page, pageSize, fitLimit, productFilter, labelFilter } = listState
  const [items, setItems] = useState<IdeasoftLabelToProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [docOpen, setDocOpen] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [record, setRecord] = useState<IdeasoftLabelToProductRow | null>(null)
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formSortOrder, setFormSortOrder] = useState('0')
  const [formStatus, setFormStatus] = useState(true)
  const [formPageTitle, setFormPageTitle] = useState('')
  const [formMetaDescription, setFormMetaDescription] = useState('')
  const [formMetaKeywords, setFormMetaKeywords] = useState('')

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [cProductId, setCProductId] = useState('')
  const [cLabelId, setCLabelId] = useState('')
  const [cName, setCName] = useState('')
  const [cSlug, setCSlug] = useState('')
  const [cSortOrder, setCSortOrder] = useState('0')
  const [cStatus, setCStatus] = useState(true)
  const [cHasChildren, setCHasChildren] = useState(0)
  const [cPageTitle, setCPageTitle] = useState('')
  const [cMetaDescription, setCMetaDescription] = useState('')
  const [cMetaKeywords, setCMetaKeywords] = useState('')

  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const productIdNum = parseInt(productFilter.trim(), 10)
  const labelIdNum = parseInt(labelFilter.trim(), 10)
  const hasFilter =
    productFilter.trim().length > 0 || labelFilter.trim().length > 0

  const buildListParams = useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (Number.isFinite(productIdNum) && productIdNum >= 1) params.set('product', String(productIdNum))
    if (Number.isFinite(labelIdNum) && labelIdNum >= 1) params.set('label', String(labelIdNum))
    return params
  }, [page, limit, productIdNum, labelIdNum])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = buildListParams()
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/label_to_products?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Liste alınamadı'
        )
        setItems([])
        setTotal(0)
        return
      }
      let { items: rows, total: t } = extractLabelToProductsList(data)
      const countParams = new URLSearchParams(params)
      const resCount = await fetch(`${API_URL}/api/ideasoft/admin-api/label_to_products/count?${countParams}`)
      if (resCount.ok) {
        try {
          const countData = await parseJsonResponse<unknown>(resCount)
          const c = parseCount(countData)
          if (c != null) t = c
        } catch {
          /* */
        }
      }
      setTotal(t)
      setItems(rows)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [buildListParams])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  const populateFormFromRecord = (r: IdeasoftLabelToProductRow) => {
    const lb = r.label ?? {}
    setFormName((lb.name ?? '').trim())
    setFormSlug((lb.slug ?? '').trim())
    setFormSortOrder(String(lb.sortOrder ?? 0))
    setFormStatus(lb.status !== 0)
    setFormPageTitle((lb.pageTitle ?? '').trim())
    setFormMetaDescription((lb.metaDescription ?? '').trim())
    setFormMetaKeywords((lb.metaKeywords ?? '').trim())
  }

  const openEdit = useCallback(async (linkId: number) => {
    setEditOpen(true)
    setEditLoading(true)
    setRecord(null)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/label_to_products/${linkId}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Detay',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Kayıt alınamadı'
        )
        setEditOpen(false)
        return
      }
      const r = data as IdeasoftLabelToProductRow
      setRecord(r)
      populateFormFromRecord(r)
    } catch (e) {
      toastError('Detay', e instanceof Error ? e.message : 'Kayıt alınamadı')
      setEditOpen(false)
    } finally {
      setEditLoading(false)
    }
  }, [])

  const closeEdit = useCallback(() => {
    setEditOpen(false)
    setRecord(null)
  }, [])

  const validateLabelForm = (): string | null => {
    const name = formName.trim()
    if (!name || name.length > 255) return 'Etiket adı (name) zorunlu, en fazla 255 karakter (PDF).'
    const slug = formSlug.trim()
    if (slug && (slug.length > 255 || !SLUG_RE.test(slug)))
      return 'Slug yalnızca küçük harf, rakam ve tire; en fazla 255 karakter (PDF).'
    const so = parseInt(formSortOrder, 10)
    if (!Number.isFinite(so) || so < 0 || so > 999) return 'sortOrder 0–999 arası olmalıdır (PDF).'
    return null
  }

  const handleSave = async () => {
    if (!record) return
    const err = validateLabelForm()
    if (err) {
      toastError('Doğrulama', err)
      return
    }
    const so = parseInt(formSortOrder, 10)
    const nextLabel: IdeasoftLabelNested = {
      ...(record.label ?? {}),
      name: formName.trim(),
      slug: formSlug.trim() || undefined,
      sortOrder: so,
      status: formStatus ? 1 : 0,
      pageTitle: formPageTitle.trim() || undefined,
      metaDescription: formMetaDescription.trim() || undefined,
      metaKeywords: formMetaKeywords.trim() || undefined,
    }
    const body: Record<string, unknown> = {
      id: record.id,
      label: nextLabel as unknown as Record<string, unknown>,
      product: record.product,
    }
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/label_to_products/${record.id}`, {
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Kaydet',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Güncellenemedi'
        )
        return
      }
      toastSuccess('Kayıt güncellendi (PUT).')
      closeEdit()
      void fetchList()
    } catch (e) {
      toastError('Kaydet', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!record) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/label_to_products/${record.id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        const data = await parseJsonResponse<{ error?: string; hint?: string }>(res).catch(() => ({}))
        toastError('Sil', formatIdeasoftProxyErrorForUi(data) || `HTTP ${res.status}`)
        return
      }
      toastSuccess('Bağ silindi (204).')
      setDeleteOpen(false)
      closeEdit()
      void fetchList()
    } catch (e) {
      toastError('Sil', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setDeleting(false)
    }
  }

  const resetCreate = () => {
    setCProductId('')
    setCLabelId('')
    setCName('')
    setCSlug('')
    setCSortOrder('0')
    setCStatus(true)
    setCHasChildren(0)
    setCPageTitle('')
    setCMetaDescription('')
    setCMetaKeywords('')
  }

  const submitCreate = async () => {
    const pid = parseInt(cProductId.trim(), 10)
    const lid = parseInt(cLabelId.trim(), 10)
    if (!Number.isFinite(pid) || pid < 1) {
      toastError('Doğrulama', 'Ürün id (product.id) ≥ 1 olmalıdır (PDF).')
      return
    }
    if (!Number.isFinite(lid) || lid < 1) {
      toastError('Doğrulama', 'Etiket id (label.id) ≥ 1 olmalıdır (PDF).')
      return
    }
    const name = cName.trim()
    if (!name || name.length > 255) {
      toastError('Doğrulama', 'Etiket adı (label.name) zorunlu, ≤255 karakter (PDF).')
      return
    }
    const slug = cSlug.trim()
    if (slug && (slug.length > 255 || !SLUG_RE.test(slug))) {
      toastError('Doğrulama', 'Slug geçersiz (PDF).')
      return
    }
    const so = parseInt(cSortOrder, 10)
    if (!Number.isFinite(so) || so < 0 || so > 999) {
      toastError('Doğrulama', 'sortOrder 0–999 (PDF).')
      return
    }
    const hc = cHasChildren === 1 ? 1 : 0
    setCreateSaving(true)
    try {
      const pres = await fetch(`${API_URL}/api/ideasoft/admin-api/products/${pid}`)
      const pdata = await parseJsonResponse<unknown>(pres)
      if (!pres.ok) {
        toastError(
          'Ürün',
          formatIdeasoftProxyErrorForUi(pdata as { error?: string; hint?: string }) || 'Ürün GET başarısız'
        )
        return
      }
      if (!pdata || typeof pdata !== 'object') {
        toastError('Ürün', 'Geçersiz ürün yanıtı')
        return
      }
      const labelBody: IdeasoftLabelNested = {
        id: lid,
        name,
        ...(slug ? { slug } : {}),
        sortOrder: so,
        status: cStatus ? 1 : 0,
        hasChildren: hc,
        ...(cPageTitle.trim() ? { pageTitle: cPageTitle.trim() } : {}),
        ...(cMetaDescription.trim() ? { metaDescription: cMetaDescription.trim() } : {}),
        ...(cMetaKeywords.trim() ? { metaKeywords: cMetaKeywords.trim() } : {}),
      }
      const body = {
        label: labelBody,
        product: pdata as Record<string, unknown>,
      }
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/label_to_products`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        toastError(
          'Oluştur',
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'POST başarısız'
        )
        return
      }
      toastSuccess('Bağ oluşturuldu (POST).')
      setCreateOpen(false)
      resetCreate()
      void fetchList()
    } catch (e) {
      toastError('Oluştur', e instanceof Error ? e.message : 'İstek başarısız')
    } finally {
      setCreateSaving(false)
    }
  }

  return (
    <PageLayout
      title="IdeaSoft — Kişisel Etiketler"
      description="Ürün ↔ kişisel etiket bağları: label_to_products (ProductLabel Admin API PDF)."
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
                type="number"
                min={1}
                placeholder="Ürün id (product)"
                value={productFilter}
                onChange={(e) => setListState({ productFilter: e.target.value, page: 1 })}
                className="pl-8 w-40 h-9 rounded-r-none border-r-0"
              />
            </div>
            <Input
              type="number"
              min={1}
              placeholder="Etiket id (label)"
              value={labelFilter}
              onChange={(e) => setListState({ labelFilter: e.target.value, page: 1 })}
              className="w-40 h-9 rounded-md border border-input"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setListState({ productFilter: '', labelFilter: '', page: 1 })}
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
            <TooltipContent>Yeni bağ (POST)</TooltipContent>
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
                Kaynak yol: <code className="text-xs">…/admin-api/label_to_products</code> (ürün–etiket ilişkisi).
              </p>
              <p>
                <strong className="text-foreground">LIST</strong> — <code>GET …/label_to_products</code>. Sorgu:{' '}
                <code>id</code>, <code>ids</code>, <code>label</code> (etiket id), <code>limit</code> (1–100, varsayılan
                20), <code>page</code> (≥1), <code>product</code> (ürün id), <code>q</code>, <code>sinceId</code>. Yetki:{' '}
                <code>product_read</code>.
              </p>
              <p>
                <strong className="text-foreground">COUNT</strong> — <code>GET …/label_to_products/count</code>; aynı
                sorgu parametreleri.
              </p>
              <p>
                <strong className="text-foreground">GET</strong> — <code>GET …/label_to_products/{"{id}"}</code> (
                <code>id</code> bağ kaydı). Yetki: <code>product_read</code>.
              </p>
              <p>
                <strong className="text-foreground">POST</strong> — <code>POST …/label_to_products</code>. Gövde:{' '}
                <code>label</code> nesnesi (zorunlu alanlar PDF’de), <code>product</code> ürün detay nesnesi (zorunlu).
                Yetki: <code>product_create</code>.
              </p>
              <p>
                <strong className="text-foreground">PUT</strong> — <code>PUT …/label_to_products/{"{id}"}</code>. Yetki:{' '}
                <code>product_update</code>.
              </p>
              <p>
                <strong className="text-foreground">DELETE</strong> — <code>DELETE …/label_to_products/{"{id}"}</code>.
                Yanıt <code>204</code>. Yetki: <code>product_delete</code>.
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
                  <th className="text-left p-2 font-medium w-20">Bağ ID</th>
                  <th className="text-left p-2 font-medium w-24">Etiket ID</th>
                  <th className="text-left p-2 font-medium min-w-[140px]">Etiket</th>
                  <th className="text-left p-2 font-medium w-24">Ürün ID</th>
                  <th className="text-left p-2 font-medium min-w-[160px]">Ürün adı</th>
                  <th className="text-left p-2 font-medium w-32">SKU</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      Kayıt yok. Ürün veya etiket id ile süzebilirsiniz.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => {
                    const p = row.product as Record<string, unknown> | undefined
                    const pid = typeof p?.id === 'number' ? p.id : '—'
                    return (
                      <tr
                        key={row.id}
                        tabIndex={0}
                        className="border-b border-border/60 hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        onClick={() => void openEdit(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            void openEdit(row.id)
                          }
                        }}
                      >
                        <td className="p-2 tabular-nums">{row.id}</td>
                        <td className="p-2 tabular-nums">{row.label?.id ?? '—'}</td>
                        <td className="p-2 max-w-xs truncate" title={row.label?.name ?? ''}>
                          {row.label?.name?.trim() || '—'}
                        </td>
                        <td className="p-2 tabular-nums">{pid}</td>
                        <td className="p-2 max-w-md truncate" title={productTitle(p)}>
                          {productTitle(p)}
                        </td>
                        <td className="p-2 font-mono text-xs truncate" title={productSku(p)}>
                          {productSku(p)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Ürün etiketi bağı #{record?.id ?? '—'}</DialogTitle>
          </DialogHeader>
          {editLoading ? (
            <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
          ) : record ? (
            <Tabs defaultValue="label" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="shrink-0 w-full justify-start">
                <TabsTrigger value="label">Etiket</TabsTrigger>
                <TabsTrigger value="product">Ürün (salt okunur)</TabsTrigger>
              </TabsList>
              <TabsContent value="label" className="flex-1 min-h-0 overflow-y-auto space-y-3 mt-3 text-sm">
                <div className="space-y-1">
                  <Label htmlFor="pl-name">label.name</Label>
                  <Input id="pl-name" value={formName} onChange={(e) => setFormName(e.target.value)} maxLength={255} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pl-slug">label.slug</Label>
                  <Input
                    id="pl-slug"
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    placeholder="indirimli-urunler"
                    maxLength={255}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pl-so">label.sortOrder (0–999)</Label>
                  <Input
                    id="pl-so"
                    type="number"
                    min={0}
                    max={999}
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <div>
                    <p className="font-medium text-foreground">label.status</p>
                    <p className="text-xs text-muted-foreground">1 = Aktif, 0 = Pasif (PDF)</p>
                  </div>
                  <Switch checked={formStatus} onCheckedChange={setFormStatus} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pl-pt">label.pageTitle</Label>
                  <Input
                    id="pl-pt"
                    value={formPageTitle}
                    onChange={(e) => setFormPageTitle(e.target.value)}
                    maxLength={255}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pl-md">label.metaDescription</Label>
                  <Textarea
                    id="pl-md"
                    value={formMetaDescription}
                    onChange={(e) => setFormMetaDescription(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pl-mk">label.metaKeywords</Label>
                  <Textarea
                    id="pl-mk"
                    value={formMetaKeywords}
                    onChange={(e) => setFormMetaKeywords(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  label.hasChildren PDF’de otomatik; bu ekranda değiştirilmez. PUT gövdesinde ürün nesnesi GET ile aynı
                  gönderilir.
                </p>
              </TabsContent>
              <TabsContent value="product" className="flex-1 min-h-0 overflow-y-auto mt-3">
                <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto max-h-[50vh]">
                  {JSON.stringify(record.product ?? {}, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          ) : null}
          <DialogFooter className="shrink-0 border-t pt-4 gap-2 flex-row justify-between">
            <Button
              type="button"
              variant="delete"
              size="icon"
              disabled={!record || editLoading}
              onClick={() => setDeleteOpen(true)}
              aria-label="Sil"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeEdit}>
                Kapat
              </Button>
              <Button type="button" variant="save" disabled={!record || saving} onClick={() => void handleSave()}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o) resetCreate()
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Yeni ürün–etiket bağı (POST)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 text-sm">
            <p className="text-xs text-muted-foreground">
              Ürün gövdesi <code>GET …/products/{"{id}"}</code> ile alınır (PDF’de product nesnesi zorunlu).
            </p>
            <div className="space-y-1">
              <Label htmlFor="pl-c-pid">product.id</Label>
              <Input
                id="pl-c-pid"
                type="number"
                min={1}
                value={cProductId}
                onChange={(e) => setCProductId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-c-lid">label.id</Label>
              <Input
                id="pl-c-lid"
                type="number"
                min={1}
                value={cLabelId}
                onChange={(e) => setCLabelId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-c-name">label.name</Label>
              <Input id="pl-c-name" value={cName} onChange={(e) => setCName(e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-c-slug">label.slug</Label>
              <Input id="pl-c-slug" value={cSlug} onChange={(e) => setCSlug(e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-c-so">label.sortOrder</Label>
              <Input
                id="pl-c-so"
                type="number"
                min={0}
                max={999}
                value={cSortOrder}
                onChange={(e) => setCSortOrder(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <span className="font-medium">label.status</span>
              <Switch checked={cStatus} onCheckedChange={setCStatus} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <span className="font-medium">label.hasChildren</span>
                <p className="text-xs text-muted-foreground">PDF: 0 veya 1</p>
              </div>
              <Switch checked={cHasChildren === 1} onCheckedChange={(v) => setCHasChildren(v ? 1 : 0)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-c-pt">label.pageTitle</Label>
              <Input id="pl-c-pt" value={cPageTitle} onChange={(e) => setCPageTitle(e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-c-md">label.metaDescription</Label>
              <Textarea
                id="pl-c-md"
                value={cMetaDescription}
                onChange={(e) => setCMetaDescription(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pl-c-mk">label.metaKeywords</Label>
              <Textarea
                id="pl-c-mk"
                value={cMetaKeywords}
                onChange={(e) => setCMetaKeywords(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              İptal
            </Button>
            <Button type="button" variant="save" disabled={createSaving} onClick={() => void submitCreate()}>
              {createSaving ? 'Gönderiliyor...' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Bağı sil"
        description={`Bağ #${record?.id ?? '—'} silinecek (DELETE …/label_to_products/{id}, 204).`}
        onConfirm={() => void handleDelete()}
        loading={deleting}
      />
    </PageLayout>
  )
}
