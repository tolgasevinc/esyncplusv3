import { useState, useEffect, useCallback } from 'react'
import {
  Save,
  FileText,
  Plus,
  Pencil,
  Trash2,
  Building2,
  User,
  Heading,
  List,
  FileText as FileTextIcon,
  AlignVerticalSpaceAround,
  ChevronDown,
  Image,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError } from '@/lib/toast'
import { API_URL } from '@/lib/api'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { ImageBlockPicker } from '@/components/ImageBlockPicker'
import {
  fetchTeklifCiktiAyarlari,
  saveTeklifCiktiAyarlari,
  getDefaultLayoutConfig,
  createDefaultBlock,
  BLOCK_TYPE_LABELS,
  FONT_FAMILIES,
  type TeklifCiktiLayoutConfig,
  type PdfBlock,
  type PdfBlockType,
} from '@/lib/teklif-cikti-ayarlari-settings'

const BLOCK_ICONS: Record<PdfBlockType, typeof Building2> = {
  company: Building2,
  customer: User,
  offer_header: Heading,
  offer_items: List,
  offer_notes: FileTextIcon,
  footer: AlignVerticalSpaceAround,
  image: Image,
}

function BlockEditDialog({
  block,
  open,
  onOpenChange,
  onSave,
}: {
  block: PdfBlock | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (b: PdfBlock) => void
}) {
  const [edited, setEdited] = useState<PdfBlock | null>(null)

  useEffect(() => {
    setEdited(block ? { ...block } : null)
  }, [block, open])

  if (!edited) return null

  const isCompany = edited.type === 'company'
  const isFooter = edited.type === 'footer'
  const isImage = edited.type === 'image'

  const handleSave = () => {
    onSave(edited)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 pr-12 border-b border-border">
          <DialogTitle>{BLOCK_TYPE_LABELS[edited.type]} Düzenle</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          {isImage && (
            <div className="rounded-lg border p-4 bg-muted/30">
              <Label className="text-sm font-medium">Görsel Seçimi</Label>
              <p className="text-xs text-muted-foreground mb-3">R2 assets klasöründen görsel seçin</p>
              <ImageBlockPicker
                value={edited.image_key ?? ''}
                onChange={(key) => setEdited((b) => (b ? { ...b, image_key: key } : b))}
              />
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">X (mm)</Label>
              <Input
                type="number"
                value={edited.x}
                onChange={(e) => setEdited((b) => (b ? { ...b, x: Number(e.target.value) || 0 } : b))}
                min={0}
                max={210}
              />
            </div>
            <div>
              <Label className="text-xs">Y (mm)</Label>
              <Input
                type="number"
                value={edited.y}
                onChange={(e) => setEdited((b) => (b ? { ...b, y: Number(e.target.value) || 0 } : b))}
                min={0}
                max={297}
              />
            </div>
            <div>
              <Label className="text-xs">Genişlik (mm)</Label>
              <Input
                type="number"
                value={edited.width}
                onChange={(e) => setEdited((b) => (b ? { ...b, width: Number(e.target.value) || 0 } : b))}
                min={1}
                max={210}
              />
            </div>
            <div>
              <Label className="text-xs">Yükseklik (mm)</Label>
              <Input
                type="number"
                value={edited.height}
                onChange={(e) => setEdited((b) => (b ? { ...b, height: Number(e.target.value) || 0 } : b))}
                min={1}
                max={297}
              />
            </div>
          </div>
          {!isImage && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Yazı Boyutu (px)</Label>
              <Input
                type="number"
                value={edited.fontSize}
                onChange={(e) => setEdited((b) => (b ? { ...b, fontSize: Number(e.target.value) || 11 } : b))}
                min={8}
                max={24}
              />
            </div>
            <div>
              <Label className="text-xs">Yazı Tipi</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={edited.fontFamily || 'Arial'}
                onChange={(e) => setEdited((b) => (b ? { ...b, fontFamily: e.target.value } : b))}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <Label className="text-xs">Yazı Rengi</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  value={edited.fontColor || '#000000'}
                  onChange={(e) => setEdited((b) => (b ? { ...b, fontColor: e.target.value } : b))}
                  className="w-14 h-10 p-1 cursor-pointer"
                />
                <Input
                  type="text"
                  value={edited.fontColor || '#000000'}
                  onChange={(e) => setEdited((b) => (b ? { ...b, fontColor: e.target.value } : b))}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          )}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <Label>Görünür</Label>
            <Switch
              checked={edited.visible}
              onCheckedChange={(v) => setEdited((b) => (b ? { ...b, visible: v } : b))}
            />
          </div>
          {isCompany && (
            <>
              <div>
                <Label className="text-xs">Logo URL</Label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={edited.logo_url ?? ''}
                  onChange={(e) => setEdited((b) => (b ? { ...b, logo_url: e.target.value || undefined } : b))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Logo Genişlik</Label>
                  <Input
                    type="number"
                    value={edited.logo_width ?? 60}
                    onChange={(e) => setEdited((b) => (b ? { ...b, logo_width: Number(e.target.value) || 60 } : b))}
                    min={20}
                    max={200}
                  />
                </div>
                <div>
                  <Label className="text-xs">Logo Yükseklik</Label>
                  <Input
                    type="number"
                    value={edited.logo_height ?? 40}
                    onChange={(e) => setEdited((b) => (b ? { ...b, logo_height: Number(e.target.value) || 40 } : b))}
                    min={20}
                    max={150}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Firma Adı</Label>
                <Input
                  placeholder="Firma unvanı"
                  value={edited.company_name ?? ''}
                  onChange={(e) => setEdited((b) => (b ? { ...b, company_name: e.target.value || undefined } : b))}
                />
              </div>
              <div>
                <Label className="text-xs">Adres</Label>
                <Input
                  placeholder="Adres"
                  value={edited.company_address ?? ''}
                  onChange={(e) => setEdited((b) => (b ? { ...b, company_address: e.target.value || undefined } : b))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Telefon</Label>
                  <Input
                    placeholder="0212..."
                    value={edited.company_phone ?? ''}
                    onChange={(e) => setEdited((b) => (b ? { ...b, company_phone: e.target.value || undefined } : b))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Vergi Dairesi / No</Label>
                  <Input
                    placeholder="Vergi dairesi, no"
                    value={edited.company_tax_office ?? ''}
                    onChange={(e) => setEdited((b) => (b ? { ...b, company_tax_office: e.target.value || undefined } : b))}
                  />
                </div>
              </div>
            </>
          )}
          {isFooter && (
            <div>
              <Label className="text-xs">Antet Metni</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Resmi ünvan, adres, telefon..."
                value={edited.footer_text ?? ''}
                onChange={(e) => setEdited((b) => (b ? { ...b, footer_text: e.target.value || undefined } : b))}
                rows={3}
              />
            </div>
          )}
        </div>
        <DialogFooter className="flex-shrink-0 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={handleSave}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TeklifCiktiAyarlariPage() {
  const [config, setConfig] = useState<TeklifCiktiLayoutConfig>(getDefaultLayoutConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editBlock, setEditBlock] = useState<PdfBlock | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteBlock, setDeleteBlock] = useState<PdfBlock | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchTeklifCiktiAyarlari()
      setConfig(data)
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Ayarlar yüklenemedi')
      setConfig(getDefaultLayoutConfig())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveTeklifCiktiAyarlari(config)
      toastSuccess('Kaydedildi', 'Teklif çıktı ayarları güncellendi.')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const handleSamplePdf = () => {
    window.open(`${API_URL}/api/offers/sample/pdf`, '_blank', 'noopener')
  }

  const addBlock = (type: PdfBlockType) => {
    const maxOrder = config.blocks.length > 0 ? Math.max(...config.blocks.map((b) => b.sortOrder)) : -1
    const newBlock = createDefaultBlock(type, maxOrder + 1)
    setConfig((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newBlock].sort((a, b) => a.sortOrder - b.sortOrder),
    }))
  }

  const updateBlock = (updated: PdfBlock) => {
    setConfig((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === updated.id ? updated : b)).sort((a, b) => a.sortOrder - b.sortOrder),
    }))
  }

  const removeBlock = (block: PdfBlock) => {
    setConfig((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== block.id).sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    setDeleteBlock(null)
  }

  const openEdit = (block: PdfBlock) => {
    setEditBlock(block)
    setEditOpen(true)
  }

  const usedTypes = new Set(config.blocks.map((b) => b.type))

  return (
    <PageLayout
      title="Teklif Çıktı Ayarları"
      description="PDF teklif çıktısında blokları ekleyin, konum ve stil ayarlarını yapın"
      backTo="/parametreler"
      footerActions={
        <>
          <Button variant="outline" onClick={handleSamplePdf}>
            <FileText className="h-4 w-4 mr-2" />
            Örnek Teklif Çıktısı
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bloklar</CardTitle>
            <CardDescription>
              Blok ekle butonu ile firma, müşteri, teklif satırları vb. blokları ekleyin. Her blokta konum, yazı tipi,
              renk ve boyut ayarlanabilir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Blok Ekle
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(Object.keys(BLOCK_TYPE_LABELS) as PdfBlockType[]).map((type) => {
                  const isAdded = usedTypes.has(type)
                  return (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => !isAdded && addBlock(type)}
                      disabled={isAdded}
                      className={isAdded ? 'opacity-60' : ''}
                    >
                      {BLOCK_TYPE_LABELS[type]}
                      {isAdded && <span className="ml-2 text-xs text-muted-foreground">(eklendi)</span>}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-muted-foreground">Yükleniyor...</p>
        ) : config.blocks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Henüz blok eklenmedi. &quot;Blok Ekle&quot; butonundan blok seçin.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {config.blocks.map((block) => {
              const Icon = BLOCK_ICONS[block.type]
              return (
                <Card key={block.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{BLOCK_TYPE_LABELS[block.type]}</p>
                          <p className="text-xs text-muted-foreground">
                            {block.type === 'image'
                              ? `Konum: ${block.x}×${block.y} mm · Boyut: ${block.width}×${block.height} mm${block.image_key ? ` · ${block.image_key.split('/').pop()}` : ''}`
                              : `Konum: ${block.x}×${block.y} mm · Boyut: ${block.width}×${block.height} mm · Yazı: ${block.fontSize}px ${block.fontFamily || 'Arial'}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!block.visible && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Gizli</span>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(block)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteBlock(block)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <BlockEditDialog
        block={editBlock}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={updateBlock}
      />

      <ConfirmDeleteDialog
        open={!!deleteBlock}
        onOpenChange={(o) => !o && setDeleteBlock(null)}
        title="Blok Sil"
        description={
          deleteBlock
            ? `"${BLOCK_TYPE_LABELS[deleteBlock.type]}" bloğunu silmek istediğinize emin misiniz?`
            : ''
        }
        onConfirm={() => deleteBlock && removeBlock(deleteBlock)}
      />
    </PageLayout>
  )
}
