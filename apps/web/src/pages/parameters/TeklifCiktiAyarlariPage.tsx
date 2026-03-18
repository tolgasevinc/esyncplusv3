import { useState, useEffect, useCallback } from 'react'
import {
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
  ChevronUp,
  Image,
  Minus,
  Type,
  QrCode,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
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
import { Check } from 'lucide-react'
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
  text: Type,
  qr_code: QrCode,
}

/** Birden fazla eklenebilen blok tipleri */
const MULTIPLE_BLOCK_TYPES: PdfBlockType[] = ['text', 'qr_code']

/** Yazı tipi seçici - her seçenek kendi fontuyla gösterilir */
function FontSelect({
  value,
  onChange,
  fonts,
}: {
  value: string
  onChange: (v: string) => void
  fonts: string[]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal h-10"
          style={{ fontFamily: value }}
        >
          <span className="truncate">{value}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[280px] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
        {fonts.map((f) => (
          <DropdownMenuItem
            key={f}
            onClick={() => onChange(f)}
            className="cursor-pointer"
          >
            <span className="flex items-center gap-2 w-full">
              <span className="w-4 shrink-0 flex justify-center">
                {value === f && <Check className="h-4 w-4 text-primary" />}
              </span>
              <span style={{ fontFamily: f }}>{f}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
  const isText = edited.type === 'text'
  const isQrCode = edited.type === 'qr_code'

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
          {isText && (
            <>
              <div>
                <Label className="text-xs">Metin İçeriği</Label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                  placeholder="Görüntülenecek metni girin..."
                  value={edited.text_content ?? ''}
                  onChange={(e) => setEdited((b) => (b ? { ...b, text_content: e.target.value || undefined } : b))}
                  rows={3}
                />
              </div>
              <div>
                <Label className="text-xs">Hizalama</Label>
                <div className="flex gap-1 mt-1">
                  <Button
                    type="button"
                    variant={edited.textAlign === 'left' ? 'default' : 'outline'}
                    size="icon"
                    className={`h-10 w-10 shrink-0 ${edited.textAlign === 'left' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setEdited((b) => (b ? { ...b, textAlign: 'left' as const } : b))}
                    title="Sola yaslı"
                  >
                    <AlignLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={edited.textAlign === 'center' ? 'default' : 'outline'}
                    size="icon"
                    className={`h-10 w-10 shrink-0 ${edited.textAlign === 'center' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setEdited((b) => (b ? { ...b, textAlign: 'center' as const } : b))}
                    title="Ortala"
                  >
                    <AlignCenter className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={edited.textAlign === 'right' ? 'default' : 'outline'}
                    size="icon"
                    className={`h-10 w-10 shrink-0 ${edited.textAlign === 'right' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setEdited((b) => (b ? { ...b, textAlign: 'right' as const } : b))}
                    title="Sağa yaslı"
                  >
                    <AlignRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
          {isQrCode && (
            <div>
              <Label className="text-xs">QR Kod İçeriği</Label>
              <Input
                placeholder="URL veya metin (QR kodda encode edilecek)"
                value={edited.qr_content ?? ''}
                onChange={(e) => setEdited((b) => (b ? { ...b, qr_content: e.target.value || undefined } : b))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                QR kod taranınca bu metin veya URL gösterilir
              </p>
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
          {!isImage && !isQrCode && (
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
              <FontSelect
                value={edited.fontFamily || 'Roboto'}
                onChange={(v) => setEdited((b) => (b ? { ...b, fontFamily: v } : b))}
                fonts={FONT_FAMILIES}
              />
            </div>
            <div>
              <Label className="text-xs">Yazı Stili</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant={edited.fontWeight === 'bold' ? 'default' : 'outline'}
                  size="icon"
                  className={`h-10 w-10 shrink-0 ${edited.fontWeight === 'bold' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  onClick={() => setEdited((b) => (b ? { ...b, fontWeight: b.fontWeight === 'bold' ? 'normal' : 'bold' } : b))}
                  title="Kalın"
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant={edited.fontStyle === 'italic' ? 'default' : 'outline'}
                  size="icon"
                  className={`h-10 w-10 shrink-0 ${edited.fontStyle === 'italic' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  onClick={() => setEdited((b) => (b ? { ...b, fontStyle: b.fontStyle === 'italic' ? 'normal' : 'italic' } : b))}
                  title="İtalik"
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant={edited.textDecoration === 'underline' ? 'default' : 'outline'}
                  size="icon"
                  className={`h-10 w-10 shrink-0 ${edited.textDecoration === 'underline' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  onClick={() => setEdited((b) => (b ? { ...b, textDecoration: b.textDecoration === 'underline' ? 'none' : 'underline' } : b))}
                  title="Altı çizili"
                >
                  <Underline className="h-4 w-4" />
                </Button>
              </div>
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

  // Google Fonts yükle - yazı tipi seçicide önizleme için
  useEffect(() => {
    const families = FONT_FAMILIES.slice(0, 50).map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`)
    const url = `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
    return () => link.remove()
  }, [])

  const handleSamplePdf = () => {
    window.open(`${API_URL}/api/offers/sample/pdf`, '_blank', 'noopener')
  }

  const saveConfig = useCallback(
    (nextConfig: TeklifCiktiLayoutConfig) => {
      saveTeklifCiktiAyarlari(nextConfig)
        .then(() => toastSuccess('Kaydedildi', 'Değişiklikler kaydedildi.'))
        .catch((err) => toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi'))
    },
    []
  )

  const addBlock = (type: PdfBlockType) => {
    setConfig((prev) => {
      const maxOrder = prev.blocks.length > 0 ? Math.max(...prev.blocks.map((b) => b.sortOrder)) : -1
      const newBlock = createDefaultBlock(type, maxOrder + 1)
      const next = {
        ...prev,
        blocks: [...prev.blocks, newBlock].sort((a, b) => a.sortOrder - b.sortOrder),
      }
      saveConfig(next)
      return next
    })
  }

  const updateBlock = (updated: PdfBlock) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        blocks: prev.blocks.map((b) => (b.id === updated.id ? updated : b)).sort((a, b) => a.sortOrder - b.sortOrder),
      }
      saveConfig(next)
      return next
    })
  }

  const removeBlock = (block: PdfBlock) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        blocks: prev.blocks.filter((b) => b.id !== block.id).sort((a, b) => a.sortOrder - b.sortOrder),
      }
      saveConfig(next)
      return next
    })
    setDeleteBlock(null)
  }

  const moveBlockUp = (block: PdfBlock) => {
    setConfig((prev) => {
      const blocks = [...prev.blocks]
      const i = blocks.findIndex((b) => b.id === block.id)
      if (i <= 0) return prev
      const temp = blocks[i].sortOrder
      blocks[i] = { ...blocks[i], sortOrder: blocks[i - 1].sortOrder }
      blocks[i - 1] = { ...blocks[i - 1], sortOrder: temp }
      const next = { ...prev, blocks: blocks.sort((a, b) => a.sortOrder - b.sortOrder) }
      saveConfig(next)
      return next
    })
  }

  const moveBlockDown = (block: PdfBlock) => {
    setConfig((prev) => {
      const blocks = [...prev.blocks]
      const i = blocks.findIndex((b) => b.id === block.id)
      if (i < 0 || i >= blocks.length - 1) return prev
      const temp = blocks[i].sortOrder
      blocks[i] = { ...blocks[i], sortOrder: blocks[i + 1].sortOrder }
      blocks[i + 1] = { ...blocks[i + 1], sortOrder: temp }
      const next = { ...prev, blocks: blocks.sort((a, b) => a.sortOrder - b.sortOrder) }
      saveConfig(next)
      return next
    })
  }

  const STEP = 5
  const adjustBlockValue = (block: PdfBlock, field: 'x' | 'y' | 'width' | 'height', delta: number) => {
    setConfig((prev) => {
      const blocks = prev.blocks.map((b) => {
        if (b.id !== block.id) return b
        const val = b[field] ?? (field === 'x' || field === 'y' ? 20 : 80)
        let next = Math.round(val) + delta
        if (field === 'x' || field === 'y') next = Math.max(0, Math.min(next, field === 'x' ? 210 : 297))
        else next = Math.max(1, Math.min(next, 210))
        return { ...b, [field]: next }
      })
      const next = { ...prev, blocks }
      saveConfig(next)
      return next
    })
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
        <Button variant="outline" onClick={handleSamplePdf}>
          <FileText className="h-4 w-4 mr-2" />
          Örnek Teklif Çıktısı
        </Button>
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
                  const canAddMultiple = MULTIPLE_BLOCK_TYPES.includes(type)
                  const isDisabled = !canAddMultiple && usedTypes.has(type)
                  return (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => !isDisabled && addBlock(type)}
                      disabled={isDisabled}
                      className={isDisabled ? 'opacity-60' : ''}
                    >
                      {BLOCK_TYPE_LABELS[type]}
                      {isDisabled && <span className="ml-2 text-xs text-muted-foreground">(eklendi)</span>}
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
            {config.blocks.map((block, index) => {
              const Icon = BLOCK_ICONS[block.type]
              const canMoveUp = index > 0
              const canMoveDown = index < config.blocks.length - 1
              return (
                <Card key={block.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{BLOCK_TYPE_LABELS[block.type]}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                            <div className="flex items-center gap-0.5">
                              <span className="text-xs text-muted-foreground w-5">X</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustBlockValue(block, 'x', -STEP)} title={`X -${STEP}`}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-xs font-mono w-8 text-center">{block.x}</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustBlockValue(block, 'x', STEP)} title={`X +${STEP}`}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <span className="text-xs text-muted-foreground w-5">Y</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustBlockValue(block, 'y', -STEP)} title={`Y -${STEP}`}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-xs font-mono w-8 text-center">{block.y}</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustBlockValue(block, 'y', STEP)} title={`Y +${STEP}`}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <span className="text-xs text-muted-foreground w-5">W</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustBlockValue(block, 'width', -STEP)} title={`Genişlik -${STEP}`}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-xs font-mono w-8 text-center">{block.width}</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustBlockValue(block, 'width', STEP)} title={`Genişlik +${STEP}`}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <span className="text-xs text-muted-foreground w-5">H</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustBlockValue(block, 'height', -STEP)} title={`Yükseklik -${STEP}`}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-xs font-mono w-8 text-center">{block.height}</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustBlockValue(block, 'height', STEP)} title={`Yükseklik +${STEP}`}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {block.type === 'image' && block.image_key ? ` · ${block.image_key.split('/').pop()}` : ''}
                            {block.type === 'text' ? '' : block.type === 'qr_code' && block.qr_content ? ` · ${block.qr_content.slice(0, 25)}${block.qr_content.length > 25 ? '…' : ''}` : ''}
                            {!['image', 'text', 'qr_code'].includes(block.type) ? `Yazı: ${block.fontSize}px ${block.fontFamily || 'Roboto'}` : ''}
                          </p>
                          {(block.type === 'text' && block.text_content) || (block.type === 'footer' && block.footer_text) ? (
                            <div
                              className="mt-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground line-clamp-3"
                              style={block.type === 'text' ? { fontFamily: block.fontFamily || 'Roboto' } : undefined}
                            >
                              {block.type === 'text' ? block.text_content : block.footer_text}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveBlockUp(block)}
                          disabled={!canMoveUp}
                          title="Yukarı taşı"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveBlockDown(block)}
                          disabled={!canMoveDown}
                          title="Aşağı taşı"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        {!block.visible && (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Gizli</span>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(block)} title="Düzenle">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteBlock(block)} title="Sil">
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
        onConfirm={() => { if (deleteBlock) removeBlock(deleteBlock) }}
      />
    </PageLayout>
  )
}
