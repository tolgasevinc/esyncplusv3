import { useState, useEffect, useCallback, useMemo } from 'react'
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
  ChevronLeft,
  ChevronRight,
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
  AlignJustify,
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
  createDefaultRow,
  createDefaultCell,
  flattenBlocksFromRows,
  BLOCK_TYPE_LABELS,
  FONT_FAMILIES,
  PAGE_PRESETS,
  type TeklifCiktiLayoutConfig,
  type PdfBlock,
  type PdfBlockType,
  type PdfLayoutRow,
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
const MULTIPLE_BLOCK_TYPES: PdfBlockType[] = ['text', 'qr_code', 'line', 'customer']

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
  const isCustomer = edited.type === 'customer'

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
                  <Button
                    type="button"
                    variant={edited.textAlign === 'justify' ? 'default' : 'outline'}
                    size="icon"
                    className={`h-10 w-10 shrink-0 ${edited.textAlign === 'justify' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    onClick={() => setEdited((b) => (b ? { ...b, textAlign: 'justify' as const } : b))}
                    title="İki yana yasla"
                  >
                    <AlignJustify className="h-4 w-4" />
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
                <Button
                  type="button"
                  variant={edited.textAlign === 'justify' ? 'default' : 'outline'}
                  size="icon"
                  className={`h-10 w-10 shrink-0 ${edited.textAlign === 'justify' ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  onClick={() => setEdited((b) => (b ? { ...b, textAlign: 'justify' as const } : b))}
                  title="İki yana yasla"
                >
                  <AlignJustify className="h-4 w-4" />
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
          {(isImage || isQrCode) && (
            <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
              <p className="text-xs text-muted-foreground">
                Konum ve satır düzeni listeden yönetilir. İsteğe bağlı maksimum boyut (0 = sınır yok).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Maks. genişlik (mm)</Label>
                  <NumericInput
                    value={edited.width ?? 0}
                    min={0}
                    max={210}
                    onChange={(v) =>
                      setEdited((b) => (b ? { ...b, width: v <= 0 ? undefined : v } : b))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Maks. yükseklik (mm)</Label>
                  <NumericInput
                    value={edited.height ?? 0}
                    min={0}
                    max={297}
                    onChange={(v) =>
                      setEdited((b) => (b ? { ...b, height: v <= 0 ? undefined : v } : b))
                    }
                  />
                </div>
              </div>
            </div>
          )}
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
          {isCustomer && (
            <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
              <div>
                <Label className="text-sm font-medium">PDF&apos;te gösterilecek bilgiler</Label>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Metinler teklif formundaki müşteri çıktı alanlarından gelir. Yazı tipi, boyut ve hizalama yukarıdaki
                  ayarlarla belirlenir; burada yalnızca hangi satırların çıkacağını seçin.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['customer_show_title', 'Müşteri / firma unvanı'] as const,
                    ['customer_show_authorized', 'Yetkili'] as const,
                    ['customer_show_phone', 'Telefon'] as const,
                    ['customer_show_email', 'E-posta'] as const,
                    ['customer_show_tax_office', 'Vergi dairesi'] as const,
                    ['customer_show_tax_no', 'Vergi no'] as const,
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3 rounded-md border bg-background/80 px-3 py-2">
                    <Label htmlFor={`cust-${key}`} className="text-xs font-normal cursor-pointer">
                      {label}
                    </Label>
                    <Switch
                      id={`cust-${key}`}
                      checked={edited[key] !== false}
                      onCheckedChange={(v) =>
                        setEdited((b) => (b ? { ...b, [key]: v } : b))
                      }
                    />
                  </div>
                ))}
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
              <p className="text-xs text-muted-foreground">
                Bu alanlar teklifi düzenleyen (çıkaran) firmanıza aittir; müşteri bilgileri ayrı bloktadır.
              </p>
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
              <div>
                <Label className="text-xs">Telefon</Label>
                <Input
                  placeholder="0212..."
                  value={edited.company_phone ?? ''}
                  onChange={(e) => setEdited((b) => (b ? { ...b, company_phone: e.target.value || undefined } : b))}
                />
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
  const [editTarget, setEditTarget] = useState<{ rowId: string; cellId: string } | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    rowId: string
    cellId: string
    blockType: PdfBlockType
  } | null>(null)
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null)

  const editBlock = useMemo(() => {
    if (!editTarget) return null
    const row = config.rows.find((r) => r.id === editTarget.rowId)
    const cell = row?.cells.find((c) => c.id === editTarget.cellId)
    return cell?.block ?? null
  }, [editTarget, config.rows])

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

  const reindexRows = (rows: PdfLayoutRow[]): PdfLayoutRow[] =>
    rows.map((r, i) => ({ ...r, sortOrder: i }))

  const usedTypes = useMemo(() => new Set(flattenBlocksFromRows(config.rows).map((b) => b.type)), [config.rows])

  /** Tek hücreli yeni satır (üst menü) */
  const addRowWithBlock = (type: PdfBlockType) => {
    setConfig((prev) => {
      const block = createDefaultBlock(type)
      const row = createDefaultRow(block, prev.rows.length, prev.rows.length === 0 ? 12 : 8)
      const next = { ...prev, rows: reindexRows([...prev.rows, row]) }
      saveConfig(next)
      return next
    })
  }

  const addEmptyRow = () => {
    setConfig((prev) => {
      const block = createDefaultBlock('text')
      const row = createDefaultRow(block, prev.rows.length, prev.rows.length === 0 ? 12 : 8)
      const next = { ...prev, rows: reindexRows([...prev.rows, row]) }
      saveConfig(next)
      return next
    })
  }

  const addBlockToRow = (rowId: string, type: PdfBlockType) => {
    setConfig((prev) => {
      const row = prev.rows.find((r) => r.id === rowId)
      if (!row) return prev
      const sumOthers = row.cells.reduce((s, c) => s + c.widthPercent, 0)
      const room = 100 - sumOthers
      if (room < 1) {
        toastError(
          'Satır dolu',
          'Satır yüzde toplamı 100. Yeni blok için önce bir hücrenin genişliğini azaltın.'
        )
        return prev
      }
      const nw = Math.min(50, Math.max(1, room))
      const next = {
        ...prev,
        rows: prev.rows.map((r) => {
          if (r.id !== rowId) return r
          const merged = [
            ...r.cells.map((c, i) => ({ ...c, sortOrder: i })),
            createDefaultCell(createDefaultBlock(type), nw, r.cells.length),
          ]
          return { ...r, cells: merged }
        }),
      }
      saveConfig(next)
      return next
    })
  }

  const updateBlockInCell = (updated: PdfBlock) => {
    if (!editTarget) return
    const { rowId, cellId } = editTarget
    setConfig((prev) => {
      const next = {
        ...prev,
        rows: prev.rows.map((r) => {
          if (r.id !== rowId) return r
          return {
            ...r,
            cells: r.cells.map((c) => (c.id === cellId ? { ...c, block: updated } : c)),
          }
        }),
      }
      saveConfig(next)
      return next
    })
    setEditTarget(null)
  }

  const removeCell = (rowId: string, cellId: string) => {
    setConfig((prev) => {
      const nextRows = reindexRows(
        prev.rows
          .map((r) => {
            if (r.id !== rowId) return r
            const cells = r.cells
              .filter((c) => c.id !== cellId)
              .map((c, i) => ({ ...c, sortOrder: i }))
            return { ...r, cells }
          })
          .filter((r) => r.cells.length > 0)
      )
      const next = { ...prev, rows: nextRows }
      saveConfig(next)
      return next
    })
    setDeleteTarget(null)
  }

  const removeRow = (rowId: string) => {
    setConfig((prev) => {
      const next = { ...prev, rows: reindexRows(prev.rows.filter((r) => r.id !== rowId)) }
      saveConfig(next)
      return next
    })
    setDeleteRowId(null)
  }

  const updateRowMargin = (rowId: string, marginTopMm: number) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        rows: prev.rows.map((r) => (r.id === rowId ? { ...r, marginTopMm: Math.max(0, marginTopMm) } : r)),
      }
      saveConfig(next)
      return next
    })
  }

  const updateCellWidthPercent = (rowId: string, cellId: string, raw: number) => {
    setConfig((prev) => {
      let v = Math.round(Number(raw))
      if (!Number.isFinite(v)) v = 50
      v = Math.max(1, Math.min(100, v))
      const next = {
        ...prev,
        rows: prev.rows.map((r) => {
          if (r.id !== rowId) return r
          const othersSum = r.cells.filter((c) => c.id !== cellId).reduce((s, c) => s + c.widthPercent, 0)
          const cap = 100 - othersSum
          if (cap < 1) {
            toastError('Yüzde kalmadı', 'Önce diğer hücrelerin genişliğini azaltın.')
            return r
          }
          const clamped = Math.min(v, cap)
          return {
            ...r,
            cells: r.cells.map((c) => (c.id === cellId ? { ...c, widthPercent: Math.max(1, clamped) } : c)),
          }
        }),
      }
      saveConfig(next)
      return next
    })
  }

  const moveRowUp = (rowId: string) => {
    setConfig((prev) => {
      const rows = [...prev.rows].sort((a, b) => a.sortOrder - b.sortOrder)
      const i = rows.findIndex((r) => r.id === rowId)
      if (i <= 0) return prev
      ;[rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]
      const next = { ...prev, rows: reindexRows(rows) }
      saveConfig(next)
      return next
    })
  }

  const moveRowDown = (rowId: string) => {
    setConfig((prev) => {
      const rows = [...prev.rows].sort((a, b) => a.sortOrder - b.sortOrder)
      const i = rows.findIndex((r) => r.id === rowId)
      if (i < 0 || i >= rows.length - 1) return prev
      ;[rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]
      const next = { ...prev, rows: reindexRows(rows) }
      saveConfig(next)
      return next
    })
  }

  const moveCellLeft = (rowId: string, cellId: string) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        rows: prev.rows.map((r) => {
          if (r.id !== rowId) return r
          const cells = [...r.cells].sort((a, b) => a.sortOrder - b.sortOrder)
          const idx = cells.findIndex((c) => c.id === cellId)
          if (idx <= 0) return r
          const copy = [...cells]
          ;[copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]]
          return {
            ...r,
            cells: copy.map((c, i) => ({ ...c, sortOrder: i })),
          }
        }),
      }
      saveConfig(next)
      return next
    })
  }

  const moveCellRight = (rowId: string, cellId: string) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        rows: prev.rows.map((r) => {
          if (r.id !== rowId) return r
          const cells = [...r.cells].sort((a, b) => a.sortOrder - b.sortOrder)
          const idx = cells.findIndex((c) => c.id === cellId)
          if (idx < 0 || idx >= cells.length - 1) return r
          const copy = [...cells]
          ;[copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]]
          return {
            ...r,
            cells: copy.map((c, i) => ({ ...c, sortOrder: i })),
          }
        }),
      }
      saveConfig(next)
      return next
    })
  }

  const openEdit = (rowId: string, cellId: string) => {
    setEditTarget({ rowId, cellId })
    setEditOpen(true)
  }

  const sortedRows = useMemo(
    () => [...config.rows].sort((a, b) => a.sortOrder - b.sortOrder),
    [config.rows]
  )

  const blockTypeMenuItems = (onPick: (type: PdfBlockType) => void) =>
    (Object.keys(BLOCK_TYPE_LABELS) as PdfBlockType[]).map((type) => {
      const canAddMultiple = MULTIPLE_BLOCK_TYPES.includes(type)
      const isDisabled = !canAddMultiple && usedTypes.has(type)
      return (
        <DropdownMenuItem
          key={type}
          onClick={() => !isDisabled && onPick(type)}
          disabled={isDisabled}
          className={isDisabled ? 'opacity-60' : ''}
        >
          {BLOCK_TYPE_LABELS[type]}
          {isDisabled && <span className="ml-2 text-xs text-muted-foreground">(eklendi)</span>}
        </DropdownMenuItem>
      )
    })

  return (
    <PageLayout
      title="Teklif Çıktı Ayarları"
      description="Satır ekleyin; her satırda yan yana bloklar 12 kolon üzerinden (1–12 birim) paylaşılır. Satır yüksekliği PDF’de içeriğe göre belirlenir."
      backTo="/parametreler"
      headerActions={
        <div className="flex items-center gap-2 flex-wrap">
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
          <Button type="button" variant="outline" onClick={addEmptyRow}>
            <Plus className="h-4 w-4 mr-2" />
            Satır ekle
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Yeni satır (blok seç)
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{blockTypeMenuItems((type) => addRowWithBlock(type))}</DropdownMenuContent>
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
        ) : config.rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground space-y-2">
              <p>Henüz satır yok.</p>
              <p className="text-sm">&quot;Satır ekle&quot; veya &quot;Yeni satır (blok seç)&quot; ile başlayın.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sortedRows.map((row, rowIndex) => {
              const cells = [...row.cells].sort((a, b) => a.sortOrder - b.sortOrder)
              return (
                <Card key={row.id}>
                  <CardContent className="py-4 px-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">Satır {rowIndex + 1}</span>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground whitespace-nowrap">Üst boşluk (mm)</Label>
                          <NumericInput
                            value={row.marginTopMm}
                            min={0}
                            max={80}
                            step={1}
                            onChange={(v) => updateRowMargin(row.id, v)}
                            className="h-8 w-[7rem]"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveRowUp(row.id)}
                          disabled={rowIndex === 0}
                          title="Satırı yukarı"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => moveRowDown(row.id)}
                          disabled={rowIndex >= sortedRows.length - 1}
                          title="Satırı aşağı"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteRowId(row.id)}
                          title="Satırı sil"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 ml-1">
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Bloğu ekle
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {blockTypeMenuItems((type) => addBlockToRow(row.id, type))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div
                      className="flex flex-wrap gap-2 items-stretch rounded-lg border border-dashed border-muted-foreground/25 p-2 bg-muted/20"
                      style={{ minHeight: '4.5rem' }}
                    >
                      {cells.map((cell, ci) => {
                        const b = cell.block
                        const Icon = BLOCK_ICONS[b.type]
                        return (
                          <div
                            key={cell.id}
                            className="flex flex-col min-w-0 flex-1 basis-0 rounded-md border bg-background p-2"
                          >
                            <div className="flex items-start justify-between gap-1 mb-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Icon className="h-4 w-4 shrink-0 text-primary" />
                                <span className="text-xs font-medium truncate">{BLOCK_TYPE_LABELS[b.type]}</span>
                                {!b.visible && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">Gizli</span>
                                )}
                              </div>
                              <div className="flex shrink-0 gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={ci === 0}
                                  onClick={() => moveCellLeft(row.id, cell.id)}
                                  title="Sola"
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={ci >= cells.length - 1}
                                  onClick={() => moveCellRight(row.id, cell.id)}
                                  title="Sağa"
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEdit(row.id, cell.id)}
                                  title="Düzenle"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() =>
                                    setDeleteTarget({ rowId: row.id, cellId: cell.id, blockType: b.type })
                                  }
                                  title="Bloğu sil"
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-auto">
                              <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Genişlik (%)</Label>
                              <NumericInput
                                value={cell.widthPercent}
                                min={1}
                                max={Math.max(
                                  1,
                                  100 -
                                    cells.filter((x) => x.id !== cell.id).reduce((s, x) => s + x.widthPercent, 0)
                                )}
                                step={1}
                                onChange={(v) => updateCellWidthPercent(row.id, cell.id, v)}
                                className="h-8 flex-1"
                              />
                            </div>
                            {b.type === 'text' && b.text_content ? (
                              <p
                                className="mt-1 text-[10px] text-muted-foreground line-clamp-2 border-t pt-1"
                                style={{ fontFamily: b.fontFamily || 'Roboto' }}
                              >
                                {b.text_content}
                              </p>
                            ) : b.type === 'line' ? (
                              <p className="mt-1 text-[10px] text-muted-foreground border-t pt-1">
                                {b.lineOrientation === 'vertical' ? 'Dikey çizgi' : 'Yatay çizgi'}
                              </p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5 px-0.5">
                      Satır yüzde toplamı: {cells.reduce((s, c) => s + c.widthPercent, 0)}
                      /100 — PDF’de satır genişliği bu toplama göre oransal bölünür
                    </p>
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
        onOpenChange={(o) => {
          setEditOpen(o)
          if (!o) setEditTarget(null)
        }}
        onSave={updateBlockInCell}
      />

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Bloğu sil"
        description={
          deleteTarget
            ? `"${BLOCK_TYPE_LABELS[deleteTarget.blockType]}" hücresini bu satırdan kaldırmak istediğinize emin misiniz?`
            : ''
        }
        onConfirm={() => {
          if (deleteTarget) removeCell(deleteTarget.rowId, deleteTarget.cellId)
        }}
      />

      <ConfirmDeleteDialog
        open={!!deleteRowId}
        onOpenChange={(o) => !o && setDeleteRowId(null)}
        title="Satırı sil"
        description="Bu satırdaki tüm bloklar kaldırılacak. Emin misiniz?"
        onConfirm={() => {
          if (deleteRowId) removeRow(deleteRowId)
        }}
      />
    </PageLayout>
  )
}
