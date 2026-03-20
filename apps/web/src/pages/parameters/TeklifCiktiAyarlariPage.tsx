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
  Layout,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  PAGE_PRESETS,
  type TeklifCiktiLayoutConfig,
  type PdfBlock,
  type PdfBlockType,
} from '@/lib/teklif-cikti-ayarlari-settings'

/** Sayısal giriş — sağda tek spinner (yukarı/aşağı oklar) */
function NumericInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  className,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  className?: string
}) {
  const clamp = (v: number) => {
    if (min !== undefined && v < min) return min
    if (max !== undefined && v > max) return max
    return v
  }
  return (
    <div className={`flex h-10 rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0 ${className ?? ''}`}>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="flex flex-col w-8 shrink-0 bg-muted/60 border-l border-input">
        <button
          type="button"
          tabIndex={-1}
          className="flex-1 flex items-center justify-center min-h-0 text-muted-foreground hover:bg-muted/80 active:bg-muted transition-colors"
          onClick={() => onChange(clamp(Number((value + step).toFixed(10))))}
        >
          <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="flex-1 flex items-center justify-center min-h-0 text-muted-foreground hover:bg-muted/80 active:bg-muted transition-colors"
          onClick={() => onChange(clamp(Number((value - step).toFixed(10))))}
        >
          <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

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
  line: Minus,
}

/** Birden fazla eklenebilen blok tipleri */
const MULTIPLE_BLOCK_TYPES: PdfBlockType[] = ['text', 'qr_code', 'line']

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
  const isLine = edited.type === 'line'
  const isOfferHeader = edited.type === 'offer_header'

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
          {isOfferHeader && (
            <div>
              <Label className="text-xs">Hizalama</Label>
              <p className="text-xs text-muted-foreground mb-1">Teklif No ve Tarih hizalaması</p>
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
          {isLine && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
              <Label className="text-sm font-medium">Çizgi Ayarları</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Yön</Label>
                  <div className="flex gap-2 mt-1">
                    <Button
                      type="button"
                      variant={(edited.lineOrientation ?? 'horizontal') === 'horizontal' ? 'default' : 'outline'}
                      className="flex-1"
                      size="sm"
                      onClick={() => setEdited((b) => (b ? { ...b, lineOrientation: 'horizontal' } : b))}
                    >
                      Yatay ─
                    </Button>
                    <Button
                      type="button"
                      variant={(edited.lineOrientation ?? 'horizontal') === 'vertical' ? 'default' : 'outline'}
                      className="flex-1"
                      size="sm"
                      onClick={() => setEdited((b) => (b ? { ...b, lineOrientation: 'vertical' } : b))}
                    >
                      Dikey │
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Uzunluk (mm)</Label>
                  <NumericInput
                    value={edited.lineLength ?? 170}
                    min={1}
                    max={500}
                    onChange={(v) => setEdited((b) => (b ? { ...b, lineLength: v } : b))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Kalınlık (mm)</Label>
                  <NumericInput
                    value={edited.lineThickness ?? 0.5}
                    min={0.1}
                    max={20}
                    step={0.1}
                    onChange={(v) => setEdited((b) => (b ? { ...b, lineThickness: v } : b))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Renk</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="color"
                      value={edited.lineColor ?? '#000000'}
                      onChange={(e) => setEdited((b) => (b ? { ...b, lineColor: e.target.value } : b))}
                      className="w-14 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={edited.lineColor ?? '#000000'}
                      onChange={(e) => setEdited((b) => (b ? { ...b, lineColor: e.target.value } : b))}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">
                {edited.x < 0 ? 'X — Sağdan (mm)' : 'X — Soldan (mm)'}
              </Label>
              <NumericInput
                value={edited.x}
                onChange={(v) => setEdited((b) => (b ? { ...b, x: v } : b))}
              />
              {edited.x < 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">Sağ kenardan {Math.abs(edited.x)} mm</p>
              )}
            </div>
            <div>
              <Label className="text-xs">
                {edited.y < 0 ? 'Y — Alttan (mm)' : 'Y — Üstten (mm)'}
              </Label>
              <NumericInput
                value={edited.y}
                onChange={(v) => setEdited((b) => (b ? { ...b, y: v } : b))}
              />
              {edited.y < 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">Alt kenardan {Math.abs(edited.y)} mm</p>
              )}
            </div>
            {!isLine && (
              <div>
                <Label className="text-xs">Genişlik (mm)</Label>
                <NumericInput
                  value={edited.width}
                  min={1}
                  max={210}
                  onChange={(v) => setEdited((b) => (b ? { ...b, width: v } : b))}
                />
              </div>
            )}
            {!isLine && (
              <div>
                <Label className="text-xs">Yükseklik (mm)</Label>
                <NumericInput
                  value={edited.height}
                  min={1}
                  max={297}
                  onChange={(v) => setEdited((b) => (b ? { ...b, height: v } : b))}
                />
              </div>
            )}
          </div>
          {!isImage && !isQrCode && !isLine && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Yazı Boyutu (px)</Label>
              <NumericInput
                value={edited.fontSize}
                min={6}
                max={72}
                onChange={(v) => setEdited((b) => (b ? { ...b, fontSize: v } : b))}
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
                  <NumericInput
                    value={edited.logo_width ?? 60}
                    min={10}
                    max={200}
                    onChange={(v) => setEdited((b) => (b ? { ...b, logo_width: v } : b))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Logo Yükseklik</Label>
                  <NumericInput
                    value={edited.logo_height ?? 40}
                    min={10}
                    max={150}
                    onChange={(v) => setEdited((b) => (b ? { ...b, logo_height: v } : b))}
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

  const updateBlockField = (
    block: PdfBlock,
    field: 'x' | 'y' | 'width' | 'height' | 'lineLength' | 'lineThickness',
    value: number
  ) => {
    setConfig((prev) => {
      const blocks = prev.blocks.map((b) => {
        if (b.id !== block.id) return b
        return { ...b, [field]: value }
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
      headerActions={
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <Layout className="h-4 w-4 mr-2" />
                Sayfa Boyutu
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-4">
              <div className="space-y-4">
                <p className="text-sm font-medium">Sayfa Boyutu</p>
                <p className="text-xs text-muted-foreground">10 px = 1 mm. Preset seçin veya özel girin.</p>
                <div className="flex flex-wrap gap-2">
                  {PAGE_PRESETS.map((p) => {
                    const active = (config.pageWidth ?? 2100) === p.width && (config.pageHeight ?? 2970) === p.height
                    return (
                      <Button
                        key={p.label}
                        type="button"
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const next = { ...config, pageWidth: p.width, pageHeight: p.height }
                          setConfig(next)
                          saveConfig(next)
                        }}
                      >
                        {p.label}
                      </Button>
                    )
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Genişlik (px)</Label>
                    <Input
                      type="number"
                      min={500}
                      max={10000}
                      step={10}
                      value={config.pageWidth ?? 2100}
                      onChange={(e) => {
                        const next = { ...config, pageWidth: Number(e.target.value) || 2100 }
                        setConfig(next)
                        saveConfig(next)
                      }}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">{((config.pageWidth ?? 2100) / 10).toFixed(0)} mm</p>
                  </div>
                  <div>
                    <Label className="text-xs">Yükseklik (px)</Label>
                    <Input
                      type="number"
                      min={500}
                      max={15000}
                      step={10}
                      value={config.pageHeight ?? 2970}
                      onChange={(e) => {
                        const next = { ...config, pageHeight: Number(e.target.value) || 2970 }
                        setConfig(next)
                        saveConfig(next)
                      }}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">{((config.pageHeight ?? 2970) / 10).toFixed(0)} mm</p>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Blok Ekle
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
        </div>
      }
      footerActions={
        <Button variant="outline" onClick={handleSamplePdf}>
          <FileText className="h-4 w-4 mr-2" />
          Örnek Teklif Çıktısı
        </Button>
      }
    >
      <div className="space-y-6">
        {loading ? (
          <p className="text-muted-foreground">Yükleniyor...</p>
        ) : config.blocks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Henüz blok eklenmedi. &quot;Blok Ekle&quot; butonundan blok seçin.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {config.blocks.map((block, index) => {
              const Icon = BLOCK_ICONS[block.type]
              const canMoveUp = index > 0
              const canMoveDown = index < config.blocks.length - 1
              return (
                <Card key={block.id} className={!block.visible ? 'opacity-60' : ''}>
                  <CardContent className="py-3 px-4">
                    {/* Başlık + sıra butonları + eylem butonları */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm leading-tight truncate">{BLOCK_TYPE_LABELS[block.type]}</p>
                          {!block.visible && (
                            <span className="text-xs text-muted-foreground">Gizli</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveBlockUp(block)} disabled={!canMoveUp} title="Yukarı taşı">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveBlockDown(block)} disabled={!canMoveDown} title="Aşağı taşı">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(block)} title="Düzenle">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteBlock(block)} title="Sil">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {/* Konum/boyut — textbox + spinner */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(block.type === 'line'
                        ? [
                            { field: 'x' as const, label: 'X', val: block.x ?? 20, step: 5, min: -210, max: 210 },
                            { field: 'y' as const, label: 'Y', val: block.y ?? 20, step: 5, min: -297, max: 297 },
                            {
                              field: 'lineLength' as const,
                              label: 'Uzunluk',
                              val: block.lineLength ?? 170,
                              step: 5,
                              min: 1,
                              max: 500,
                            },
                            {
                              field: 'lineThickness' as const,
                              label: 'Kalınlık',
                              val: block.lineThickness ?? 0.5,
                              step: 0.1,
                              min: 0.1,
                              max: 20,
                            },
                          ]
                        : (['x', 'y', 'width', 'height'] as const).map((field) => ({
                            field,
                            label: field.toUpperCase(),
                            val: block[field] ?? (field === 'x' || field === 'y' ? 20 : 80),
                            step: 5,
                            min: field === 'x' ? -210 : field === 'y' ? -297 : 1,
                            max: field === 'x' ? 210 : field === 'y' ? 297 : 210,
                          }))
                      ).map(({ field, label, val, step, min, max }) => (
                        <div key={field}>
                          <Label className="text-xs text-muted-foreground">{label}</Label>
                          <NumericInput
                            value={val}
                            onChange={(v) => updateBlockField(block, field, v)}
                            step={step}
                            min={min}
                            max={max}
                            className="mt-0.5 h-8"
                          />
                        </div>
                      ))}
                    </div>
                    {/* Alt bilgi */}
                    {(block.type === 'text' && block.text_content) || (block.type === 'footer' && block.footer_text) ? (
                      <p
                        className="mt-2 text-xs text-muted-foreground line-clamp-2 border-t pt-2"
                        style={block.type === 'text' ? { fontFamily: block.fontFamily || 'Roboto' } : undefined}
                      >
                        {block.type === 'text' ? block.text_content : block.footer_text}
                      </p>
                    ) : block.type === 'line' ? (
                      <p className="mt-2 text-xs text-muted-foreground border-t pt-2">
                        {block.lineOrientation === 'vertical' ? 'Dikey' : 'Yatay'} · {block.lineLength ?? 170}mm · {block.lineThickness ?? 0.5}mm kalınlık
                      </p>
                    ) : block.type === 'image' && block.image_key ? (
                      <p className="mt-2 text-xs text-muted-foreground truncate border-t pt-2">{block.image_key.split('/').pop()}</p>
                    ) : null}
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
