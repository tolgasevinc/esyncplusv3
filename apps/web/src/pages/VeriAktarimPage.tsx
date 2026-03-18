import { useState, useEffect, useCallback } from 'react'
import {
  Download,
  Upload,
  Plus,
  Trash2,
  GripVertical,
  FileSpreadsheet,
  FileText,
  Database,
  Play,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError } from '@/lib/toast'
import {
  DATA_SOURCES,
  OUTPUT_FORMATS,
  getDataSourceById,
  type TransferType,
  type OutputFormat,
} from '@/lib/data-transfer-schemas'
import { runExport } from '@/lib/export-transfer'

const STORAGE_KEY = 'esync-veri-aktarim-configs'

export interface TransferColumn {
  field: string
  header?: string
}

export interface TransferConfig {
  id: string
  type: TransferType
  dataSource: string
  outputFormat: OutputFormat
  columns: TransferColumn[]
  withHeader: boolean
  name?: string
}

function genId() {
  return `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function loadConfigs(): TransferConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveConfigs(configs: TransferConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
}

export function VeriAktarimPage() {
  const [configs, setConfigs] = useState<TransferConfig[]>(loadConfigs)
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<TransferConfig>>({
    type: 'export',
    dataSource: '',
    outputFormat: 'csv',
    columns: [],
    withHeader: false,
  })

  useEffect(() => {
    saveConfigs(configs)
  }, [configs])

  const exportConfigs = configs.filter((c) => c.type === 'export')
  const importConfigs = configs.filter((c) => c.type === 'import')

  const openNew = useCallback((type: 'export' | 'import') => {
    setEditingId(null)
    setForm({
      type,
      dataSource: '',
      outputFormat: 'csv',
      columns: [],
      withHeader: false,
    })
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((cfg: TransferConfig) => {
    setEditingId(cfg.id)
    setForm({ ...cfg })
    setModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    setEditingId(null)
  }, [])

  const handleSave = useCallback(() => {
    if (!form.dataSource?.trim()) {
      toastError('Hata', 'Veri kaynağı seçin')
      return
    }
    if (!form.outputFormat) {
      toastError('Hata', 'Çıktı tipi seçin')
      return
    }
    if (!form.columns?.length) {
      toastError('Hata', 'En az bir sütun ekleyin (Satır Ekle)')
      return
    }

    const schema = getDataSourceById(form.dataSource)
    const name =
      form.name?.trim() ||
      `${form.type === 'export' ? 'Dışa' : 'İçe'} Aktarım - ${schema?.label ?? form.dataSource} (${form.outputFormat?.toUpperCase()})`

    if (editingId) {
      setConfigs((prev) =>
        prev.map((c) =>
          c.id === editingId
            ? {
                ...c,
                type: form.type!,
                dataSource: form.dataSource!,
                outputFormat: form.outputFormat!,
                columns: form.columns!,
                withHeader: form.withHeader ?? false,
                name,
              }
            : c
        )
      )
      toastSuccess('Güncellendi', 'Aktarım ayarı güncellendi')
    } else {
      setConfigs((prev) => [
        ...prev,
        {
          id: genId(),
          type: form.type!,
          dataSource: form.dataSource!,
          outputFormat: form.outputFormat!,
          columns: form.columns!,
          withHeader: form.withHeader ?? false,
          name,
        },
      ])
      toastSuccess('Eklendi', 'Yeni aktarım ayarı eklendi')
    }
    closeModal()
  }, [form, editingId, closeModal])

  const handleRemove = useCallback((id: string) => {
    setConfigs((prev) => prev.filter((c) => c.id !== id))
    toastSuccess('Kaldırıldı', 'Aktarım ayarı kaldırıldı')
  }, [])

  const [runningId, setRunningId] = useState<string | null>(null)
  const handleRun = useCallback(async (cfg: TransferConfig) => {
    if (cfg.type !== 'export') return
    setRunningId(cfg.id)
    try {
      await runExport(cfg)
      toastSuccess('İndirildi', 'Dosya başarıyla oluşturulup indirildi')
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Dışa aktarım başarısız')
    } finally {
      setRunningId(null)
    }
  }, [])

  const [addRowModalOpen, setAddRowModalOpen] = useState(false)
  const [addRowField, setAddRowField] = useState('')
  const [addRowHeader, setAddRowHeader] = useState('')

  const openAddRowModal = useCallback(() => {
    setAddRowField('')
    setAddRowHeader('')
    setAddRowModalOpen(true)
  }, [])

  const closeAddRowModal = useCallback(() => {
    setAddRowModalOpen(false)
    setAddRowField('')
    setAddRowHeader('')
  }, [])

  const confirmAddRow = useCallback(() => {
    const schema = form.dataSource ? getDataSourceById(form.dataSource) : null
    const isEmpty = addRowField === '__empty__' || addRowField === ''
    const field = isEmpty ? '' : addRowField
    const fieldLabel = schema?.fields.find((f) => f.value === field)?.label ?? (isEmpty ? 'Boş sütun' : field)
    const header = addRowHeader.trim() || (isEmpty ? 'Boş sütun' : fieldLabel)

    setForm((f) => ({
      ...f,
      columns: [...(f.columns ?? []), { field, header: header || undefined }],
    }))
    closeAddRowModal()
  }, [form.dataSource, form.columns, addRowField, addRowHeader, closeAddRowModal])

  const removeColumn = useCallback((index: number) => {
    setForm((f) => ({
      ...f,
      columns: (f.columns ?? []).filter((_, i) => i !== index),
    }))
  }, [])

  const updateColumnHeader = useCallback((index: number, header: string) => {
    setForm((f) => {
      const cols = [...(f.columns ?? [])]
      if (index >= 0 && index < cols.length) {
        cols[index] = { ...cols[index], header: header || undefined }
        return { ...f, columns: cols }
      }
      return f
    })
  }, [])

  const schema = form.dataSource ? getDataSourceById(form.dataSource) : null

  return (
    <PageLayout
      title="Veri Aktarım"
      description="Dışa ve içe aktarım ayarlarını yönetin"
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'export' | 'import')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Dışa Aktarım
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            İçe Aktarım
          </TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Dışa aktarım ayarları — verileri XML, Excel veya CSV olarak dışa aktarın
            </p>
            <Button onClick={() => openNew('export')}>
              <Plus className="h-4 w-4 mr-2" />
              Yeni Ekle
            </Button>
          </div>
          {exportConfigs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Download className="h-14 w-14 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">Henüz dışa aktarım ayarı yok</p>
                <Button variant="outline" onClick={() => openNew('export')}>
                  <Plus className="h-4 w-4 mr-2" />
                  İlk Ayarı Ekle
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {exportConfigs.map((cfg) => (
                <ConfigCard
                  key={cfg.id}
                  config={cfg}
                  onEdit={() => openEdit(cfg)}
                  onRemove={() => handleRemove(cfg.id)}
                  onRun={cfg.type === 'export' ? () => handleRun(cfg) : undefined}
                  isRunning={runningId === cfg.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="import" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              İçe aktarım ayarları — XML, Excel veya CSV dosyalarından veri aktarın
            </p>
            <Button onClick={() => openNew('import')}>
              <Plus className="h-4 w-4 mr-2" />
              Yeni Ekle
            </Button>
          </div>
          {importConfigs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Upload className="h-14 w-14 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">Henüz içe aktarım ayarı yok</p>
                <Button variant="outline" onClick={() => openNew('import')}>
                  <Plus className="h-4 w-4 mr-2" />
                  İlk Ayarı Ekle
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {importConfigs.map((cfg) => (
                <ConfigCard
                  key={cfg.id}
                  config={cfg}
                  onEdit={() => openEdit(cfg)}
                  onRemove={() => handleRemove(cfg.id)}
                  onRun={undefined}
                  isRunning={false}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Aktarım Ayarlarını Düzenle' : 'Yeni Aktarım Ayarı'}</DialogTitle>
            <DialogDescription>
              Aktarım tipi, veri kaynağı, çıktı formatı ve sütunları belirleyin. Varsayılan olarak başlıksız oluşturulur.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Aktarım Tipi</Label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TransferType }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="export">Dışa Aktarım</option>
                  <option value="import">İçe Aktarım</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Veri Kaynağı</Label>
                <select
                  value={form.dataSource}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => ({ ...f, dataSource: v, columns: [] }))
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Seçin</option>
                  {DATA_SOURCES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Çıktı Tipi</Label>
                <select
                  value={form.outputFormat}
                  onChange={(e) => setForm((f) => ({ ...f, outputFormat: e.target.value as OutputFormat }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {OUTPUT_FORMATS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex items-center gap-2 py-2">
                  <Switch
                    id="with-header"
                    checked={form.withHeader ?? false}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, withHeader: v }))}
                  />
                  <Label htmlFor="with-header" className="cursor-pointer font-normal">
                    Başlık satırı ekle (varsayılan: başlıksız)
                  </Label>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Açıklayıcı Ad (opsiyonel)</Label>
              <Input
                value={form.name ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Örn: Ürün Listesi CSV"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sütunlar</Label>
                {schema && (
                  <Button variant="outline" size="sm" onClick={openAddRowModal}>
                    <Plus className="h-3 w-3 mr-1" />
                    Satır Ekle
                  </Button>
                )}
              </div>
              {schema ? (
                <div className="space-y-2">
                  {form.columns && form.columns.length > 0 ? (
                    <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                      {form.columns.map((col, i) => {
                        const f = schema.fields.find((x) => x.value === col.field)
                        const displayLabel = col.field === '' ? 'Boş sütun' : (f?.label ?? col.field)
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-2 p-2 hover:bg-muted/30"
                          >
                            <span className="text-sm font-medium w-40 shrink-0 truncate" title={displayLabel}>
                              {displayLabel}
                            </span>
                            <Input
                              placeholder="Başlık adı"
                              value={col.header ?? ''}
                              onChange={(e) => updateColumnHeader(i, e.target.value)}
                              className="h-8 flex-1 text-sm"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeColumn(i)}
                              className="text-destructive hover:text-destructive h-8 w-8 p-0 shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div
                      className="border border-dashed rounded-md p-6 text-center text-muted-foreground text-sm cursor-pointer hover:bg-muted/30"
                      onClick={openAddRowModal}
                    >
                      Henüz sütun yok. <strong className="text-foreground">Satır Ekle</strong> ile alan veya boş sütun ekleyin.
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  Veri kaynağı seçin, ardından Satır Ekle ile sütunları ekleyin
                </p>
              )}
            </div>

            {/* Satır Ekle modal */}
            <Dialog open={addRowModalOpen} onOpenChange={(o) => !o && closeAddRowModal()}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Satır Ekle</DialogTitle>
                  <DialogDescription>
                    Tüm alanlardan seçim yapın veya boş sütun ekleyin
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Alan</Label>
                    <select
                      value={addRowField}
                      onChange={(e) => setAddRowField(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seçin...</option>
                      <option value="__empty__">— Boş sütun —</option>
                      {schema?.fields.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Başlık adı (opsiyonel)</Label>
                    <Input
                      value={addRowHeader}
                      onChange={(e) => setAddRowHeader(e.target.value)}
                      placeholder={addRowField === '__empty__' || addRowField === '' ? 'Boş sütun' : 'Alan adı kullanılır'}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeAddRowModal}>
                    İptal
                  </Button>
                  <Button
                    onClick={confirmAddRow}
                    disabled={!addRowField}
                  >
                    Ekle
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>
              İptal
            </Button>
            <Button onClick={handleSave}>
              {editingId ? 'Güncelle' : 'Ekle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}

function ConfigCard({
  config,
  onEdit,
  onRemove,
  onRun,
  isRunning,
}: {
  config: TransferConfig
  onEdit: () => void
  onRemove: () => void
  onRun?: () => void
  isRunning?: boolean
}) {
  const schema = getDataSourceById(config.dataSource)
  const formatLabel = OUTPUT_FORMATS.find((o) => o.value === config.outputFormat)?.label ?? config.outputFormat

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2 min-w-0">
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            {config.type === 'export' ? (
              <Download className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <Upload className="h-4 w-4 text-blue-600 shrink-0" />
            )}
            <span className="truncate">{config.name || `${schema?.label ?? config.dataSource} (${formatLabel})`}</span>
          </CardTitle>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Düzenle
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Database className="h-3.5 w-3" />
            {schema?.label ?? config.dataSource}
          </span>
          <span className="inline-flex items-center gap-1">
            {config.outputFormat === 'xlsx' || config.outputFormat === 'xls' ? (
              <FileSpreadsheet className="h-3.5 w-3" />
            ) : (
              <FileText className="h-3.5 w-3" />
            )}
            {formatLabel}
          </span>
          <span>{config.columns.length} sütun</span>
          {config.withHeader && <span className="text-amber-600">Başlıklı</span>}
        </div>
        {onRun && (
          <Button
            className="w-full mt-auto"
            onClick={onRun}
            disabled={isRunning}
          >
            <Play className="h-4 w-4 mr-2" />
            {isRunning ? 'Hazırlanıyor...' : 'Çalıştır'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
