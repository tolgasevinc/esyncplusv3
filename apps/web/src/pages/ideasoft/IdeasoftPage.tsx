import { useState, useCallback } from 'react'
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
import { API_URL, parseJsonResponse } from '@/lib/api'
import { toastError } from '@/lib/toast'

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

export function IdeasoftPage() {
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncSummary, setSyncSummary] = useState<SyncImagesResponse | null>(null)

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
