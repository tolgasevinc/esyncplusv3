import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileUp } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { CategorySelect, type CategoryItem } from '@/components/CategorySelect'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  type ImportFileKind,
  type MasterImportField,
  MASTER_IMPORT_FIELD_META,
  buildProductPayloadFromRow,
  getRowSupplierCode,
  guessImportField,
  parseImportFile,
} from './productImportUtils'

type Step = 'file' | 'map' | 'preview' | 'done'

export interface ProductImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: CategoryItem[]
  onImported: () => void
}

interface PreviewRow {
  key: string
  rowIndex: number
  row: Record<string, string>
  namePreview: string
  matchValue: string
  existsInDb: boolean
  selected: boolean
  skipReason?: string
}

function fieldLabel(f: MasterImportField): string {
  return MASTER_IMPORT_FIELD_META.find((x) => x.value === f)?.label ?? f
}

export function ProductImportModal({ open, onOpenChange, categories, onImported }: ProductImportModalProps) {
  const [step, setStep] = useState<Step>('file')
  const [fileKind, setFileKind] = useState<ImportFileKind>('excel')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, MasterImportField | ''>>({})
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [resultSummary, setResultSummary] = useState<{
    ok: number
    fail: number
    errors: { line: string; message: string }[]
  } | null>(null)

  const reset = useCallback(() => {
    setStep('file')
    setFileKind('excel')
    setCategoryId('')
    setFile(null)
    setParseError(null)
    setHeaders([])
    setRawRows([])
    setColumnMap({})
    setPreviewRows([])
    setPreviewLoading(false)
    setImporting(false)
    setResultSummary(null)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const mapConflict = useMemo(() => {
    const targets = new Map<MasterImportField, string>()
    for (const [header, raw] of Object.entries(columnMap)) {
      if (raw === '') continue
      const f = raw as MasterImportField
      if (targets.has(f)) {
        return `"${fieldLabel(f)}" alanına hem "${targets.get(f)}" hem "${header}" sütunu eşlenmiş.`
      }
      targets.set(f, header)
    }
    return null
  }, [columnMap])

  const nameMapped = useMemo(() => Object.values(columnMap).includes('name'), [columnMap])

  const supplierCodeMapped = useMemo(() => Object.values(columnMap).includes('supplier_code'), [columnMap])

  const handleFile = async (f: File | null) => {
    setFile(f)
    setParseError(null)
    if (!f) return
    try {
      const { headers: h, rows } = await parseImportFile(f, fileKind)
      if (h.length === 0) {
        setParseError('Dosyada başlık satırı veya kayıt bulunamadı.')
        setHeaders([])
        setRawRows([])
        setColumnMap({})
        return
      }
      setHeaders(h)
      setRawRows(rows)
      const initial: Record<string, MasterImportField | ''> = {}
      h.forEach((header) => {
        initial[header] = guessImportField(header)
      })
      setColumnMap(initial)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Dosya okunamadı')
      setHeaders([])
      setRawRows([])
      setColumnMap({})
    }
  }

  const runPreview = async () => {
    if (!nameMapped || !supplierCodeMapped || mapConflict || categoryId === '' || categoryId === null) return
    setPreviewLoading(true)
    try {
      const existingRaw = new Set<string>()
      const vals = rawRows.map((row) => getRowSupplierCode(row, columnMap).trim()).filter(Boolean)
      const unique = [...new Set(vals)]
      const chunk = 600
      for (let i = 0; i < unique.length; i += chunk) {
        const part = unique.slice(i, i + chunk)
        const res = await fetch(`${API_URL}/api/products/import-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ match_field: 'supplier_code', values: part }),
        })
        const j = (await res.json()) as { existing?: string[]; error?: string }
        if (!res.ok) throw new Error(j.error || 'Sunucu hatası')
        for (const x of j.existing ?? []) existingRaw.add(x)
      }

      const out: PreviewRow[] = []
      const seenNorm = new Set<string>()
      rawRows.forEach((row, idx) => {
        const namePreview = (() => {
          for (const [h, f] of Object.entries(columnMap)) {
            if (f === 'name') return (row[h] ?? '').trim()
          }
          return ''
        })()
        const supplierCode = getRowSupplierCode(row, columnMap).trim()
        const existsInDb = supplierCode !== '' && existingRaw.has(supplierCode)
        let skipReason: string | undefined
        if (!namePreview) skipReason = 'Ürün adı boş'
        if (!supplierCode) skipReason = skipReason ? `${skipReason}; tedarikçi kodu boş` : 'Tedarikçi kodu boş'

        const dedupeKey =
          supplierCode !== '' ? `supplier_code:${supplierCode.toLowerCase()}` : `row:${idx}:${namePreview.toLowerCase()}`

        if (seenNorm.has(dedupeKey)) {
          skipReason = skipReason
            ? `${skipReason}; yinelenen tedarikçi kodu`
            : 'Yinelenen satır (aynı tedarikçi kodu)'
        } else {
          seenNorm.add(dedupeKey)
        }

        const selected = !existsInDb && !skipReason

        out.push({
          key: `${idx}-${dedupeKey}`,
          rowIndex: idx + 2,
          row,
          namePreview: namePreview || '—',
          matchValue: supplierCode || '—',
          existsInDb,
          selected: !!selected,
          skipReason,
        })
      })
      setPreviewRows(out)
      setStep('preview')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Önizleme hatası')
    } finally {
      setPreviewLoading(false)
    }
  }

  const runImport = async () => {
    if (categoryId === '' || categoryId === null) return
    const toCreate = previewRows.filter((r) => r.selected && !r.existsInDb && !r.skipReason)
    setImporting(true)
    setResultSummary(null)
    const errors: { line: string; message: string }[] = []
    let ok = 0
    try {
      for (const pr of toCreate) {
        const body = buildProductPayloadFromRow(pr.row, columnMap, categoryId)
        const name = String(body.name ?? '').trim()
        if (!name) {
          errors.push({ line: `Satır ${pr.rowIndex}`, message: 'Ürün adı boş' })
          continue
        }
        try {
          const res = await fetch(`${API_URL}/api/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          const json = await parseJsonResponse(res)
          if (!res.ok) throw new Error((json as { error?: string }).error || 'Kayıt oluşturulamadı')
          ok += 1
        } catch (err) {
          errors.push({
            line: `Satır ${pr.rowIndex} (${name.slice(0, 40)}${name.length > 40 ? '…' : ''})`,
            message: err instanceof Error ? err.message : 'Hata',
          })
        }
      }
      setResultSummary({ ok, fail: errors.length, errors })
      setStep('done')
      if (ok > 0) onImported()
    } finally {
      setImporting(false)
    }
  }

  const toggleRow = (key: string, checked: boolean) => {
    setPreviewRows((prev) => prev.map((r) => (r.key === key ? { ...r, selected: checked } : r)))
  }

  const toggleAllNew = (checked: boolean) => {
    setPreviewRows((prev) =>
      prev.map((r) => {
        if (r.existsInDb || r.skipReason) return r
        return { ...r, selected: checked }
      })
    )
  }

  const canContinueFile = file && categoryId !== '' && categoryId !== null && !parseError && headers.length > 0
  const canPreview = canContinueFile && nameMapped && supplierCodeMapped && !mapConflict

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-2 shrink-0 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Ürün içe aktar
          </DialogTitle>
          <DialogDescription>
            Excel veya XML dosyasından master ürün oluşturun. Kategori zorunludur. Mevcut kayıt kontrolü yalnızca master üründeki{' '}
            <strong className="font-medium text-foreground">tedarikçi kodu</strong> alanı üzerinden yapılır; bu sütunu eşlemeniz gerekir.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {step === 'file' && (
            <>
              <div className="grid gap-2">
                <Label>Dosya tipi</Label>
                <select
                  aria-label="İçe aktarım dosya tipi"
                  title="Dosya tipi"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={fileKind}
                  onChange={(e) => {
                    const k = e.target.value as ImportFileKind
                    setFileKind(k)
                    setFile(null)
                    setHeaders([])
                    setRawRows([])
                    setColumnMap({})
                    setParseError(null)
                  }}
                >
                  <option value="excel">Excel (.xlsx, .xls)</option>
                  <option value="xml">XML</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>Master kategori</Label>
                <CategorySelect
                  value={categoryId}
                  onChange={setCategoryId}
                  categories={categories}
                  placeholder="Kategori seçin"
                  variant="badge"
                />
              </div>
              <div className="grid gap-2">
                <Label>Dosya</Label>
                <input
                  type="file"
                  aria-label="İçe aktarılacak dosyayı seçin"
                  title="Dosya seç"
                  accept={fileKind === 'excel' ? '.xlsx,.xls' : '.xml,text/xml'}
                  className="text-sm"
                  onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                />
                {parseError && <p className="text-sm text-destructive">{parseError}</p>}
                {file && headers.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {file.name}: {headers.length} sütun, {rawRows.length} veri satırı
                  </p>
                )}
              </div>
            </>
          )}

          {step === 'map' && (
            <>
              {mapConflict && <p className="text-sm text-destructive">{mapConflict}</p>}
              {!nameMapped && (
                <p className="text-sm text-amber-700 dark:text-amber-400">Ürün adı sütunu eşlenmeli.</p>
              )}
              {!supplierCodeMapped && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Mevcut kayıt kontrolü tedarikçi kodu ile yapılır; en az bir kaynak sütunu &quot;Tedarikçi kodu&quot; alanına eşlenmeli.
                </p>
              )}
              <div className="border rounded-md overflow-hidden">
                <div className="max-h-[340px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/90">
                      <tr>
                        <th className="text-left p-2 font-medium">Kaynak başlık</th>
                        <th className="text-left p-2 font-medium">Master alan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {headers.map((h) => (
                        <tr key={h} className="border-t">
                          <td className="p-2 align-middle font-mono text-xs">{h}</td>
                          <td className="p-2 align-middle">
                            <select
                              aria-label={`${h} sütununu master alanla eşle`}
                              title={h}
                              className="h-8 w-full max-w-[280px] rounded-md border border-input bg-background px-2 text-xs"
                              value={columnMap[h] ?? ''}
                              onChange={(e) =>
                                setColumnMap((prev) => ({
                                  ...prev,
                                  [h]: e.target.value as MasterImportField | '',
                                }))
                              }
                            >
                              <option value="">(Atla)</option>
                              {MASTER_IMPORT_FIELD_META.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {step === 'preview' && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  Yeni satırlar varsayılan olarak seçilidir. Veritabanında aynı tedarikçi kodu olan kayıtlar içe aktarılamaz.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => toggleAllNew(true)}>
                  Yeni satırların tümünü seç
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => toggleAllNew(false)}>
                  Yeni satırların seçimini kaldır
                </Button>
              </div>
              <div className="border rounded-md overflow-hidden">
                <div className="max-h-[360px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/90">
                      <tr>
                        <th className="w-10 p-2" />
                        <th className="text-left p-2">Satır</th>
                        <th className="text-left p-2">Ürün adı</th>
                        <th className="text-left p-2">Tedarikçi kodu</th>
                        <th className="text-left p-2">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r) => {
                        const disabled = r.existsInDb || !!r.skipReason
                        return (
                          <tr key={r.key} className={cn('border-t', disabled && 'opacity-60')}>
                            <td className="p-2 text-center">
                              <Checkbox
                                checked={r.selected}
                                disabled={disabled}
                                onCheckedChange={(v) => toggleRow(r.key, v === true)}
                                aria-label={`Satır ${r.rowIndex} seç`}
                              />
                            </td>
                            <td className="p-2">{r.rowIndex}</td>
                            <td className="p-2 max-w-[200px] truncate" title={r.namePreview}>
                              {r.namePreview}
                            </td>
                            <td className="p-2 max-w-[120px] truncate" title={r.matchValue}>
                              {r.matchValue}
                            </td>
                            <td className="p-2 text-xs">
                              {r.existsInDb ? (
                                <span className="text-amber-700 dark:text-amber-400">Kayıtlı</span>
                              ) : r.skipReason ? (
                                <span className="text-muted-foreground">{r.skipReason}</span>
                              ) : (
                                <span className="text-green-700 dark:text-green-400">Yeni</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {step === 'done' && resultSummary && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {resultSummary.ok} ürün eklendi
                {resultSummary.fail > 0 ? `, ${resultSummary.fail} satırda hata` : ''}.
              </p>
              {resultSummary.errors.length > 0 && (
                <div className="rounded-md border bg-muted/40 p-3 max-h-[220px] overflow-y-auto text-xs space-y-1">
                  {resultSummary.errors.map((e, i) => (
                    <div key={i}>
                      <span className="font-medium">{e.line}:</span> {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t shrink-0 gap-2 sm:gap-2 flex-row flex-wrap justify-end">
          {step === 'done' ? (
            <Button variant="save" type="button" onClick={() => onOpenChange(false)}>
              Tamam
            </Button>
          ) : (
            <>
              <Button variant="close" type="button" onClick={() => onOpenChange(false)}>
                İptal
              </Button>
              {step === 'file' && (
                <Button type="button" disabled={!canContinueFile} onClick={() => setStep('map')}>
                  Devam
                </Button>
              )}
              {step === 'map' && (
                <>
                  <Button type="button" variant="outline" onClick={() => setStep('file')}>
                    Geri
                  </Button>
                  <Button type="button" disabled={!canPreview || previewLoading} onClick={() => void runPreview()}>
                    {previewLoading ? 'Kontrol ediliyor…' : 'Önizleme'}
                  </Button>
                </>
              )}
              {step === 'preview' && (
                <>
                  <Button type="button" variant="outline" onClick={() => setStep('map')} disabled={importing}>
                    Geri
                  </Button>
                  <Button
                    variant="save"
                    type="button"
                    disabled={
                      importing || !previewRows.some((r) => r.selected && !r.existsInDb && !r.skipReason)
                    }
                    onClick={() => void runImport()}
                  >
                    {importing ? 'Aktarılıyor…' : 'İçe aktar'}
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
