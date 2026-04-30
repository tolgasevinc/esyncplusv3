import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { cn } from '@/lib/utils'
import { toastError, toastSuccess } from '@/lib/toast'
import {
  extractExtraInfoDefinitionsList,
  type IdeasoftExtraInfoDefinition,
  type IdeasoftProductExtraInfoRow,
} from '@/pages/ideasoft/IdeasoftProductExtraFieldsPage'
import { fetchAllIdeasoftAdminPagedList } from './ideasoft2-admin-paged-list'
import {
  fetchExtraInfoLinksForProduct,
  deleteExtraInfoLinkRow,
  upsertExtraInfoForProduct,
} from './ideasoft2-product-extra-info-helpers'

const LOAD_CHUNK = 6

function idsFromProductIdsSig(sig: string): number[] {
  if (!sig.trim()) return []
  const out: number[] = []
  const seen = new Set<number>()
  for (const part of sig.split(',')) {
    const n = parseInt(part.trim(), 10)
    if (!Number.isFinite(n) || n < 1 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

function sortDefinitions(defs: IdeasoftExtraInfoDefinition[]): IdeasoftExtraInfoDefinition[] {
  return [...defs].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'tr') || a.id - b.id
  )
}

function validateManual(
  exId: string,
  name: string,
  sort: string
): { ok: true; def: IdeasoftExtraInfoDefinition } | { ok: false; message: string } {
  const id = parseInt(exId.trim(), 10)
  const n = name.trim()
  const so = parseInt(sort.trim(), 10)
  if (!Number.isFinite(id) || id < 1) return { ok: false, message: 'extraInfo.id ≥ 1 olmalıdır.' }
  if (!n || n.length > 255) return { ok: false, message: 'extraInfo.name zorunlu, ≤255 karakter.' }
  if (!Number.isFinite(so) || so < 0 || so > 99) {
    return { ok: false, message: 'extraInfo.sortOrder 0–99 aralığında olmalıdır.' }
  }
  return { ok: true, def: { id, name: n, sortOrder: so } }
}

function truncText(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export interface Ideasoft2BulkProductFeatureProductRef {
  id: number
  name: string
}

export interface Ideasoft2BulkProductFeaturesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Ideasoft2BulkProductFeatureProductRef[]
  onCompleted?: () => void
}

export function Ideasoft2BulkProductFeaturesModal({
  open,
  onOpenChange,
  products,
  onCompleted,
}: Ideasoft2BulkProductFeaturesModalProps) {
  const [catalog, setCatalog] = useState<IdeasoftExtraInfoDefinition[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [defId, setDefId] = useState('')
  const [manualExId, setManualExId] = useState('')
  const [manualExName, setManualExName] = useState('')
  const [manualExSort, setManualExSort] = useState('0')
  const [bulkApplyValue, setBulkApplyValue] = useState('')
  const [valueByPid, setValueByPid] = useState<Record<number, string>>({})

  const [linksMap, setLinksMap] = useState<Record<number, IdeasoftProductExtraInfoRow[]>>({})
  const [linksLoading, setLinksLoading] = useState(false)
  const [fetchErrorsByPid, setFetchErrorsByPid] = useState<Record<number, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<{
    productId: number
    row: IdeasoftProductExtraInfoRow
  } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [addingPid, setAddingPid] = useState<number | null>(null)
  const [bulkRunning, setBulkRunning] = useState(false)

  const productIdsSig = useMemo(() => products.map((p) => p.id).join(','), [products])
  const sortedCatalog = useMemo(() => sortDefinitions(catalog), [catalog])
  const hasCatalog = catalog.length > 0

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(null)
    setCatalog([])
    try {
      const list = await fetchAllIdeasoftAdminPagedList(
        'extra_infos',
        extractExtraInfoDefinitionsList,
        'extra_infos listesi alınamadı',
        null
      )
      setCatalog(list)
    } catch (e) {
      setCatalogError(e instanceof Error ? e.message : 'Tanım listesi yüklenemedi')
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  const refreshLinksForProduct = useCallback(async (productId: number) => {
    try {
      const rows = await fetchExtraInfoLinksForProduct(productId)
      setLinksMap((m) => ({ ...m, [productId]: rows }))
      setFetchErrorsByPid((e) => {
        const n = { ...e }
        delete n[productId]
        return n
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Yüklenemedi'
      setFetchErrorsByPid((prev) => ({ ...prev, [productId]: msg }))
    }
  }, [])

  const resolveDef = useCallback((): { ok: true; def: IdeasoftExtraInfoDefinition } | { ok: false; message: string } => {
    if (hasCatalog) {
      if (!defId) return { ok: false, message: 'extraInfo tanımı seçin.' }
      const d = catalog.find((x) => String(x.id) === defId)
      if (!d) return { ok: false, message: 'Tanım bulunamadı.' }
      if (!d.name) return { ok: false, message: 'Seçilen tanımda ad (name) yok.' }
      return { ok: true, def: d }
    }
    return validateManual(manualExId, manualExName, manualExSort)
  }, [hasCatalog, defId, catalog, manualExId, manualExName, manualExSort])

  useEffect(() => {
    if (!open) {
      setDefId('')
      setManualExId('')
      setManualExName('')
      setManualExSort('0')
      setBulkApplyValue('')
      setValueByPid({})
      setLinksMap({})
      setFetchErrorsByPid({})
      setDeleteTarget(null)
      setAddingPid(null)
      setBulkRunning(false)
      setCatalog([])
      setCatalogError(null)
      return
    }
    const pidList = idsFromProductIdsSig(productIdsSig)
    setValueByPid(Object.fromEntries(pidList.map((id) => [id, ''])))
    void loadCatalog()
  }, [open, productIdsSig, loadCatalog])

  useEffect(() => {
    if (!open) return
    const ids = idsFromProductIdsSig(productIdsSig)
    if (ids.length === 0) return
    let cancelled = false
    void (async () => {
      setLinksLoading(true)
      setLinksMap({})
      setFetchErrorsByPid({})
      const aggregate: Record<number, IdeasoftProductExtraInfoRow[]> = {}
      const errs: Record<number, string> = {}
      for (let i = 0; i < ids.length; i += LOAD_CHUNK) {
        if (cancelled) break
        const chunk = ids.slice(i, i + LOAD_CHUNK)
        await Promise.all(
          chunk.map(async (pid) => {
            try {
              const rows = await fetchExtraInfoLinksForProduct(pid)
              aggregate[pid] = rows
            } catch (e) {
              errs[pid] = e instanceof Error ? e.message : 'Liste alınamadı'
            }
          })
        )
      }
      if (!cancelled) {
        setLinksMap(aggregate)
        setFetchErrorsByPid(errs)
      }
      if (!cancelled) setLinksLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, productIdsSig])

  const runBulkApply = async () => {
    if (products.length === 0) {
      toastError('Seçim yok', 'En az bir ürün seçin.')
      return
    }
    const r = resolveDef()
    if (!r.ok) {
      toastError('Doğrulama', r.message)
      return
    }
    const v = bulkApplyValue
    setBulkRunning(true)
    try {
      const CHUNK = 4
      for (let i = 0; i < products.length; i += CHUNK) {
        const slice = products.slice(i, i + CHUNK)
        await Promise.all(slice.map((p) => upsertExtraInfoForProduct(p.id, r.def, v)))
      }
      toastSuccess(
        'Toplu yazıldı',
        `${products.length} üründe “${truncText(r.def.name, 40)}” değeri güncellendi veya eklendi.`
      )
      await Promise.all(products.map((p) => refreshLinksForProduct(p.id)))
      setBulkApplyValue('')
      onCompleted?.()
    } catch (e) {
      toastError('Toplu uygula', e instanceof Error ? e.message : 'Başarısız')
    } finally {
      setBulkRunning(false)
    }
  }

  const addForProduct = async (productId: number) => {
    const r = resolveDef()
    if (!r.ok) {
      toastError('Doğrulama', r.message)
      return
    }
    const raw = valueByPid[productId] ?? ''
    setAddingPid(productId)
    try {
      await upsertExtraInfoForProduct(productId, r.def, raw)
      toastSuccess(
        'Eklendi/güncellendi',
        `Ürün #${productId} · ${truncText(r.def.name, 56)}`
      )
      await refreshLinksForProduct(productId)
      setValueByPid((prev) => ({ ...prev, [productId]: '' }))
      onCompleted?.()
    } catch (e) {
      toastError(`Ürün #${productId}`, e instanceof Error ? e.message : 'Başarısız')
    } finally {
      setAddingPid(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const { productId, row } = deleteTarget
    const rid = typeof row.id === 'number' ? row.id : parseInt(String(row.id), 10)
    if (!Number.isFinite(rid) || rid < 1) {
      toastError('Sil', 'Geçersiz kayıt id')
      return
    }
    setDeleteLoading(true)
    try {
      await deleteExtraInfoLinkRow(rid)
      toastSuccess('Silindi', `extra_info_to_products #${rid}`)
      setDeleteTarget(null)
      await refreshLinksForProduct(productId)
      onCompleted?.()
    } catch (e) {
      toastError('Sil', e instanceof Error ? e.message : 'Başarısız')
    } finally {
      setDeleteLoading(false)
    }
  }

  const extraName = (row: IdeasoftProductExtraInfoRow) =>
    typeof row.extraInfo?.name === 'string' ? row.extraInfo.name : String(row.extraInfo?.name ?? '—')

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-3xl max-h-[min(92vh,800px)] flex flex-col gap-0 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="shrink-0 space-y-1 border-b border-border px-4 py-3">
            <DialogHeader>
              <DialogTitle>Ürün özelliği — seçili ürünler</DialogTitle>
              <DialogDescription className="text-pretty text-xs leading-relaxed">
                Liste sütunuyla uyumlu <span className="font-mono">extra_info_to_products</span> (Ekstra bilgi /
                ProductExtraInfo) bağları. Mevcut satırlar ürün bazında gösterilir; silebilir veya seçtiğiniz{' '}
                <span className="font-mono">extraInfo</span> tanımı için{' '}
                <span className="font-mono">value</span> ekleyebilir veya güncelleyebilirsiniz (
                <span className="font-mono">PUT</span>/<span className="font-mono">POST</span>).{' '}
                <span className="font-mono">products.extraInfos</span> ağacını bu ekrandan düzenlemezsiniz.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
            <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">Ortak tanım (ekleme / toplu yazma)</p>
              <p className="text-[11px] text-muted-foreground">
                Kaynak{' '}
                <span className="font-mono">GET …/extra_infos</span>
                {catalogLoading ? (
                  <span> — yükleniyor…</span>
                ) : catalogError ? (
                  <span className="text-amber-700 dark:text-amber-500"> — {catalogError} (elle gir)</span>
                ) : hasCatalog ? (
                  <span> — {catalog.length} tanım</span>
                ) : (
                  <span> — boş; extraInfo bilgisini elle gir</span>
                )}
              </p>

              {hasCatalog ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">extraInfo (başlık)</Label>
                  <select
                    title="extraInfo tanımı"
                    className={cn(
                      'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
                      'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    )}
                    value={defId}
                    onChange={(e) => setDefId(e.target.value)}
                    disabled={catalogLoading || linksLoading || bulkRunning}
                  >
                    <option value="">Seçin…</option>
                    {sortedCatalog.map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.name} (id {d.id})
                      </option>
                    ))}
                  </select>
                </div>
              ) : !catalogLoading ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">extraInfo.id</Label>
                    <Input
                      inputMode="numeric"
                      value={manualExId}
                      onChange={(e) => setManualExId(e.target.value)}
                      className="h-9 font-mono"
                      disabled={bulkRunning || linksLoading}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">name</Label>
                    <Input
                      value={manualExName}
                      onChange={(e) => setManualExName(e.target.value)}
                      className="h-9"
                      disabled={bulkRunning || linksLoading}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">sortOrder</Label>
                    <Input
                      inputMode="numeric"
                      value={manualExSort}
                      onChange={(e) => setManualExSort(e.target.value)}
                      className="h-9"
                      disabled={bulkRunning || linksLoading}
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-2 pt-1">
                <div className="grid min-w-[200px] flex-1 gap-1.5">
                  <Label htmlFor="is2-features-bulk-val" className="text-xs text-muted-foreground">
                    Tüm seçili ürünlere yazılacak value
                  </Label>
                  <Textarea
                    id="is2-features-bulk-val"
                    value={bulkApplyValue}
                    onChange={(e) => setBulkApplyValue(e.target.value)}
                    disabled={bulkRunning || linksLoading}
                    className="min-h-[4rem] text-sm"
                    placeholder="Üstteki tanım için hepsine uygulanır"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  disabled={
                    bulkRunning ||
                    linksLoading ||
                    catalogLoading ||
                    products.length === 0 ||
                    (hasCatalog && !defId)
                  }
                  onClick={() => void runBulkApply()}
                >
                  {bulkRunning ? 'Yazılıyor…' : 'Tümüne uygula'}
                </Button>
              </div>
            </div>

            {linksLoading ? (
              <p className="text-muted-foreground">Ürün başına kayıtlar yükleniyor…</p>
            ) : null}

            <div className="space-y-4">
              {products.map((p) => {
                const rows = linksMap[p.id] ?? []
                const fe = fetchErrorsByPid[p.id]
                const listEmpty = rows.length === 0 && !fe
                return (
                  <div
                    key={p.id}
                    className="overflow-hidden rounded-lg border border-border bg-background shadow-sm"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-3 py-2">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">#{p.id}</span>
                      <span className="min-w-0 flex-1 text-sm font-medium text-foreground truncate" title={p.name}>
                        {p.name || '—'}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{rows.length} kayıt</span>
                    </div>
                    <div className="space-y-2 p-3">
                      {fe ? (
                        <p className="text-sm text-destructive">{fe}</p>
                      ) : listEmpty ? (
                        <p className="text-xs text-muted-foreground">
                          Bu ürün için henüz <span className="font-mono">extra_info_to_products</span> kaydı yok.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[520px] border-separate border-spacing-0 text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="border-b border-border px-2 py-1.5 text-left font-medium">Kayıt</th>
                                <th className="border-b border-border px-2 py-1.5 text-left font-medium">Başlık</th>
                                <th className="border-b border-border px-2 py-1.5 text-left font-medium">value</th>
                                <th className="border-b border-border px-2 py-1.5 text-right font-medium w-24">İşlem</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row) => (
                                <tr key={String(row.id)} className="odd:bg-muted/10">
                                  <td className="border-b border-border/60 px-2 py-1.5 align-top font-mono tabular-nums">
                                    #{row.id}
                                  </td>
                                  <td className="border-b border-border/60 px-2 py-1.5 align-top text-foreground">
                                    {extraName(row)}
                                  </td>
                                  <td className="border-b border-border/60 px-2 py-1.5 align-top max-w-[280px]">
                                    <span className="break-words whitespace-pre-wrap">{String(row.value ?? '—')}</span>
                                  </td>
                                  <td className="border-b border-border/60 px-2 py-1.5 text-right align-top">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-destructive border-destructive/40 hover:bg-destructive/10"
                                      disabled={bulkRunning || addingPid != null || deleteLoading}
                                      onClick={() => setDeleteTarget({ productId: p.id, row })}
                                    >
                                      Sil
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
                        <div className="grid min-w-[180px] flex-1 gap-1.5">
                          <Label className="text-[11px] text-muted-foreground">Bu ürüne value (aynı ortak tanım)</Label>
                          <Textarea
                            value={valueByPid[p.id] ?? ''}
                            onChange={(e) =>
                              setValueByPid((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            disabled={bulkRunning || linksLoading || addingPid === p.id}
                            className="min-h-[3.25rem] text-xs"
                            placeholder="Ortak tanıma yazılacak metin…"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="save"
                          className="shrink-0"
                          disabled={
                            bulkRunning ||
                            catalogLoading ||
                            linksLoading ||
                            addingPid === p.id ||
                            (hasCatalog && !defId)
                          }
                          onClick={() => void addForProduct(p.id)}
                        >
                          {addingPid === p.id ? 'Kaydediliyor…' : 'Ekle / güncelle'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-4 py-3">
            <Button type="button" variant="close" onClick={() => onOpenChange(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        description={
          deleteTarget
            ? `Ürün #${deleteTarget.productId} · kayıt #${deleteTarget.row.id} · “${truncText(extraName(deleteTarget.row), 80)}” silinsin mi?`
            : ''
        }
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  )
}
