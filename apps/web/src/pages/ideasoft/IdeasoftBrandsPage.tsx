import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Link2, Plus, Search, Save, Trash2, X } from 'lucide-react'
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
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toastSuccess, toastError } from '@/lib/toast'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Store API Brand — Brand GET / PUT / POST gövdeleri (IdeaSoft Store API PDF).
 * attachment: yalnızca yeni logo yüklendiğinde gönderilir (regex: ^data:image\/(jpeg|jpg|png|gif);base64,)
 */
export interface IdeasoftBrandListRow {
  id: number
  name?: string
  slug?: string
  sortOrder?: number
  status?: number
  distributor?: string
}

export interface IdeasoftBrandForm {
  id: number
  name: string
  slug: string
  sortOrder: number
  status: number
  distributorCode: string
  distributor: string
  imageFile: string
  showcaseContent: string
  displayShowcaseContent: number
  showcaseFooterContent: string
  displayShowcaseFooterContent: number
  metaKeywords: string
  metaDescription: string
  canonicalUrl: string
  pageTitle: string
  isSearchable: number
  createdAt: string
  updatedAt: string
}

export type IdeasoftStatusFilter = 'all' | 'active' | 'inactive'

const ATTACHMENT_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|gif);base64,/i
const CANONICAL_URL_RE = /^[a-z0-9-/]+$/

/**
 * Admin API Brand — `imageUrl` (Brand GET _ Admin API.pdf).
 * Örnek: //test.myideasoft.com/test/a/01/marka/marka.jpg → tarayıcıda https ile yüklenir.
 */
export function normalizeIdeasoftAdminBrandImageUrl(imageUrl: string | undefined | null): string | null {
  const s = (imageUrl || '').trim()
  if (!s) return null
  if (s.startsWith('//')) return `https:${s}`
  if (/^https?:\/\//i.test(s)) return s
  return null
}

interface IdeasoftAdminBrandLite {
  id: number
  imageUrl?: string
}

function parseIdeasoftAdminBrandLite(x: unknown): IdeasoftAdminBrandLite | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const id = Number(o.id)
  if (!Number.isFinite(id)) return null
  const imageUrl = typeof o.imageUrl === 'string' ? o.imageUrl : undefined
  return { id, imageUrl }
}

/** Admin API Brand LIST yanıtı (hydra / data) — üyelerde `imageUrl` */
function extractIdeasoftAdminBrandListMembers(json: unknown): IdeasoftAdminBrandLite[] {
  if (Array.isArray(json)) {
    return json.map(parseIdeasoftAdminBrandLite).filter((x): x is IdeasoftAdminBrandLite => x != null)
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      return hydra.map(parseIdeasoftAdminBrandLite).filter((x): x is IdeasoftAdminBrandLite => x != null)
    }
    if (Array.isArray(o.data)) {
      return o.data.map(parseIdeasoftAdminBrandLite).filter((x): x is IdeasoftAdminBrandLite => x != null)
    }
  }
  return []
}

function IdeasoftBrandLogoAvatar({
  imageUrlRaw,
  name,
}: {
  imageUrlRaw?: string
  name?: string
}) {
  const src = normalizeIdeasoftAdminBrandImageUrl(imageUrlRaw ?? null)
  const initial = (name || '?').trim().slice(0, 1).toUpperCase() || '?'
  return (
    <Avatar className="h-9 w-9 rounded-md border border-border bg-muted/40 shrink-0">
      {src ? <AvatarImage src={src} alt="" className="object-contain p-0.5" /> : null}
      <AvatarFallback className="rounded-md text-[10px] font-medium">{initial}</AvatarFallback>
    </Avatar>
  )
}

interface MasterBrand {
  id: number
  name: string
  code?: string
}

/** ideasoft_brand_id (string) → master product_brands.id (string) */
function applyIdeasoftBrandMapping(
  prev: Record<string, string>,
  ideasoftBrandId: string,
  masterBrandId: string
): Record<string, string> {
  const next = { ...prev }
  for (const [k, v] of Object.entries(next)) {
    if (v === masterBrandId && k !== ideasoftBrandId) delete next[k]
  }
  next[ideasoftBrandId] = masterBrandId
  return next
}

function removeIdeasoftBrandMappingKey(
  prev: Record<string, string>,
  ideasoftBrandId: string
): Record<string, string> {
  const next = { ...prev }
  delete next[ideasoftBrandId]
  return next
}

const listDefaults = {
  search: '',
  page: 1,
  pageSize: 25 as PageSizeValue,
  fitLimit: 10,
  statusFilter: 'active' as IdeasoftStatusFilter,
}

function extractBrandsList(json: unknown): { items: IdeasoftBrandListRow[]; total: number } {
  if (Array.isArray(json)) {
    return { items: json as IdeasoftBrandListRow[], total: json.length }
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) {
      const total =
        typeof o['hydra:totalItems'] === 'number' ? (o['hydra:totalItems'] as number) : hydra.length
      return { items: hydra as IdeasoftBrandListRow[], total }
    }
    if (Array.isArray(o.data)) {
      const d = o.data as IdeasoftBrandListRow[]
      const total = typeof o.total === 'number' ? o.total : d.length
      return { items: d, total }
    }
  }
  return { items: [], total: 0 }
}

function emptyBrandForm(): IdeasoftBrandForm {
  return {
    id: 0,
    name: '',
    slug: '',
    sortOrder: 999,
    status: 1,
    distributorCode: '',
    distributor: '',
    imageFile: '',
    showcaseContent: '',
    displayShowcaseContent: 0,
    showcaseFooterContent: '',
    displayShowcaseFooterContent: 0,
    metaKeywords: '',
    metaDescription: '',
    canonicalUrl: '',
    pageTitle: '',
    isSearchable: 0,
    createdAt: '',
    updatedAt: '',
  }
}

function mapApiToForm(data: Record<string, unknown>): IdeasoftBrandForm {
  return {
    id: Number(data.id) || 0,
    name: String(data.name ?? ''),
    slug: String(data.slug ?? ''),
    sortOrder: Math.min(999, Math.max(1, Number(data.sortOrder) || 1)),
    status: Number(data.status) === 1 ? 1 : 0,
    distributorCode: String(data.distributorCode ?? ''),
    distributor: String(data.distributor ?? ''),
    imageFile: String(data.imageFile ?? ''),
    showcaseContent: String(data.showcaseContent ?? ''),
    displayShowcaseContent: Number(data.displayShowcaseContent) === 1 ? 1 : 0,
    showcaseFooterContent: String(data.showcaseFooterContent ?? ''),
    displayShowcaseFooterContent: Number(data.displayShowcaseFooterContent) === 1 ? 1 : 0,
    metaKeywords: String(data.metaKeywords ?? ''),
    metaDescription: String(data.metaDescription ?? ''),
    canonicalUrl: String(data.canonicalUrl ?? ''),
    pageTitle: String(data.pageTitle ?? ''),
    isSearchable: Number(data.isSearchable) === 1 ? 1 : 0,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  }
}

function buildJsonPayload(
  form: IdeasoftBrandForm,
  mode: 'create' | 'edit',
  newAttachment: string | null
): Record<string, unknown> {
  const sortOrder = Math.min(999, Math.max(1, Number(form.sortOrder) || 1))
  const payload: Record<string, unknown> = {
    name: form.name.trim().slice(0, 255),
    slug: form.slug.trim().slice(0, 255),
    sortOrder,
    status: form.status ? 1 : 0,
    distributorCode: form.distributorCode.trim().slice(0, 255),
    distributor: form.distributor.trim().slice(0, 255),
    imageFile: form.imageFile.trim().slice(0, 255),
    showcaseContent: form.showcaseContent.slice(0, 65535),
    displayShowcaseContent: form.displayShowcaseContent ? 1 : 0,
    showcaseFooterContent: form.showcaseFooterContent.slice(0, 65535),
    displayShowcaseFooterContent: form.displayShowcaseFooterContent ? 1 : 0,
    metaKeywords: form.metaKeywords.slice(0, 65535),
    metaDescription: form.metaDescription.slice(0, 65535),
    canonicalUrl: form.canonicalUrl.trim().slice(0, 255),
    pageTitle: form.pageTitle.trim().slice(0, 255),
    isSearchable: form.isSearchable ? 1 : 0,
  }
  if (mode === 'edit') {
    payload.id = form.id
    if (form.updatedAt) payload.updatedAt = form.updatedAt
  }
  if (newAttachment && ATTACHMENT_DATA_URL_RE.test(newAttachment)) {
    payload.attachment = newAttachment
  }
  return payload
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error ?? new Error('Dosya okunamadı'))
    r.readAsDataURL(file)
  })
}

export function IdeasoftBrandsPage() {
  const [listState, setListState] = usePersistedListState('ideasoft-brands-v1', listDefaults)
  const { search, page, pageSize, fitLimit, statusFilter } = listState
  const [items, setItems] = useState<IdeasoftBrandListRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('edit')
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<IdeasoftBrandForm>(emptyBrandForm())
  const [saving, setSaving] = useState(false)
  const [loadDetailPending, setLoadDetailPending] = useState(false)
  const [newAttachment, setNewAttachment] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [masterBrands, setMasterBrands] = useState<MasterBrand[]>([])
  const [masterLoading, setMasterLoading] = useState(false)
  const [brandMappings, setBrandMappings] = useState<Record<string, string>>({})
  const [mappingsLoading, setMappingsLoading] = useState(false)
  const [matchPickerRow, setMatchPickerRow] = useState<IdeasoftBrandListRow | null>(null)
  const [matchPickerSearch, setMatchPickerSearch] = useState('')
  const [matchPickerSelectedMasterId, setMatchPickerSelectedMasterId] = useState<number | null>(null)
  const [savingMapping, setSavingMapping] = useState(false)
  /** Admin API `imageUrl` (ham) — id ile eşleşir; liste görselleri yalnızca buradan */
  const [adminBrandImageUrlById, setAdminBrandImageUrlById] = useState<Record<number, string>>({})
  const adminLogoFetchGen = useRef(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const limit =
    pageSize === 'fit' ? Math.min(100, Math.max(1, fitLimit)) : Math.min(100, Math.max(1, pageSize))
  const hasFilter = search.length > 0 || statusFilter !== 'active'

  const loadAdminBrandImageUrls = useCallback(async () => {
    const gen = ++adminLogoFetchGen.current
    const map: Record<number, string> = {}
    try {
      let p = 1
      const lim = 100
      while (p <= 500) {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(lim),
          sort: 'id',
        })
        const res = await fetch(`${API_URL}/api/ideasoft/admin-api/brands?${params}`)
        const data = await parseJsonResponse<unknown>(res)
        if (gen !== adminLogoFetchGen.current) return
        if (!res.ok) break
        const chunk = extractIdeasoftAdminBrandListMembers(data)
        if (chunk.length === 0) break
        for (const m of chunk) {
          const u = m.imageUrl?.trim()
          if (u) map[m.id] = u
        }
        if (chunk.length < lim) break
        p += 1
      }
      if (gen !== adminLogoFetchGen.current) return
      setAdminBrandImageUrlById(map)
    } catch {
      if (gen !== adminLogoFetchGen.current) return
      setAdminBrandImageUrlById({})
    }
  }, [])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: 'id',
      })
      if (search.trim()) {
        params.set('name', search.trim())
      }
      if (statusFilter === 'active') {
        params.set('status', '1')
      } else if (statusFilter === 'inactive') {
        params.set('status', '0')
      }
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands?${params}`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) {
        setListError(
          formatIdeasoftProxyErrorForUi(data as { error?: string; hint?: string }) || 'Liste alınamadı'
        )
        setItems([])
        setTotal(0)
        setAdminBrandImageUrlById({})
        return
      }
      const { items: rows, total: t } = extractBrandsList(data)
      setItems(rows)
      setTotal(t)
      void loadAdminBrandImageUrls()
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Liste alınamadı')
      setItems([])
      setTotal(0)
      setAdminBrandImageUrlById({})
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter, loadAdminBrandImageUrls])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/brand-mappings`)
      const data = await parseJsonResponse<{ mappings?: Record<string, string> }>(res)
      setBrandMappings(data.mappings && typeof data.mappings === 'object' ? data.mappings : {})
    } catch {
      setBrandMappings({})
    } finally {
      setMappingsLoading(false)
    }
  }, [])

  const fetchMasterBrands = useCallback(async () => {
    setMasterLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/product-brands?limit=9999`)
      const data = await parseJsonResponse<{ data?: { id: number; name: string; code?: string }[]; error?: string }>(
        res
      )
      if (!res.ok) throw new Error(data.error || 'Master markalar yüklenemedi')
      setMasterBrands(
        (data.data ?? []).map((x) => ({
          id: x.id,
          name: x.name,
          code: x.code,
        }))
      )
    } catch {
      setMasterBrands([])
    } finally {
      setMasterLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMappings()
    fetchMasterBrands()
  }, [fetchMappings, fetchMasterBrands])

  const masterById = useMemo(() => new Map(masterBrands.map((b) => [b.id, b])), [masterBrands])

  const matchPickerFilteredBrands = useMemo(() => {
    const q = matchPickerSearch.trim().toLowerCase()
    if (!q) return masterBrands
    return masterBrands.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.code && b.code.toLowerCase().includes(q)) ||
        String(b.id).includes(q)
    )
  }, [masterBrands, matchPickerSearch])

  const openMatchPicker = (row: IdeasoftBrandListRow, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMatchPickerRow(row)
    setMatchPickerSearch('')
    const cur = brandMappings[String(row.id)]
    setMatchPickerSelectedMasterId(cur ? parseInt(cur, 10) || null : null)
  }

  const closeMatchPicker = () => {
    setMatchPickerRow(null)
    setMatchPickerSearch('')
    setMatchPickerSelectedMasterId(null)
  }

  const saveBrandMapping = async () => {
    if (!matchPickerRow || matchPickerSelectedMasterId == null) return
    const isKey = String(matchPickerRow.id)
    const masterKey = String(matchPickerSelectedMasterId)
    setSavingMapping(true)
    try {
      const next = applyIdeasoftBrandMapping(brandMappings, isKey, masterKey)
      const res = await fetch(`${API_URL}/api/ideasoft/brand-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setBrandMappings(next)
      toastSuccess('Eşleştirildi', 'IdeaSoft markası master marka ile bağlandı.')
      closeMatchPicker()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const clearBrandMapping = async () => {
    if (!matchPickerRow) return
    const isKey = String(matchPickerRow.id)
    setSavingMapping(true)
    try {
      const next = removeIdeasoftBrandMappingKey(brandMappings, isKey)
      const res = await fetch(`${API_URL}/api/ideasoft/brand-mappings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: next }),
      })
      const data = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
      setBrandMappings(next)
      toastSuccess('Kaldırıldı', 'Master marka eşleştirmesi silindi.')
      closeMatchPicker()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSavingMapping(false)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditId(null)
    setModalMode('edit')
    setForm(emptyBrandForm())
    setNewAttachment(null)
  }

  const openNew = () => {
    setModalMode('create')
    setEditId(null)
    setForm(emptyBrandForm())
    setNewAttachment(null)
    setModalOpen(true)
  }

  const openEdit = async (row: IdeasoftBrandListRow) => {
    setModalMode('edit')
    setEditId(row.id)
    setModalOpen(true)
    setLoadDetailPending(true)
    setForm(emptyBrandForm())
    setNewAttachment(null)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands/${row.id}`)
      const data = await parseJsonResponse<Record<string, unknown> & { error?: string; hint?: string }>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Kayıt yüklenemedi')
      setForm(mapApiToForm(data))
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Yüklenemedi')
      closeModal()
    } finally {
      setLoadDetailPending(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) {
      toastError('Doğrulama', 'Marka adı (name) zorunludur.')
      return
    }
    const cu = form.canonicalUrl.trim()
    if (cu && !CANONICAL_URL_RE.test(cu)) {
      toastError(
        'Doğrulama',
        'Canonical URL yalnızca küçük harf, rakam, tire ve / içerebilir (örn. marka/idea-kalem).'
      )
      return
    }

    setSaving(true)
    try {
      const payload = buildJsonPayload(form, modalMode === 'edit' ? 'edit' : 'create', newAttachment)
      if (modalMode === 'create') {
        const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await parseJsonResponse<{ error?: string; hint?: string }>(res)
        if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Oluşturulamadı')
        toastSuccess('Oluşturuldu', 'Marka eklendi.')
      } else {
        if (editId == null) return
        const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await parseJsonResponse<{ error?: string; hint?: string }>(res)
        if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Güncellenemedi')
        toastSuccess('Kaydedildi', 'Marka güncellendi.')
      }
      closeModal()
      fetchList()
    } catch (err) {
      toastError('Kayıt hatası', err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (editId == null) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/store-api/brands/${editId}`, { method: 'DELETE' })
      if (res.ok && res.status === 204) {
        toastSuccess('Silindi', 'Marka kaldırıldı.')
        setDeleteOpen(false)
        closeModal()
        fetchList()
        return
      }
      const data = await parseJsonResponse<{ error?: string; hint?: string }>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Silinemedi')
      toastSuccess('Silindi', 'Marka kaldırıldı.')
      setDeleteOpen(false)
      closeModal()
      fetchList()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageLayout
      title="IdeaSoft — Markalar"
      description="Liste Store API; logo yalnızca Admin API Brand.imageUrl. Master eşleştirme Parametreler › Markalar."
      backTo="/ideasoft"
      contentRef={contentRef}
      contentOverflow="hidden"
      showRefresh
      onRefresh={() => {
        void fetchList()
        void fetchMappings()
        void fetchMasterBrands()
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Marka adı (name)..."
                  value={search}
                  onChange={(e) => setListState({ search: e.target.value, page: 1 })}
                  className="pl-8 w-56 h-9 rounded-r-none border-r-0"
                />
              </div>
              <div
                role="group"
                aria-label="Kayıt durumu"
                className="inline-flex rounded-r-md border border-l-0 border-input bg-muted/30 p-0.5 shrink-0"
              >
                {(
                  [
                    { key: 'all' as const, label: 'Tümü' },
                    { key: 'active' as const, label: 'Aktif' },
                    { key: 'inactive' as const, label: 'Pasif' },
                  ] as const
                ).map(({ key, label }) => {
                  const isActive = statusFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={label}
                      onClick={() => setListState({ statusFilter: key, page: 1 })}
                      className={cn(
                        'h-9 px-2.5 text-xs font-medium transition-colors first:rounded-l-none last:rounded-r-md cursor-pointer inline-flex items-center justify-center',
                        isActive
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setListState({ search: '', statusFilter: 'active', page: 1 })}
                  className={`h-9 w-9 shrink-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Arama ve filtreyi sıfırla</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={openNew} className="h-9 w-9 shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Yeni marka (POST)</TooltipContent>
            </Tooltip>
          </div>
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
                  <th className="text-center p-2 font-medium w-14">Logo</th>
                  <th className="text-left p-2 font-medium">ID</th>
                  <th className="text-left p-2 font-medium">Ad</th>
                  <th className="text-left p-2 font-medium">Slug</th>
                  <th className="text-center p-2 font-medium w-20">Sıra</th>
                  <th className="text-center p-2 font-medium w-24">Durum</th>
                  <th className="text-left p-2 font-medium min-w-[120px]">Master</th>
                  <th className="text-center p-2 font-medium w-[108px]">Eşleştir</th>
                  <th className="text-left p-2 font-medium">Tedarikçi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Yükleniyor...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Kayıt yok veya liste boş.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      aria-label={`${row.name || 'Marka'} detayını aç`}
                      className={cn(
                        'border-b border-border/60 hover:bg-muted/40 cursor-pointer',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                      )}
                      onClick={() => {
                        void openEdit(row)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          void openEdit(row)
                        }
                      }}
                    >
                      <td className="p-2 align-middle text-center w-14">
                        <div className="inline-flex justify-center">
                          <IdeasoftBrandLogoAvatar
                            imageUrlRaw={adminBrandImageUrlById[row.id]}
                            name={row.name}
                          />
                        </div>
                      </td>
                      <td className="p-2 tabular-nums">{row.id}</td>
                      <td className="p-2 font-medium">{row.name ?? '—'}</td>
                      <td className="p-2 text-muted-foreground">{row.slug ?? '—'}</td>
                      <td className="p-2 text-center tabular-nums">{row.sortOrder ?? '—'}</td>
                      <td className="p-2 text-center">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            row.status === 1
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {row.status === 1 ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>
                      <td className="p-2 text-muted-foreground truncate max-w-[180px]">
                        {(() => {
                          const mid = brandMappings[String(row.id)]
                          if (!mid) return mappingsLoading ? '…' : '—'
                          const mb = masterById.get(parseInt(mid, 10))
                          if (!mb) return <span className="tabular-nums">#{mid}</span>
                          return (
                            <span
                              className="text-foreground"
                              title={mb.code ? `${mb.name} [${mb.code}]` : mb.name}
                            >
                              <span className="truncate">{mb.name}</span>
                              {mb.code && (
                                <span className="text-xs text-muted-foreground ml-1 shrink-0">
                                  [{mb.code}]
                                </span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-xs gap-1"
                              onClick={(e) => openMatchPicker(row, e)}
                              disabled={masterLoading}
                            >
                              <Link2 className="h-3.5 w-3.5 shrink-0" />
                              Eşleştir
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Master marka seç (Parametreler › Markalar)</TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                        {row.distributor ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'create' ? 'Yeni marka' : `Marka düzenle #${editId}`}
            </DialogTitle>
          </DialogHeader>
          {loadDetailPending ? (
            <p className="text-sm text-muted-foreground py-6">Yükleniyor...</p>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <Tabs defaultValue="genel" className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <TabsList className="shrink-0 grid w-full grid-cols-3">
                  <TabsTrigger value="genel">Genel</TabsTrigger>
                  <TabsTrigger value="vitrin">Vitrin</TabsTrigger>
                  <TabsTrigger value="seo">SEO</TabsTrigger>
                </TabsList>
                <div className="flex-1 min-h-0 overflow-y-auto py-4 pr-1">
                  <TabsContent value="genel" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <Label htmlFor="b-name">Ad (name) *</Label>
                        <Input
                          id="b-name"
                          maxLength={255}
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2 col-span-2 sm:col-span-1">
                        <Label htmlFor="b-slug">Slug</Label>
                        <Input
                          id="b-slug"
                          maxLength={255}
                          value={form.slug}
                          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="b-sort">Sıra (sortOrder, 1–999) *</Label>
                        <Input
                          id="b-sort"
                          type="number"
                          min={1}
                          max={999}
                          value={form.sortOrder}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              sortOrder: Math.min(999, Math.max(1, parseInt(e.target.value, 10) || 1)),
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                        <Label htmlFor="b-st">Durum (status)</Label>
                        <Switch
                          id="b-st"
                          checked={form.status === 1}
                          onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="b-distcode">Tedarikçi kodu (distributorCode)</Label>
                        <Input
                          id="b-distcode"
                          maxLength={255}
                          value={form.distributorCode}
                          onChange={(e) => setForm((f) => ({ ...f, distributorCode: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="b-dist">Tedarikçi adı (distributor)</Label>
                        <Input
                          id="b-dist"
                          maxLength={255}
                          value={form.distributor}
                          onChange={(e) => setForm((f) => ({ ...f, distributor: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="b-img">Logo dosya adı (imageFile)</Label>
                        <Input
                          id="b-img"
                          maxLength={255}
                          placeholder="örn. kalem.jpg"
                          value={form.imageFile}
                          onChange={(e) => setForm((f) => ({ ...f, imageFile: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="b-file">Yeni logo (attachment, JPEG/PNG/GIF → base64)</Label>
                        <Input
                          id="b-file"
                          type="file"
                          accept="image/jpeg,image/png,image/gif,.jpg,.jpeg,.png,.gif"
                          className="cursor-pointer"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) {
                              setNewAttachment(null)
                              return
                            }
                            try {
                              const dataUrl = await readFileAsDataUrl(file)
                              if (!ATTACHMENT_DATA_URL_RE.test(dataUrl)) {
                                toastError('Dosya', 'Yalnızca JPEG, PNG veya GIF yükleyin.')
                                setNewAttachment(null)
                                return
                              }
                              setNewAttachment(dataUrl)
                            } catch {
                              toastError('Dosya', 'Okunamadı.')
                              setNewAttachment(null)
                            }
                          }}
                        />
                        {newAttachment && (
                          <p className="text-xs text-muted-foreground">Yeni logo isteğe eklenecek (PUT/POST).</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-md border p-3 col-span-2">
                        <Label htmlFor="b-search">Aranabilir (isSearchable)</Label>
                        <Switch
                          id="b-search"
                          checked={form.isSearchable === 1}
                          onCheckedChange={(v) => setForm((f) => ({ ...f, isSearchable: v ? 1 : 0 }))}
                        />
                      </div>
                    </div>
                    {modalMode === 'edit' && (form.createdAt || form.updatedAt) && (
                      <p className="text-xs text-muted-foreground">
                        {form.createdAt && <>Oluşturulma: {form.createdAt} </>}
                        {form.updatedAt && <>· Güncellenme: {form.updatedAt}</>}
                      </p>
                    )}
                  </TabsContent>
                  <TabsContent value="vitrin" className="mt-0 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="b-sc">Üst içerik (showcaseContent, HTML)</Label>
                      <Textarea
                        id="b-sc"
                        rows={5}
                        maxLength={65535}
                        value={form.showcaseContent}
                        onChange={(e) => setForm((f) => ({ ...f, showcaseContent: e.target.value }))}
                        className="font-mono text-xs min-h-[120px]"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                      <Label htmlFor="b-dsc">Üst içerik göster (displayShowcaseContent)</Label>
                      <Switch
                        id="b-dsc"
                        checked={form.displayShowcaseContent === 1}
                        onCheckedChange={(v) =>
                          setForm((f) => ({ ...f, displayShowcaseContent: v ? 1 : 0 }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="b-sf">Alt içerik (showcaseFooterContent)</Label>
                      <Textarea
                        id="b-sf"
                        rows={4}
                        maxLength={65535}
                        value={form.showcaseFooterContent}
                        onChange={(e) => setForm((f) => ({ ...f, showcaseFooterContent: e.target.value }))}
                        className="font-mono text-xs min-h-[100px]"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                      <Label htmlFor="b-dsfc">Alt içerik göster (displayShowcaseFooterContent)</Label>
                      <Switch
                        id="b-dsfc"
                        checked={form.displayShowcaseFooterContent === 1}
                        onCheckedChange={(v) =>
                          setForm((f) => ({ ...f, displayShowcaseFooterContent: v ? 1 : 0 }))
                        }
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="seo" className="mt-0 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="b-mk">Meta anahtar kelimeler (metaKeywords)</Label>
                      <Textarea
                        id="b-mk"
                        rows={2}
                        maxLength={65535}
                        value={form.metaKeywords}
                        onChange={(e) => setForm((f) => ({ ...f, metaKeywords: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="b-md">Meta açıklama (metaDescription)</Label>
                      <Textarea
                        id="b-md"
                        rows={3}
                        maxLength={65535}
                        value={form.metaDescription}
                        onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="b-can">Canonical URL (domain hariç, ^[a-z0-9-/]+$)</Label>
                      <Input
                        id="b-can"
                        maxLength={255}
                        placeholder="marka/idea-kalem"
                        value={form.canonicalUrl}
                        onChange={(e) => setForm((f) => ({ ...f, canonicalUrl: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="b-pt">Sayfa başlığı (pageTitle)</Label>
                      <Input
                        id="b-pt"
                        maxLength={255}
                        value={form.pageTitle}
                        onChange={(e) => setForm((f) => ({ ...f, pageTitle: e.target.value }))}
                      />
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
              <DialogFooter className="shrink-0 gap-2 sm:gap-0 flex-col sm:flex-row sm:justify-between border-t pt-4 mt-2">
                <div>
                  {modalMode === 'edit' && editId != null && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setDeleteOpen(true)}
                      disabled={saving}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Sil
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 justify-end w-full sm:w-auto">
                  <Button type="button" variant="outline" onClick={closeModal}>
                    İptal
                  </Button>
                  <Button type="submit" variant="save" disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Kaydediliyor...' : modalMode === 'create' ? 'Oluştur' : 'Kaydet'}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!matchPickerRow} onOpenChange={(open) => !open && closeMatchPicker()}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Master marka eşleştir
              {matchPickerRow && (
                <span className="block text-sm font-normal text-muted-foreground mt-1 truncate">
                  IdeaSoft: {matchPickerRow.name ?? `#${matchPickerRow.id}`}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {matchPickerRow && (
            <>
              {brandMappings[String(matchPickerRow.id)] && (
                <p className="text-sm text-muted-foreground">
                  Mevcut:{' '}
                  <span className="text-foreground font-medium">
                    {(() => {
                      const id = parseInt(brandMappings[String(matchPickerRow.id)]!, 10)
                      const b = masterById.get(id)
                      return b ? `${b.name}${b.code ? ` [${b.code}]` : ''}` : `#${brandMappings[String(matchPickerRow.id)]}`
                    })()}
                  </span>
                </p>
              )}
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Master marka ara (ad, kod, id)..."
                  value={matchPickerSearch}
                  onChange={(e) => setMatchPickerSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto rounded-md border">
                {masterLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Master markalar yükleniyor…</div>
                ) : masterBrands.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Master marka yok. Önce Parametreler › Markalar üzerinden ekleyin.
                  </div>
                ) : matchPickerFilteredBrands.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Sonuç yok.</div>
                ) : (
                  <div className="p-1 space-y-0.5">
                    {matchPickerFilteredBrands.map((b) => {
                      const selected = matchPickerSelectedMasterId === b.id
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setMatchPickerSelectedMasterId(b.id)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 min-w-0',
                            selected ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/60'
                          )}
                        >
                          <span className="font-medium truncate min-w-0">{b.name}</span>
                          {b.code && (
                            <span className="text-xs text-muted-foreground shrink-0">[{b.code}]</span>
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-auto">
                            #{b.id}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:gap-0">
                <div className="flex gap-2 w-full sm:w-auto">
                  {brandMappings[String(matchPickerRow.id)] && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void clearBrandMapping()}
                      disabled={savingMapping}
                    >
                      Kaldır
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 justify-end w-full sm:w-auto">
                  <Button type="button" variant="outline" onClick={closeMatchPicker} disabled={savingMapping}>
                    İptal
                  </Button>
                  <Button
                    type="button"
                    variant="save"
                    disabled={savingMapping || matchPickerSelectedMasterId == null}
                    onClick={() => void saveBrandMapping()}
                  >
                    {savingMapping ? 'Kaydediliyor...' : 'Kaydet'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Markayı sil"
        description={`#${editId} numaralı marka IdeaSoft’tan silinecek (DELETE /api/brands/{id}). Bu işlem geri alınamaz.`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </PageLayout>
  )
}
