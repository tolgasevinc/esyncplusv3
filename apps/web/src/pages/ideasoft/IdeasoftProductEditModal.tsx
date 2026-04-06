import { useState, useEffect, useCallback, useMemo } from 'react'
import { Save, Search, ImageDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { getImageDisplayUrl } from '@/components/ImageInput'
import { toastSuccess, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { extractIdeasoftProductSearchKeywords } from '@/lib/ideasoft-product-seo'
import { IDEASOFT_STOCK_TYPE_LABELS } from '@/lib/ideasoft-stock-type-labels'

type IdeasoftProductImage = {
  id?: number
  filename?: string
  extension?: string
  sortOrder?: number
  thumbUrl?: string
  originalUrl?: string
  attachment?: string
  alt?: string
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

function asRecord(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

function getNestedId(obj: unknown): number | null {
  const o = asRecord(obj)
  const id = o.id
  if (typeof id === 'number' && Number.isFinite(id)) return id
  if (typeof id === 'string' && /^\d+$/.test(id)) return parseInt(id, 10)
  return null
}

function parseMasterImagePaths(row: Record<string, unknown>): string[] {
  const raw = row.image
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    try {
      const p = JSON.parse(s) as unknown
      if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean)
    } catch {
      return [s]
    }
  }
  return []
}

async function pathToIdeasoftAttachment(storagePath: string): Promise<{ attachment: string; ext: string } | null> {
  const url = getImageDisplayUrl(storagePath)
  if (!url) return null
  const res = await fetch(url)
  if (!res.ok) return null
  const blob = await res.blob()
  const mime = blob.type || 'image/jpeg'
  const ext =
    mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg'
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => {
      const dataUrl = String(r.result || '')
      if (!/^data:image\/(jpeg|jpg|png|gif|webp);base64,/i.test(dataUrl)) {
        resolve(null)
        return
      }
      resolve({ attachment: dataUrl, ext })
    }
    r.onerror = () => resolve(null)
    r.readAsDataURL(blob)
  })
}

function slotsFromImages(images: unknown): (IdeasoftProductImage | null)[] {
  const slots: (IdeasoftProductImage | null)[] = Array(8).fill(null)
  if (!Array.isArray(images)) return slots
  for (const item of images) {
    const o = item as IdeasoftProductImage
    const so = Number(o.sortOrder)
    if (!Number.isFinite(so) || so < 1 || so > 8) continue
    slots[so - 1] = o
  }
  return slots
}

function imagesFromSlots(slots: (IdeasoftProductImage | null)[]): IdeasoftProductImage[] {
  const out: IdeasoftProductImage[] = []
  slots.forEach((img, i) => {
    if (!img) return
    out.push({ ...img, sortOrder: i + 1 })
  })
  return out
}

function displayThumbUrl(thumb: string): string {
  const t = thumb.trim()
  if (!t) return ''
  if (t.startsWith('data:') || t.startsWith('http://') || t.startsWith('https://')) return t
  if (t.startsWith('//')) return `https:${t}`
  return getImageDisplayUrl(t)
}

interface IdeasoftProductEditModalProps {
  open: boolean
  productId: number | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function IdeasoftProductEditModal({
  open,
  productId,
  onOpenChange,
  onSaved,
}: IdeasoftProductEditModalProps) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [imageSlots, setImageSlots] = useState<(IdeasoftProductImage | null)[]>(() => Array(8).fill(null))

  const [brandMappings, setBrandMappings] = useState<Record<string, string>>({})
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({})
  const [currencyMappings, setCurrencyMappings] = useState<Record<string, string>>({})
  const [masterBrandNames, setMasterBrandNames] = useState<Map<number, string>>(new Map())
  const [masterCategoryNames, setMasterCategoryNames] = useState<Map<number, string>>(new Map())
  const [masterCurrencyNames, setMasterCurrencyNames] = useState<Map<number, string>>(new Map())

  const [masterPickerOpen, setMasterPickerOpen] = useState(false)
  const [masterSlotIndex, setMasterSlotIndex] = useState<number | null>(null)
  const [masterSearch, setMasterSearch] = useState('')
  const [masterListLoading, setMasterListLoading] = useState(false)
  const [masterListRows, setMasterListRows] = useState<{ id: number; name: string; sku: string }[]>([])
  const [importingSlot, setImportingSlot] = useState<number | null>(null)

  const loadReferenceData = useCallback(async () => {
    try {
      const [bm, cm, cym, brandsRes, catRes, curRes] = await Promise.all([
        fetch(`${API_URL}/api/ideasoft/brand-mappings`).then((r) => r.json()),
        fetch(`${API_URL}/api/ideasoft/category-mappings`).then((r) => r.json()),
        fetch(`${API_URL}/api/ideasoft/currency-mappings`).then((r) => r.json()),
        fetch(`${API_URL}/api/product-brands?limit=9999`),
        fetch(`${API_URL}/api/product-categories?limit=9999`),
        fetch(`${API_URL}/api/product-currencies?limit=9999`),
      ])
      setBrandMappings(
        bm?.mappings && typeof bm.mappings === 'object' ? (bm.mappings as Record<string, string>) : {}
      )
      setCategoryMappings(
        cm?.mappings && typeof cm.mappings === 'object' ? (cm.mappings as Record<string, string>) : {}
      )
      setCurrencyMappings(
        cym?.mappings && typeof cym.mappings === 'object' ? (cym.mappings as Record<string, string>) : {}
      )

      const brandsJson = await parseJsonResponse<{ data?: { id: number; name: string }[] }>(brandsRes)
      const bMap = new Map<number, string>()
      for (const x of brandsJson.data ?? []) bMap.set(x.id, x.name)
      setMasterBrandNames(bMap)

      const catJson = await parseJsonResponse<{ data?: { id: number; name: string }[] }>(catRes)
      const cMap = new Map<number, string>()
      for (const x of catJson.data ?? []) cMap.set(x.id, x.name)
      setMasterCategoryNames(cMap)

      const curJson = await parseJsonResponse<{ data?: { id: number; name: string; code?: string }[] }>(curRes)
      const curMap = new Map<number, string>()
      for (const x of curJson.data ?? []) {
        curMap.set(x.id, x.code ? `${x.name} (${x.code})` : x.name)
      }
      setMasterCurrencyNames(curMap)
    } catch {
      setBrandMappings({})
      setCategoryMappings({})
      setCurrencyMappings({})
    }
  }, [])

  const loadProduct = useCallback(async () => {
    if (productId == null) return
    setLoading(true)
    setDraft(null)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/products/${productId}`)
      const data = await parseJsonResponse<Record<string, unknown> & { error?: string; hint?: string }>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Ürün yüklenemedi')
      const cloned = deepClone(data) as Record<string, unknown>
      cloned.searchKeywords = extractIdeasoftProductSearchKeywords(cloned)
      setDraft(cloned)
      setImageSlots(slotsFromImages(data.images))
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Yüklenemedi')
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }, [productId, onOpenChange])

  useEffect(() => {
    if (open) void loadReferenceData()
  }, [open, loadReferenceData])

  useEffect(() => {
    if (open && productId != null) void loadProduct()
    if (!open) {
      setDraft(null)
      setImageSlots(Array(8).fill(null))
      setMasterPickerOpen(false)
      setMasterSlotIndex(null)
    }
  }, [open, productId, loadProduct])

  const readOnlyMappingLines = useMemo(() => {
    if (!draft) return { currency: '', brand: '', categories: '' }
    const curId = getNestedId(draft.currency)
    const curIs = curId != null ? String(curId) : ''
    const curMaster = curIs && currencyMappings[curIs] ? currencyMappings[curIs] : null
    const curMasterLabel =
      curMaster != null ? masterCurrencyNames.get(parseInt(curMaster, 10)) ?? `#${curMaster}` : null
    const curLine =
      curId != null
        ? `IdeaSoft kur #${curId}${curMasterLabel ? ` → Master: ${curMasterLabel}` : ' (master eşleşmesi yok)'}`
        : '—'

    const brandId = getNestedId(draft.brand)
    const brIs = brandId != null ? String(brandId) : ''
    const brMaster = brIs && brandMappings[brIs] ? brandMappings[brIs] : null
    const brMasterLabel =
      brMaster != null ? masterBrandNames.get(parseInt(brMaster, 10)) ?? `#${brMaster}` : null
    const brandLine =
      brandId != null
        ? `IdeaSoft marka #${brandId}${brMasterLabel ? ` → Master: ${brMasterLabel}` : ' (master eşleşmesi yok)'}`
        : '—'

    const cats = Array.isArray(draft.categories) ? draft.categories : []
    const catParts = cats.map((c) => {
      const id = getNestedId(c)
      if (id == null) return null
      const m = categoryMappings[String(id)]
      const ml = m != null ? masterCategoryNames.get(parseInt(m, 10)) ?? `#${m}` : null
      return `IS #${id}${ml ? ` → ${ml}` : ''}`
    })
    const categoriesLine =
      catParts.filter(Boolean).length > 0 ? catParts.filter(Boolean).join(' · ') : '—'

    return { currency: curLine, brand: brandLine, categories: categoriesLine }
  }, [draft, brandMappings, categoryMappings, currencyMappings, masterBrandNames, masterCategoryNames, masterCurrencyNames])

  const updateDraft = useCallback((patch: Record<string, unknown>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d))
  }, [])

  const detailObj = draft ? asRecord(draft.detail) : {}
  const detailsHtml = typeof detailObj.details === 'string' ? detailObj.details : ''

  const setDetailsHtml = (details: string) => {
    setDraft((d) => {
      if (!d) return d
      const nextDetail = { ...detailObj, details }
      return { ...d, detail: nextDetail }
    })
  }

  const seoSetting = draft ? asRecord(draft.seoSetting) : {}
  const seoIndex = Number(seoSetting.index ?? seoSetting.indexValue ?? 1)
  const seoFollow = Number(seoSetting.follow ?? seoSetting.followValue ?? 1)

  const setSeoSettingPatch = (patch: Record<string, unknown>) => {
    setDraft((d) => {
      if (!d) return d
      const prev = asRecord(d.seoSetting)
      return { ...d, seoSetting: { ...prev, ...patch } }
    })
  }

  const searchMasterProducts = useCallback(async (searchOverride?: string) => {
    setMasterListLoading(true)
    try {
      const params = new URLSearchParams({ limit: '30', page: '1', sort_by: 'name', sort_order: 'asc' })
      const term = (searchOverride ?? masterSearch).trim()
      if (term) params.set('search', term)
      const res = await fetch(`${API_URL}/api/products?${params}`)
      const data = await parseJsonResponse<{
        data?: { id: number; name: string; sku: string }[]
        error?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Liste alınamadı')
      setMasterListRows(
        (data.data ?? []).map((r) => ({
          id: r.id,
          name: r.name ?? '',
          sku: r.sku ?? '',
        }))
      )
    } catch {
      setMasterListRows([])
    } finally {
      setMasterListLoading(false)
    }
  }, [masterSearch])

  const importMasterImageToSlot = async (slotIndex: number, masterProductId: number) => {
    setImportingSlot(slotIndex)
    try {
      const res = await fetch(`${API_URL}/api/products/${masterProductId}`)
      const row = await parseJsonResponse<Record<string, unknown> & { error?: string }>(res)
      if (!res.ok) throw new Error(row.error || 'Master ürün alınamadı')
      const paths = parseMasterImagePaths(row)
      if (paths.length === 0) {
        toastError('Görsel yok', 'Bu master üründe kayıtlı görsel bulunamadı.')
        return
      }
      const converted = await pathToIdeasoftAttachment(paths[0]!)
      if (!converted) {
        toastError('Aktarım', 'Görsel indirilemedi veya format desteklenmiyor.')
        return
      }
      const base = String(row.sku || 'urun')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'urun'
      const newImg: IdeasoftProductImage = {
        filename: `${base}-slot-${slotIndex + 1}`,
        extension: converted.ext,
        sortOrder: slotIndex + 1,
        attachment: converted.attachment,
      }
      setImageSlots((prev) => {
        const next = [...prev]
        next[slotIndex] = newImg
        return next
      })
      setMasterPickerOpen(false)
      setMasterSlotIndex(null)
      toastSuccess('Aktarıldı', `Görsel ${slotIndex + 1}. slota yazıldı (kaydetmeyi unutmayın).`)
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Aktarılamadı')
    } finally {
      setImportingSlot(null)
    }
  }

  const handleSave = async () => {
    if (!draft || productId == null) return
    setSaving(true)
    try {
      const body = deepClone(draft)
      body.images = imagesFromSlots(imageSlots)
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await parseJsonResponse<{ error?: string; hint?: string }>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Kaydedilemedi')
      toastSuccess('Kaydedildi', 'Ürün güncellendi.')
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toastError('Kayıt hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const statusOn = draft != null && Number(draft.status) === 1
  const setStatus = (v: boolean) => updateDraft({ status: v ? 1 : 0 })

  const prices = Array.isArray(draft?.prices) ? (draft!.prices as Record<string, unknown>[]) : []

  const selectionGroups = Array.isArray(draft?.selectionGroups) ? draft!.selectionGroups : []
  const optionGroups = Array.isArray(draft?.optionGroups) ? draft!.optionGroups : []
  const productExtraFields = Array.isArray(draft?.productExtraFields)
    ? (draft!.productExtraFields as Record<string, unknown>[])
    : []
  const extraInfos = Array.isArray(draft?.extraInfos) ? (draft!.extraInfos as Record<string, unknown>[]) : []

  const updatePriceRow = (i: number, patch: Record<string, unknown>) => {
    setDraft((d) => {
      if (!d) return d
      const arr = Array.isArray(d.prices) ? [...(d.prices as Record<string, unknown>[])] : []
      const row = { ...(arr[i] as Record<string, unknown>), ...patch }
      arr[i] = row
      return { ...d, prices: arr }
    })
  }

  const updateExtraFieldRow = (i: number, varValue: string) => {
    setDraft((d) => {
      if (!d) return d
      const arr = Array.isArray(d.productExtraFields)
        ? [...(d.productExtraFields as Record<string, unknown>[])]
        : []
      arr[i] = { ...arr[i], varValue }
      return { ...d, productExtraFields: arr }
    })
  }

  const updateExtraInfoRow = (i: number, value: string) => {
    setDraft((d) => {
      if (!d) return d
      const arr = Array.isArray(d.extraInfos) ? [...(d.extraInfos as Record<string, unknown>[])] : []
      arr[i] = { ...arr[i], value }
      return { ...d, extraInfos: arr }
    })
  }

  const selClass =
    'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Ürün düzenle #{productId ?? '—'}</DialogTitle>
          </DialogHeader>
          {loading || !draft ? (
            <div className="px-6 py-12 text-sm text-muted-foreground text-center">Yükleniyor...</div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2">
                <Tabs defaultValue="genel" className="w-full">
                  <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                    <TabsTrigger value="genel" className="text-xs sm:text-sm">
                      Genel
                    </TabsTrigger>
                    <TabsTrigger value="seo" className="text-xs sm:text-sm">
                      SEO
                    </TabsTrigger>
                    <TabsTrigger value="fiyat" className="text-xs sm:text-sm">
                      Fiyat
                    </TabsTrigger>
                    <TabsTrigger value="gorsel" className="text-xs sm:text-sm">
                      Görsel
                    </TabsTrigger>
                    <TabsTrigger value="ozellik" className="text-xs sm:text-sm">
                      Özellikler
                    </TabsTrigger>
                    <TabsTrigger value="ekalan" className="text-xs sm:text-sm">
                      Ek alanlar
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="genel" className="space-y-4 mt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="is-name">Adı (name)</Label>
                        <Input
                          id="is-name"
                          maxLength={255}
                          value={String(draft.name ?? '')}
                          onChange={(e) => updateDraft({ name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="is-sku">Stok kodu (sku)</Label>
                        <Input
                          id="is-sku"
                          maxLength={255}
                          value={String(draft.sku ?? '')}
                          onChange={(e) => updateDraft({ sku: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="is-barcode">Barkod</Label>
                        <Input
                          id="is-barcode"
                          maxLength={14}
                          value={String(draft.barcode ?? '')}
                          onChange={(e) => updateDraft({ barcode: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="is-stock">Stok miktarı</Label>
                        <Input
                          id="is-stock"
                          type="number"
                          min={0}
                          step="any"
                          value={draft.stockAmount != null ? String(draft.stockAmount) : ''}
                          onChange={(e) =>
                            updateDraft({ stockAmount: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="is-stocktype">Birim (stockTypeLabel)</Label>
                        <select
                          id="is-stocktype"
                          aria-label="Stok birim tipi"
                          title="Stok birim tipi"
                          className={selClass}
                          value={String(draft.stockTypeLabel ?? 'Piece')}
                          onChange={(e) => updateDraft({ stockTypeLabel: e.target.value })}
                        >
                          {IDEASOFT_STOCK_TYPE_LABELS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="is-detail">Detay (detail.details)</Label>
                      <Textarea
                        id="is-detail"
                        className="min-h-[160px] font-mono text-xs"
                        value={detailsHtml}
                        onChange={(e) => setDetailsHtml(e.target.value)}
                      />
                    </div>
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                      <p className="font-medium text-foreground">Para birimi, marka, kategori (salt okunur)</p>
                      <p className="text-muted-foreground break-words">
                        <span className="text-foreground/80">Kur:</span> {readOnlyMappingLines.currency}
                      </p>
                      <p className="text-muted-foreground break-words">
                        <span className="text-foreground/80">Marka:</span> {readOnlyMappingLines.brand}
                      </p>
                      <p className="text-muted-foreground break-words">
                        <span className="text-foreground/80">Kategoriler:</span>{' '}
                        {readOnlyMappingLines.categories}
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="seo" className="space-y-3 mt-0">
                    <div className="space-y-2">
                      <Label htmlFor="is-target">Hedef kelime (searchKeywords)</Label>
                      <Input
                        id="is-target"
                        maxLength={255}
                        value={String(draft.searchKeywords ?? '')}
                        onChange={(e) => updateDraft({ searchKeywords: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="is-slug">Slug</Label>
                        <Input
                          id="is-slug"
                          maxLength={255}
                          value={String(draft.slug ?? '')}
                          onChange={(e) => updateDraft({ slug: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="is-ptitle">Title (pageTitle)</Label>
                        <Input
                          id="is-ptitle"
                          maxLength={255}
                          value={String(draft.pageTitle ?? '')}
                          onChange={(e) => updateDraft({ pageTitle: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="is-mkw">Keywords (metaKeywords)</Label>
                      <Input
                        id="is-mkw"
                        value={String(draft.metaKeywords ?? '')}
                        onChange={(e) => updateDraft({ metaKeywords: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="is-mdesc">Description (metaDescription)</Label>
                      <Textarea
                        id="is-mdesc"
                        className="min-h-[80px]"
                        value={String(draft.metaDescription ?? '')}
                        onChange={(e) => updateDraft({ metaDescription: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="is-can">Canonical URL</Label>
                      <Input
                        id="is-can"
                        maxLength={255}
                        placeholder="urun/ornek-slug"
                        value={String(draft.canonicalUrl ?? '')}
                        onChange={(e) => updateDraft({ canonicalUrl: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                        <Label>Index value (seoSetting.index)</Label>
                        <Switch
                          checked={seoIndex === 1}
                          onCheckedChange={(c) => setSeoSettingPatch({ index: c ? 1 : 0, indexValue: c ? 1 : 0 })}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                        <Label>Follow value (seoSetting.follow)</Label>
                        <Switch
                          checked={seoFollow === 1}
                          onCheckedChange={(c) => setSeoSettingPatch({ follow: c ? 1 : 0, followValue: c ? 1 : 0 })}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="fiyat" className="space-y-4 mt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Fiyat 1 (price1)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={draft.price1 != null ? String(draft.price1) : ''}
                          onChange={(e) => updateDraft({ price1: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Alış (buyingPrice)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={draft.buyingPrice != null ? String(draft.buyingPrice) : ''}
                          onChange={(e) => updateDraft({ buyingPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>İndirim (discount)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={draft.discount != null ? String(draft.discount) : ''}
                          onChange={(e) => updateDraft({ discount: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>İndirim tipi (discountType)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          value={draft.discountType != null ? String(draft.discountType) : '0'}
                          onChange={(e) => updateDraft({ discountType: parseInt(e.target.value, 10) || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Havale indirim % (moneyOrderDiscount)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={99}
                          value={draft.moneyOrderDiscount != null ? String(draft.moneyOrderDiscount) : ''}
                          onChange={(e) => updateDraft({ moneyOrderDiscount: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="is-taxinc">KDV dahil (taxIncluded)</Label>
                        <select
                          id="is-taxinc"
                          aria-label="KDV dahil"
                          title="KDV dahil"
                          className={selClass}
                          value={String(draft.taxIncluded ?? 1)}
                          onChange={(e) => updateDraft({ taxIncluded: parseInt(e.target.value, 10) })}
                        >
                          <option value="1">Evet</option>
                          <option value="0">Hayır</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>KDV % (tax)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={draft.tax != null ? String(draft.tax) : ''}
                          onChange={(e) => updateDraft({ tax: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Piyasa fiyatı açıklaması (marketPriceDetail)</Label>
                        <Input
                          maxLength={255}
                          value={String(draft.marketPriceDetail ?? '')}
                          onChange={(e) => updateDraft({ marketPriceDetail: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Alternatif fiyatlar (prices[])</Label>
                      {prices.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Kayıt yok.</p>
                      ) : (
                        <div className="rounded-md border divide-y">
                          {prices.map((row, i) => (
                            <div key={i} className="p-2 flex flex-wrap gap-2 items-end">
                              <div className="space-y-1">
                                <span className="text-xs text-muted-foreground">type</span>
                                <Input
                                  className="w-20 h-8"
                                  type="number"
                                  value={row.type != null ? String(row.type) : ''}
                                  onChange={(e) =>
                                    updatePriceRow(i, { type: parseInt(e.target.value, 10) || 0 })
                                  }
                                />
                              </div>
                              <div className="space-y-1 flex-1 min-w-[120px]">
                                <span className="text-xs text-muted-foreground">value</span>
                                <Input
                                  className="h-8"
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={row.value != null ? String(row.value) : ''}
                                  onChange={(e) =>
                                    updatePriceRow(i, { value: parseFloat(e.target.value) || 0 })
                                  }
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="gorsel" className="space-y-3 mt-0">
                    <p className="text-sm text-muted-foreground">
                      En fazla 8 görsel (sortOrder 1–8). Master ürünlerdeki görselleri ağdan çekip IdeaSoft
                      attachment formatında slota yazar.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {imageSlots.map((img, idx) => {
                        const thumb =
                          img?.thumbUrl ||
                          img?.originalUrl ||
                          (img?.attachment && img.attachment.startsWith('data:') ? img.attachment : '')
                        return (
                          <div
                            key={idx}
                            className="rounded-lg border p-2 flex flex-col gap-2 min-h-[140px]"
                          >
                            <div className="text-xs font-medium text-muted-foreground">Slot {idx + 1}</div>
                            <div
                              className={cn(
                                'flex-1 rounded-md bg-muted/50 flex items-center justify-center min-h-[72px] overflow-hidden'
                              )}
                            >
                              {thumb ? (
                                <img
                                  src={displayThumbUrl(thumb)}
                                  alt=""
                                  className="max-h-[72px] max-w-full object-contain"
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">Boş</span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              disabled={importingSlot != null}
                              onClick={() => {
                                setMasterSlotIndex(idx)
                                setMasterSearch('')
                                setMasterListRows([])
                                setMasterPickerOpen(true)
                                void searchMasterProducts('')
                              }}
                            >
                              <ImageDown className="h-3.5 w-3.5" />
                              Master’dan
                            </Button>
                            {img && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive"
                                onClick={() =>
                                  setImageSlots((prev) => {
                                    const n = [...prev]
                                    n[idx] = null
                                    return n
                                  })
                                }
                              >
                                Kaldır
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent value="ozellik" className="space-y-3 mt-0">
                    {selectionGroups.length === 0 && optionGroups.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Özellik / varyant verisi yok.</p>
                    ) : (
                      <div className="space-y-6">
                        {selectionGroups.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-sm font-medium">Ek özellik grupları (selectionGroups)</p>
                            {(selectionGroups as Record<string, unknown>[]).map((g, gi) => (
                              <div key={gi} className="rounded-md border p-3 space-y-2">
                                <p className="font-medium">{String(g.title ?? `Grup ${gi + 1}`)}</p>
                                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                                  {Array.isArray(g.selections)
                                    ? (g.selections as Record<string, unknown>[]).map((s, si) => (
                                        <li key={si}>{String(s.title ?? s.name ?? si)}</li>
                                      ))
                                    : null}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                        {optionGroups.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-sm font-medium">Varyant grupları (optionGroups)</p>
                            {(optionGroups as Record<string, unknown>[]).map((g, gi) => (
                              <div key={`og-${gi}`} className="rounded-md border p-3 space-y-2">
                                <p className="font-medium">{String(g.title ?? `Varyant ${gi + 1}`)}</p>
                                <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
                                  {Array.isArray(g.options)
                                    ? (g.options as Record<string, unknown>[]).map((o, oi) => (
                                        <li key={oi}>{String(o.title ?? o.name ?? oi)}</li>
                                      ))
                                    : null}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="ekalan" className="space-y-4 mt-0">
                    <div>
                      <Label className="mb-2 block">productExtraFields</Label>
                      {productExtraFields.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Kayıt yok.</p>
                      ) : (
                        <div className="space-y-2">
                          {productExtraFields.map((row, i) => (
                            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                              <span className="text-xs font-mono truncate">{String(row.varKey ?? '')}</span>
                              <Input
                                className="sm:col-span-2"
                                value={String(row.varValue ?? '')}
                                onChange={(e) => updateExtraFieldRow(i, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <Label className="mb-2 block">extraInfos</Label>
                      {extraInfos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Kayıt yok.</p>
                      ) : (
                        <div className="space-y-2">
                          {extraInfos.map((row, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <Input
                                className="flex-1"
                                value={String(row.value ?? '')}
                                onChange={(e) => updateExtraInfoRow(i, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-row flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                    <Switch id="is-status" checked={statusOn} onCheckedChange={setStatus} />
                    <Label htmlFor="is-status" className="cursor-pointer text-sm">
                      IdeaSoft durumu: {statusOn ? 'Aktif' : 'Pasif'}
                    </Label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                    Kapat
                  </Button>
                  <Button type="button" variant="save" disabled={saving} onClick={() => void handleSave()}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Kaydediliyor...' : 'Kaydet'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={masterPickerOpen} onOpenChange={setMasterPickerOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Master üründen görsel al
              {masterSlotIndex != null ? ` (slot ${masterSlotIndex + 1})` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ara (ad, SKU)..."
              className="pl-8"
              value={masterSearch}
              onChange={(e) => setMasterSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void searchMasterProducts(masterSearch)
              }}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void searchMasterProducts(masterSearch)}
          >
            Listele
          </Button>
          <div className="flex-1 min-h-0 overflow-y-auto rounded-md border">
            {masterListLoading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Yükleniyor…</div>
            ) : masterListRows.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Sonuç yok.</div>
            ) : (
              <ul className="divide-y">
                {masterListRows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 flex flex-col gap-0.5"
                      disabled={importingSlot != null || masterSlotIndex == null}
                      onClick={() => {
                        if (masterSlotIndex == null) return
                        void importMasterImageToSlot(masterSlotIndex, r.id)
                      }}
                    >
                      <span className="font-medium truncate">{r.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{r.sku}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
