import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Package,
  ShoppingCart,
  FileText,
  Tag,
  FolderTree,
  DollarSign,
  Ruler,
  ImageIcon,
  Tags,
  TableProperties,
  ImageDown,
  CheckCircle2,
  XCircle,
  Loader2,
  ScanLine,
  BookOpen,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { toastError, toastSuccess } from '@/lib/toast'

const primarySections: { id: string; title: string; icon: LucideIcon; to?: string }[] = [
  { id: 'urunler', title: 'Ürünler', icon: Package, to: '/ideasoft/urunler' },
  { id: 'siparisler', title: 'Siparişler', icon: ShoppingCart },
  { id: 'icerikler', title: 'İçerikler', icon: FileText },
]

const storeParamSections: { id: string; title: string; icon: LucideIcon; to?: string; apiHint?: string }[] = [
  { id: 'markalar', title: 'Markalar', icon: Tag, to: '/ideasoft/markalar' },
  { id: 'kategoriler', title: 'Kategoriler', icon: FolderTree, to: '/ideasoft/kategoriler' },
  { id: 'para-birimleri', title: 'Para birimleri', icon: DollarSign, to: '/ideasoft/para-birimleri' },
]

const blogSections: { id: string; title: string; icon: LucideIcon; to?: string; apiHint?: string }[] = [
  {
    id: 'blog-sayfalari',
    title: 'Blog sayfaları',
    icon: BookOpen,
    to: '/ideasoft/blog',
    apiHint: 'Blog POST/PUT — kategori, etiket, status',
  },
]

const productParamSections: { id: string; title: string; icon: LucideIcon; to?: string; apiHint?: string }[] = [
  { id: 'birimler', title: 'Birimler', icon: Ruler, to: '/ideasoft/birimler', apiHint: 'Ürün stok birimi (Product PDF)' },
  {
    id: 'urun-resimleri',
    title: 'Ürün resimleri',
    icon: ImageIcon,
    to: '/ideasoft/urun-resimleri',
    apiHint: 'ProductImage Admin API',
  },
  {
    id: 'urun-etiketleri',
    title: 'Kişisel Etiketler',
    icon: Tags,
    to: '/ideasoft/urun-etiketleri',
    apiHint: 'ProductLabel (label_to_products)',
  },
  {
    id: 'ekstra-ozellikler',
    title: 'Ekstra özellikler',
    icon: TableProperties,
    to: '/ideasoft/ekstra-ozellikler',
    apiHint: 'ProductExtraField (product_extra_fields)',
  },
]

function SectionGrid({
  sections,
}: {
  sections: { id: string; title: string; icon: LucideIcon; to?: string; apiHint?: string }[]
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      {sections.map((section) => {
        const inner = (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <section.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{section.title}</p>
              <p className="text-sm">
                {section.to ? (section.apiHint ?? 'Admin API / mağaza') : 'Yakında'}
              </p>
            </div>
          </>
        )
        return (
          <div key={section.id} className="col-span-12 sm:col-span-6 lg:col-span-4">
            {section.to ? (
              <Link
                to={section.to}
                className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 cursor-pointer"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/20 text-muted-foreground cursor-default">
                {inner}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

type SyncImagesRow = {
  ideasoft_product_id: number
  master_product_id: number
  ok: boolean
  images_saved?: number
  message?: string
  error?: string
}

type SyncImagesResponse = {
  ok?: boolean
  error?: string
  processed?: number
  total_mappings?: number
  offset?: number
  limit?: number
  next_offset?: number
  has_more?: boolean
  succeeded?: number
  failed?: number
  results?: SyncImagesRow[]
}

function mergeSyncSummaries(prev: SyncImagesResponse, next: SyncImagesResponse): SyncImagesResponse {
  return {
    ...next,
    results: [...(prev.results ?? []), ...(next.results ?? [])],
    processed: (prev.processed ?? 0) + (next.processed ?? 0),
    succeeded: (prev.succeeded ?? 0) + (next.succeeded ?? 0),
    failed: (prev.failed ?? 0) + (next.failed ?? 0),
    total_mappings: next.total_mappings ?? prev.total_mappings,
    has_more: next.has_more,
    next_offset: next.next_offset,
  }
}

type SkuScanSample = {
  ideasoft_id: number
  sku: string
  master_id: number | null
  note?: string
}

type SkuScanApiResponse = {
  ok?: boolean
  error?: string
  dry_run?: boolean
  start_page?: number
  last_fetched_page?: number
  pages_processed?: number
  rows_scanned?: number
  matched?: number
  no_sku?: number
  no_master?: number
  duplicate_sku_same_page?: number
  has_more?: boolean
  next_start_page?: number | null
  catalog_exhausted?: boolean
  samples?: SkuScanSample[]
}

type SkuScanTotals = {
  batches: number
  rows_scanned: number
  matched: number
  no_sku: number
  no_master: number
  duplicate_sku_same_page: number
  last: SkuScanApiResponse
  samples: SkuScanSample[]
}

function mergeSkuScanTotals(prev: SkuScanTotals | null, next: SkuScanApiResponse): SkuScanTotals {
  if (!prev) {
    return {
      batches: 1,
      rows_scanned: next.rows_scanned ?? 0,
      matched: next.matched ?? 0,
      no_sku: next.no_sku ?? 0,
      no_master: next.no_master ?? 0,
      duplicate_sku_same_page: next.duplicate_sku_same_page ?? 0,
      last: next,
      samples: [...(next.samples ?? [])].slice(-30),
    }
  }
  const mergedSamples = [...prev.samples, ...(next.samples ?? [])].slice(-30)
  return {
    batches: prev.batches + 1,
    rows_scanned: prev.rows_scanned + (next.rows_scanned ?? 0),
    matched: prev.matched + (next.matched ?? 0),
    no_sku: prev.no_sku + (next.no_sku ?? 0),
    no_master: prev.no_master + (next.no_master ?? 0),
    duplicate_sku_same_page: prev.duplicate_sku_same_page + (next.duplicate_sku_same_page ?? 0),
    last: next,
    samples: mergedSamples,
  }
}

export function IdeasoftPage() {
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncSummary, setSyncSummary] = useState<SyncImagesResponse | null>(null)

  const [skuModalOpen, setSkuModalOpen] = useState(false)
  const [skuLoading, setSkuLoading] = useState(false)
  const [skuDryRunOnly, setSkuDryRunOnly] = useState(false)
  const [skuTotals, setSkuTotals] = useState<SkuScanTotals | null>(null)
  const [skuError, setSkuError] = useState<string | null>(null)

  const runSkuScan = useCallback(
    async (opts?: { startPage?: number; append?: boolean }) => {
      const append = opts?.append ?? false
      const startPage = opts?.startPage ?? 1
      if (!append) {
        setSkuTotals(null)
        setSkuError(null)
        setSkuModalOpen(true)
      }
      setSkuLoading(true)
      try {
        const res = await fetch(`${API_URL}/api/ideasoft/sync-master-by-sku-scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start_page: startPage,
            limit: 100,
            max_pages: 15,
            dry_run: skuDryRunOnly,
          }),
        })
        const data = await parseJsonResponse<SkuScanApiResponse>(res)
        if (!res.ok) {
          const msg = data.error || 'İstek başarısız'
          toastError('SKU taraması', msg)
          if (!append) setSkuError(msg)
          return
        }
        setSkuError(null)
        setSkuTotals((prev) => {
          const merged = mergeSkuScanTotals(append ? prev : null, data)
          if (data.catalog_exhausted && !data.has_more) {
            window.setTimeout(() => {
              toastSuccess(
                'SKU taraması',
                `${merged.matched} eşleşme · ${merged.rows_scanned} taranan satır${skuDryRunOnly ? ' (yazılmadı)' : ''}`,
              )
            }, 0)
          }
          return merged
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Ağ hatası'
        toastError('SKU taraması', msg)
        if (!append) setSkuError(msg)
      } finally {
        setSkuLoading(false)
      }
    },
    [skuDryRunOnly],
  )

  useEffect(() => {
    if (window.location.hash.replace(/^#/, '') !== 'sku-master-eslestir') return
    window.setTimeout(() => {
      document.getElementById('sku-master-eslestir')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [])

  const runSyncMasterImages = useCallback(async (opts?: { offset: number; append: boolean }) => {
    const offset = opts?.offset ?? 0
    const append = opts?.append ?? false
    if (!append) {
      setSyncSummary(null)
      setSyncModalOpen(true)
    }
    setSyncLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/sync-master-images-from-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 80, offset }),
      })
      const data = await parseJsonResponse<SyncImagesResponse>(res)
      if (!res.ok) {
        toastError('Görselleri getir', (data as { error?: string }).error || 'İstek başarısız')
        if (!append) setSyncSummary({ ok: false, error: (data as { error?: string }).error })
        return
      }
      setSyncSummary((prev) => (append && prev && prev.ok !== false ? mergeSyncSummaries(prev, data) : data))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ağ hatası'
      toastError('Görselleri getir', msg)
      if (!append) setSyncSummary({ ok: false, error: msg })
    } finally {
      setSyncLoading(false)
    }
  }, [])

  return (
    <PageLayout title="IdeaSoft" description="Mağaza entegrasyonu menüleri" backTo="/">
      <div className="space-y-8">
        <Card id="sku-master-eslestir" className="scroll-mt-4">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ScanLine className="h-6 w-6 text-primary" />
                <CardTitle>SKU ile master eşleştir</CardTitle>
              </div>
              <CardDescription>
                IdeaSoft ürün listesini tarar; SKU’su master ürünle aynı olan kayıtlara{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">ideasoft_product_id</code> yazar ve ürün eşleme
                haritasını günceller. Bir turda en fazla 15 sayfa işlenir — katalog büyükse sonuç penceresinden
                &quot;Devam&quot; ile sürdürün.
              </CardDescription>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="ideasoft-sku-dry"
                  checked={skuDryRunOnly}
                  onCheckedChange={(v) => setSkuDryRunOnly(v === true)}
                />
                <Label htmlFor="ideasoft-sku-dry" className="text-sm font-normal cursor-pointer">
                  Sadece dene (veritabanına yazmaz)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground pt-0.5">
                Yer imi için adres çubuğuna{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">#sku-master-eslestir</code> ekleyin; sayfa
                açılınca bu kutuya kayar.
              </p>
            </div>
            <Button
              type="button"
              variant="default"
              className="shrink-0"
              disabled={skuLoading}
              onClick={() => void runSkuScan()}
              title="IdeaSoft ürün listesini SKU ile master ürünlerle eşleştirir"
            >
              {skuLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Taranıyor…
                </>
              ) : (
                <>
                  <ScanLine className="h-4 w-4 mr-2" />
                  Taramayı çalıştır
                </>
              )}
            </Button>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ImageDown className="h-6 w-6 text-primary" />
                <CardTitle>Master ürün görselleri</CardTitle>
              </div>
              <CardDescription>
                Kayıtlı IdeaSoft ürün eşlemesine göre mağazadaki ürün görsellerini indirir, depolamaya kaydeder ve
                ana ürün kaydındaki görsel listesini günceller. Her çağrıda en fazla 80 eşleşme işlenir; kalan için
                sonuç penceresindeki &quot;Sonraki grup&quot;u kullanın.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={syncLoading}
              onClick={() => void runSyncMasterImages()}
              title="Kayıtlı eşleşmeler için IdeaSoft’tan görselleri çeker"
            >
              {syncLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  İşleniyor…
                </>
              ) : (
                <>
                  <ImageDown className="h-4 w-4 mr-2" />
                  Görselleri getir
                </>
              )}
            </Button>
          </CardHeader>
        </Card>

        <Dialog open={syncModalOpen} onOpenChange={setSyncModalOpen}>
          <DialogContent className="max-w-lg sm:max-w-xl" showClose={!syncLoading}>
            <DialogHeader>
              <DialogTitle>Master görsel senkronu</DialogTitle>
            </DialogHeader>
            {syncLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
                IdeaSoft ürünleri okunuyor ve görseller indiriliyor…
              </div>
            )}
            {!syncLoading && syncSummary?.error && !syncSummary.results && (
              <p className="text-sm text-destructive py-2">{syncSummary.error}</p>
            )}
            {!syncLoading && syncSummary && (syncSummary.results?.length ?? 0) > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Bu oturumda listelenen satır: {syncSummary.results!.length}. Toplam eşleşme:{' '}
                  {syncSummary.total_mappings ?? '—'}. Başarılı: {syncSummary.succeeded ?? '—'}, hata:{' '}
                  {syncSummary.failed ?? '—'}.
                  {syncSummary.has_more ? (
                    <span className="text-amber-600 dark:text-amber-500 block mt-1">
                      Henüz işlenmemiş eşleşme var; &quot;Sonraki grup&quot; ile devam edin.
                    </span>
                  ) : null}
                </p>
                <ul className="max-h-[min(50vh,320px)] overflow-y-auto space-y-2 border rounded-md p-3 text-sm">
                  {syncSummary.results!.map((row, idx) => (
                    <li
                      key={`${row.ideasoft_product_id}-${row.master_product_id}-${idx}`}
                      className="flex gap-2 items-start border-b border-border/60 last:border-0 pb-2 last:pb-0"
                    >
                      {row.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium">
                          IS #{row.ideasoft_product_id} → Master #{row.master_product_id}
                        </div>
                        <div className="text-muted-foreground break-words">
                          {row.ok
                            ? row.message ??
                              (row.images_saved != null ? `${row.images_saved} görsel` : 'Tamam')
                            : row.error ?? 'Hata'}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!syncLoading && syncSummary && !syncSummary.error && (syncSummary.results?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                İşlenecek ürün eşlemesi yok. Önce IdeaSoft ürünler sayfasında listeyi yenileyerek SKU eşleşmelerinin
                kaydedildiğinden emin olun.
              </p>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-end">
              {syncSummary?.has_more && !syncLoading ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto order-2 sm:order-1"
                  onClick={() =>
                    void runSyncMasterImages({
                      offset: syncSummary.next_offset ?? 0,
                      append: true,
                    })
                  }
                >
                  Sonraki grup
                </Button>
              ) : null}
              <Button
                type="button"
                variant="close"
                className="w-full sm:w-auto order-1 sm:order-2"
                onClick={() => setSyncModalOpen(false)}
                disabled={syncLoading}
              >
                Kapat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={skuModalOpen} onOpenChange={setSkuModalOpen}>
          <DialogContent className="max-w-lg sm:max-w-xl" showClose={!skuLoading}>
            <DialogHeader>
              <DialogTitle>SKU taraması</DialogTitle>
            </DialogHeader>
            {skuLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
                IdeaSoft ürün listesi okunuyor…
              </div>
            )}
            {!skuLoading && skuError && !skuTotals && (
              <p className="text-sm text-destructive py-2">{skuError}</p>
            )}
            {!skuLoading && skuTotals && (
              <div className="space-y-3 text-sm">
                {skuDryRunOnly && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
                    Deneme modu: master ürünler ve eşleme haritası güncellenmedi.
                  </p>
                )}
                <p className="text-muted-foreground">
                  {skuTotals.batches > 1 ? (
                    <>
                      <span className="font-medium text-foreground">{skuTotals.batches} tur</span> birleştirildi.{' '}
                    </>
                  ) : null}
                  Son tur: sayfa {skuTotals.last.last_fetched_page ?? '—'}, işlenen sayfa{' '}
                  {skuTotals.last.pages_processed ?? '—'}, taranan ürün {skuTotals.last.rows_scanned ?? '—'}.
                </p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 border rounded-md p-3 bg-muted/30">
                  <li>
                    <span className="text-muted-foreground">Eşleşen (bu oturum)</span>{' '}
                    <span className="font-medium tabular-nums">{skuTotals.matched}</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Master yok</span>{' '}
                    <span className="font-medium tabular-nums">{skuTotals.no_master}</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">SKU yok</span>{' '}
                    <span className="font-medium tabular-nums">{skuTotals.no_sku}</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Yinelenen SKU (sayfa içi)</span>{' '}
                    <span className="font-medium tabular-nums">{skuTotals.duplicate_sku_same_page}</span>
                  </li>
                </ul>
                {skuTotals.last.has_more ? (
                  <p className="text-amber-600 dark:text-amber-500">
                    Katalog tamamen bitmedi; aşağıdan &quot;Devam&quot; ile sonraki sayfaları tarayın.
                  </p>
                ) : skuTotals.last.catalog_exhausted ? (
                  <p className="text-emerald-600 dark:text-emerald-500">IdeaSoft listesi bu turlarla tamamlandı.</p>
                ) : null}
                {skuTotals.samples.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-2">Örnekler (son kayıtlar)</p>
                    <ul className="max-h-[min(40vh,260px)] overflow-y-auto space-y-2 border rounded-md p-3 text-xs">
                      {skuTotals.samples.map((s, idx) => (
                        <li
                          key={`${s.ideasoft_id}-${s.sku}-${idx}`}
                          className="border-b border-border/60 last:border-0 pb-2 last:pb-0"
                        >
                          <span className="font-medium">IS #{s.ideasoft_id}</span>
                          {s.master_id != null ? (
                            <span className="text-muted-foreground"> → Master #{s.master_id}</span>
                          ) : null}
                          <div className="text-muted-foreground break-all">SKU: {s.sku}</div>
                          {s.note ? <div className="text-amber-600 dark:text-amber-500">{s.note}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-end">
              {skuTotals?.last?.has_more && !skuLoading ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto order-2 sm:order-1"
                  onClick={() =>
                    void runSkuScan({
                      append: true,
                      startPage: skuTotals.last.next_start_page ?? 1,
                    })
                  }
                >
                  Devam (sayfa {skuTotals.last.next_start_page ?? '?'})
                </Button>
              ) : null}
              <Button
                type="button"
                variant="close"
                className="w-full sm:w-auto order-1 sm:order-2"
                onClick={() => setSkuModalOpen(false)}
                disabled={skuLoading}
              >
                Kapat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <CardTitle>Ana menüler</CardTitle>
            </div>
            <CardDescription>Ürünler, siparişler ve içerik yönetimi</CardDescription>
          </CardHeader>
          <CardContent>
            <SectionGrid sections={primarySections} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <CardTitle>Blog sayfaları</CardTitle>
            </div>
            <CardDescription>
              OKM’den IdeaSoft’a aktarımda kullanılan varsayılan kategori, etiket ve yayın alanları (Admin API).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SectionGrid sections={blogSections} />
          </CardContent>
        </Card>

        <div className="border-t border-border my-6" />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FolderTree className="h-6 w-6 text-primary" />
              <CardTitle>Mağaza parametreleri</CardTitle>
            </div>
            <CardDescription>Markalar, kategoriler ve para birimleri</CardDescription>
          </CardHeader>
          <CardContent>
            <SectionGrid sections={storeParamSections} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Ruler className="h-6 w-6 text-primary" />
              <CardTitle>Ürün parametreleri</CardTitle>
            </div>
            <CardDescription>Stok birimi, görseller, etiket ve ekstra alanlar (Admin API)</CardDescription>
          </CardHeader>
          <CardContent>
            <SectionGrid sections={productParamSections} />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
