import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { buildIdeasoftProductCategoryBreadcrumbs } from './ideasoft2-product-category-breadcrumb'
import {
  formatIdeasoftProductPriceLine,
  readIdeasoftStockTypeLabel,
  readMasterCurrencyLabel,
  readMasterListPrice,
  readMasterUnitName,
  priceAfterUserDiscount,
  formatMoneyTr,
} from './ideasoft2-product-detail-pricing'

type ActivePanel = 'genel' | 'fiyatlar'

function formatStockOneLine(p: Record<string, unknown>): string {
  const sa = p.stockAmount
  if (sa == null) return '—'
  const n = typeof sa === 'number' ? sa : parseFloat(String(sa))
  if (!Number.isFinite(n)) return '—'
  const unit = p.stockTypeLabel
  const u = typeof unit === 'string' && unit.trim() ? unit.trim() : 'Piece'
  return `${n.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ${u}`
}

interface Ideasoft2ProductDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: number | null
  listPreviewName?: string
  /** Master ürün id (liste sayfası SKU eşleşmesi). Yoksa aynı SKU ile `by-sku` denenir. */
  masterProductId?: number | null
}

export function Ideasoft2ProductDetailModal({
  open,
  onOpenChange,
  productId,
  listPreviewName,
  masterProductId: masterProductIdProp = null,
}: Ideasoft2ProductDetailModalProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>('genel')
  const [genel, setGenel] = useState<Record<string, unknown> | null>(null)
  const [kategoriBreadcrumb, setKategoriBreadcrumb] = useState('—')
  const [genelLoading, setGenelLoading] = useState(false)
  const [genelError, setGenelError] = useState<string | null>(null)
  const fetchedGenelId = useRef<number | null>(null)

  const [master, setMaster] = useState<Record<string, unknown> | null>(null)
  const [masterLoading, setMasterLoading] = useState(false)
  const [masterError, setMasterError] = useState<string | null>(null)
  const [discountInput, setDiscountInput] = useState('')
  const [discountKind, setDiscountKind] = useState<'percent' | 'fixed'>('percent')
  const lastMasterLoadKey = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    setActivePanel('genel')
    setGenel(null)
    setKategoriBreadcrumb('—')
    setGenelError(null)
    fetchedGenelId.current = null
    setMaster(null)
    setMasterError(null)
    setMasterLoading(false)
    lastMasterLoadKey.current = null
    setDiscountInput('')
    setDiscountKind('percent')
  }, [open, productId])

  const loadGenel = useCallback(async (id: number) => {
    setGenelLoading(true)
    setGenelError(null)
    setGenel(null)
    setKategoriBreadcrumb('—')
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/products/${id}`)
      const data = await parseJsonResponse<Record<string, unknown> & { error?: string; hint?: string }>(res)
      if (!res.ok) {
        throw new Error(formatIdeasoftProxyErrorForUi(data) || 'Ürün yüklenemedi')
      }
      setGenel(data)
      const k = await buildIdeasoftProductCategoryBreadcrumbs(data)
      setKategoriBreadcrumb(k)
    } catch (e) {
      setGenelError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setGenelLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setActivePanel('genel')
      setGenel(null)
      setKategoriBreadcrumb('—')
      setGenelError(null)
      setGenelLoading(false)
      fetchedGenelId.current = null
      setMaster(null)
      setMasterError(null)
      lastMasterLoadKey.current = null
      return
    }
    if (productId == null) return
    if (fetchedGenelId.current === productId) return
    fetchedGenelId.current = productId
    void loadGenel(productId)
  }, [open, productId, loadGenel])

  const loadMasterForFiyat = useCallback(
    async (idHint: number | null, sku: string) => {
      setMasterLoading(true)
      setMasterError(null)
      setMaster(null)
      try {
        let id: number | null = idHint != null && idHint > 0 ? idHint : null
        if (id == null) {
          if (!sku) return
          const res = await fetch(`${API_URL}/api/products/by-sku?sku=${encodeURIComponent(sku)}`)
          const bySku = await parseJsonResponse<
            { id?: number; error?: string } | { error: string } | null
          >(res)
          if (!res.ok) {
            const err =
              (bySku as { error?: string } | null | undefined)?.error ?? 'Master aranamadı'
            throw new Error(err)
          }
          if (bySku == null || typeof bySku !== 'object' || (bySku as { id?: number }).id == null) {
            return
          }
          const rid = Number((bySku as { id: number }).id)
          if (!Number.isFinite(rid) || rid <= 0) return
          id = rid
        }
        const dRes = await fetch(`${API_URL}/api/products/${id}`)
        const detail = await parseJsonResponse<Record<string, unknown> & { error?: string }>(dRes)
        if (!dRes.ok) {
          throw new Error(detail.error || 'Master ürün yüklenemedi')
        }
        setMaster(detail)
      } catch (e) {
        setMasterError(e instanceof Error ? e.message : 'Yüklenemedi')
      } finally {
        setMasterLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (activePanel !== 'fiyatlar') lastMasterLoadKey.current = null
  }, [activePanel])

  useEffect(() => {
    if (!open || activePanel !== 'fiyatlar' || genel == null) return
    const sku = String(genel.sku ?? '').trim()
    const key = `${productId ?? ''}|${masterProductIdProp ?? 'x'}|${sku}`
    if (lastMasterLoadKey.current === key) return
    lastMasterLoadKey.current = key
    const hint =
      masterProductIdProp != null && masterProductIdProp > 0 ? masterProductIdProp : null
    void loadMasterForFiyat(hint, sku)
  }, [open, activePanel, genel, productId, masterProductIdProp, loadMasterForFiyat])

  const displayName = genel
    ? String(
        (typeof genel.fullName === 'string' && genel.fullName.trim()
          ? genel.fullName
          : genel.name) ?? ''
      ).trim() || '—'
    : (listPreviewName || '').trim() || '—'

  const masterBase = master != null ? readMasterListPrice(master) : null
  const masterCalc =
    masterBase != null
      ? priceAfterUserDiscount(masterBase, discountInput, discountKind)
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[min(90vh,720px)] flex flex-col">
        <DialogHeader className="shrink-0 text-left">
          <DialogTitle className="line-clamp-2">
            {genel
              ? displayName
              : (listPreviewName || '').trim() || 'IdeaSoft ürünü'}
          </DialogTitle>
          {productId != null ? (
            <DialogDescription className="font-mono text-xs">IdeaSoft ürün #{productId}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="flex shrink-0 gap-1 border-b border-border p-0.5" aria-label="Ürün detay bölümleri">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-3',
              activePanel === 'genel' && 'border-primary bg-muted/40 text-foreground'
            )}
            aria-pressed={activePanel === 'genel'}
            onClick={() => setActivePanel('genel')}
          >
            Genel
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-b-none border-b-2 border-transparent px-3',
              activePanel === 'fiyatlar' && 'border-primary bg-muted/40 text-foreground'
            )}
            aria-pressed={activePanel === 'fiyatlar'}
            onClick={() => setActivePanel('fiyatlar')}
          >
            Fiyatlar
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto text-sm">
          {activePanel === 'genel' && genelLoading && (
            <p className="text-muted-foreground">Yükleniyor…</p>
          )}

          {activePanel === 'genel' && !genelLoading && genelError && (
            <p className="text-destructive">{genelError}</p>
          )}

          {activePanel === 'genel' && !genelLoading && !genelError && genel && (
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Ürün kodu (SKU)</Label>
                <p className="font-mono text-foreground break-all">{String(genel.sku ?? '—')}</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Barkod</Label>
                <p className="font-mono text-foreground break-all">{String(genel.barcode ?? '—')}</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Stok</Label>
                <p className="text-foreground whitespace-nowrap tabular-nums">{formatStockOneLine(genel)}</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Ürün adı</Label>
                <p className="text-foreground leading-snug break-words">{displayName}</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">IdeaSoft kategori</Label>
                <p className="text-foreground leading-snug break-words whitespace-pre-line">
                  {kategoriBreadcrumb}
                </p>
              </div>
            </div>
          )}

          {activePanel === 'fiyatlar' && genelLoading && (
            <p className="text-muted-foreground">Yükleniyor…</p>
          )}

          {activePanel === 'fiyatlar' && !genelLoading && genelError && (
            <p className="text-destructive">{genelError}</p>
          )}

          {activePanel === 'fiyatlar' && !genelLoading && !genelError && genel && (
            <div className="space-y-5 pr-0.5">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">IdeaSoft</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Fiyat (price1)</Label>
                    <p className="font-medium tabular-nums text-foreground">
                      {formatIdeasoftProductPriceLine(genel)}
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Birim</Label>
                    <p className="text-foreground">{readIdeasoftStockTypeLabel(genel)}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Master</p>
                {masterLoading ? (
                  <p className="text-sm text-muted-foreground">Master fiyat yükleniyor…</p>
                ) : null}
                {masterError ? <p className="text-sm text-destructive">{masterError}</p> : null}
                {!masterLoading && !masterError && !master ? (
                  <p className="text-sm text-muted-foreground">
                    Bu IdeaSoft SKU ile eşleşen master ürün bulunamadı.
                  </p>
                ) : null}
                {master ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <div>
                        <Label className="text-xs text-muted-foreground">Fiyat</Label>
                        <p className="font-medium tabular-nums text-foreground">
                          {masterBase != null ? formatMoneyTr(masterBase) : '—'}
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                            {readMasterCurrencyLabel(master)}
                          </span>
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Birim</Label>
                        <p className="text-foreground">{readMasterUnitName(master)}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
                      <div className="grid gap-1.5">
                        <Label htmlFor="is-modal-iskonto" className="text-xs text-muted-foreground">
                          İskonto
                        </Label>
                        <Input
                          id="is-modal-iskonto"
                          inputMode="decimal"
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          placeholder="0"
                          className="tabular-nums"
                        />
                      </div>
                      <div className="grid gap-1.5 sm:min-w-[128px]">
                        <Label htmlFor="is-modal-iskonto-tur" className="text-xs text-muted-foreground">
                          Tür
                        </Label>
                        <select
                          id="is-modal-iskonto-tur"
                          aria-label="İskonto türü: yüzde veya sabit"
                          className={cn(
                            'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
                            'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                          )}
                          value={discountKind}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === 'percent' || v === 'fixed') setDiscountKind(v)
                          }}
                        >
                          <option value="percent">Yüzde (%)</option>
                          <option value="fixed">Sabit tutar</option>
                        </select>
                      </div>
                      <div className="grid gap-1.5">
                        <span className="text-xs text-muted-foreground">Hesaplanan fiyat</span>
                        <p className="font-semibold tabular-nums text-foreground">
                          {masterCalc != null ? formatMoneyTr(masterCalc) : '—'}
                          {master != null && masterCalc != null ? (
                            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                              {readMasterCurrencyLabel(master)}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
