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
import { cn } from '@/lib/utils'
import { toastError, toastSuccess, toastWarning } from '@/lib/toast'
import {
  extractExtraInfoDefinitionsList,
  type IdeasoftExtraInfoDefinition,
} from '@/pages/ideasoft/IdeasoftProductExtraFieldsPage'
import { fetchAllIdeasoftAdminPagedList } from './ideasoft2-admin-paged-list'
import { upsertExtraInfoForProduct } from './ideasoft2-product-extra-info-helpers'

const BULK_CONCURRENCY = 4

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

export interface Ideasoft2BulkExtraInfoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productIds: number[]
  onCompleted?: () => void
}

export function Ideasoft2BulkExtraInfoModal({
  open,
  onOpenChange,
  productIds,
  onCompleted,
}: Ideasoft2BulkExtraInfoModalProps) {
  const [catalog, setCatalog] = useState<IdeasoftExtraInfoDefinition[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [defId, setDefId] = useState('')
  const [valueDraft, setValueDraft] = useState('')
  const [manualExId, setManualExId] = useState('')
  const [manualExName, setManualExName] = useState('')
  const [manualExSort, setManualExSort] = useState('0')
  const [running, setRunning] = useState(false)
  const [progressLine, setProgressLine] = useState('')
  const [errorReport, setErrorReport] = useState<string | null>(null)

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

  useEffect(() => {
    if (!open) {
      setDefId('')
      setValueDraft('')
      setManualExId('')
      setManualExName('')
      setManualExSort('0')
      setProgressLine('')
      setErrorReport(null)
      setRunning(false)
      return
    }
    setCatalog([])
    setCatalogError(null)
    void loadCatalog()
  }, [open, loadCatalog])

  const resolveDef = useCallback((): { ok: true; def: IdeasoftExtraInfoDefinition } | { ok: false; message: string } => {
    if (hasCatalog) {
      if (!defId) return { ok: false, message: 'Ek bilgi (extraInfo) tanımı seçin.' }
      const d = catalog.find((x) => String(x.id) === defId)
      if (!d) return { ok: false, message: 'Tanım bulunamadı.' }
      if (!d.name) return { ok: false, message: 'Seçilen tanımda ad (name) yok.' }
      return { ok: true, def: d }
    }
    return validateManual(manualExId, manualExName, manualExSort)
  }, [hasCatalog, defId, catalog, manualExId, manualExName, manualExSort])

  const runBulk = async () => {
    if (productIds.length === 0) {
      toastError('Seçim yok', 'En az bir ürün seçin.')
      return
    }
    const r = resolveDef()
    if (!r.ok) {
      toastError('Doğrulama', r.message)
      return
    }
    const v = valueDraft

    setRunning(true)
    setErrorReport(null)
    const fails: { id: number; msg: string }[] = []
    let done = 0
    const total = productIds.length
    setProgressLine(`0 / ${total}`)

    for (let i = 0; i < productIds.length; i += BULK_CONCURRENCY) {
      const batch = productIds.slice(i, i + BULK_CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map((pid) => upsertExtraInfoForProduct(pid, r.def, v))
      )
      for (let j = 0; j < batch.length; j += 1) {
        const pid = batch[j]!
        const res = results[j]!
        done += 1
        setProgressLine(`${done} / ${total}`)
        if (res.status === 'rejected') {
          fails.push({
            id: pid,
            msg: res.reason instanceof Error ? res.reason.message : String(res.reason),
          })
        }
      }
    }

    setRunning(false)
    setProgressLine('')

    if (fails.length === 0) {
      toastSuccess('Toplu güncelleme', `${total} üründe extraInfo alanı güncellendi.`)
      onOpenChange(false)
      onCompleted?.()
      return
    }
    if (fails.length < total) {
      toastWarning(
        'Kısmi başarı',
        `${total - fails.length} ürün güncellendi, ${fails.length} hata. Ayrıntılar modaldadır.`
      )
    } else {
      toastError('Toplu güncelleme', 'Hiçbir ürün güncellenemedi.')
    }
    setErrorReport(
      fails
        .slice(0, 12)
        .map((f) => `#${f.id}: ${f.msg}`)
        .join('\n') + (fails.length > 12 ? `\n… +${fails.length - 12} ürün` : '')
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[min(90vh,640px)] flex flex-col"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Ek bilgi alanları — toplu güncelleme</DialogTitle>
          <DialogDescription className="text-pretty">
            Seçili <strong>{productIds.length}</strong> ürün için aynı <span className="font-mono">ProductExtraInfo</span>{' '}
            tanımındaki değer (<span className="font-mono">value</span>) kaydedilir. Kayıt yoksa eklenir, varsa{' '}
            <span className="font-mono">PUT</span> ile güncellenir.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5 text-sm">
          <p className="text-xs text-muted-foreground">
            Tanımlar <span className="font-mono">GET …/extra_infos</span>
            {catalogLoading ? (
              <span> — yükleniyor…</span>
            ) : catalogError ? (
              <span className="text-amber-700 dark:text-amber-500"> — {catalogError} (elle girin)</span>
            ) : hasCatalog ? (
              <span> — {catalog.length} başlık</span>
            ) : (
              <span> — boş; aşağıdan extraInfo alanlarını girin</span>
            )}
          </p>

          {hasCatalog ? (
            <div className="grid gap-1.5">
              <Label htmlFor="is2-bulk-exdef" className="text-xs text-muted-foreground">
                extraInfo (başlık)
              </Label>
              <select
                id="is2-bulk-exdef"
                title="ProductExtraInfo tanımı (extraInfo)"
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
                  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
                value={defId}
                onChange={(e) => setDefId(e.target.value)}
                disabled={running || catalogLoading}
              >
                <option value="">Seçin…</option>
                {sortedCatalog.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name} (id {d.id}, sıra {d.sortOrder})
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
                  disabled={running}
                  className="h-9 font-mono"
                  placeholder="≥ 1"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">name</Label>
                <Input
                  value={manualExName}
                  onChange={(e) => setManualExName(e.target.value)}
                  disabled={running}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">sortOrder</Label>
                <Input
                  inputMode="numeric"
                  value={manualExSort}
                  onChange={(e) => setManualExSort(e.target.value)}
                  disabled={running}
                  className="h-9"
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="is2-bulk-value" className="text-xs text-muted-foreground">
              value
            </Label>
            <Textarea
              id="is2-bulk-value"
              value={valueDraft}
              onChange={(e) => setValueDraft(e.target.value)}
              disabled={running}
              className="min-h-[5rem] text-sm"
              placeholder="Tüm seçili ürünlere yazılacak değer"
            />
          </div>

          {running && progressLine ? (
            <p className="text-xs text-muted-foreground tabular-nums">{progressLine}</p>
          ) : null}
          {errorReport ? (
            <pre className="max-h-32 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive whitespace-pre-wrap">
              {errorReport}
            </pre>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="close" onClick={() => onOpenChange(false)} disabled={running}>
            Kapat
          </Button>
          <Button
            type="button"
            variant="save"
            disabled={
              running ||
              productIds.length === 0 ||
              catalogLoading ||
              (hasCatalog && !defId)
            }
            onClick={() => {
              void runBulk()
            }}
          >
            {running ? 'Uygulanıyor…' : 'Tümüne uygula'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
