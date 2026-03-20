import { API_URL, parseJsonResponse } from '@/lib/api'

const TEKLIF_CIKTI_AYARLARI_CATEGORY = 'teklif_cikti_ayarlari'

/** Blok tipleri */
export type PdfBlockType =
  | 'company'
  | 'customer'
  | 'offer_header'
  | 'offer_items'
  | 'offer_notes'
  | 'footer'
  | 'image'
  | 'text'
  | 'qr_code'
  | 'line'

/** Tek bir PDF blok tanımı */
export type PdfBlock = {
  id: string
  type: PdfBlockType
  sortOrder: number
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontFamily?: string
  fontColor?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline'
  textAlign?: 'left' | 'center' | 'right'
  visible: boolean
  // company
  logo_url?: string
  logo_width?: number
  logo_height?: number
  company_name?: string
  company_address?: string
  company_phone?: string
  company_tax_office?: string
  // footer
  footer_text?: string
  // image (R2 assets)
  image_key?: string
  // text (serbest metin bloğu)
  text_content?: string
  // qr_code (QR kod - encode edilecek metin/URL)
  qr_content?: string
  // line (çizgi)
  lineOrientation?: 'horizontal' | 'vertical'
  lineLength?: number
  lineThickness?: number
  lineColor?: string
}

/** Sayfa boyutu preset'leri */
export const PAGE_PRESETS = [
  { label: 'A4 (210 × 297 mm)', width: 2100, height: 2970 },
  { label: 'A3 (297 × 420 mm)', width: 2970, height: 4200 },
  { label: 'Letter (216 × 279 mm)', width: 2160, height: 2790 },
  { label: 'Legal (216 × 356 mm)', width: 2160, height: 3560 },
] as const

/** Layout config - bloklar dizisi */
export type TeklifCiktiLayoutConfig = {
  blocks: PdfBlock[]
  /** Sayfa genişliği piksel (10px = 1mm). Varsayılan: 2100 = A4 210mm */
  pageWidth?: number
  /** Sayfa yüksekliği piksel (10px = 1mm). Varsayılan: 2970 = A4 297mm */
  pageHeight?: number
}

/** Blok tipi etiketleri */
export const BLOCK_TYPE_LABELS: Record<PdfBlockType, string> = {
  company: 'Firma Bilgileri',
  customer: 'Müşteri Bilgileri',
  offer_header: 'Teklif Üst Bilgileri',
  offer_items: 'Teklif Satırları',
  offer_notes: 'Teklif Notları',
  footer: 'Alt Antet Bilgileri',
  image: 'Görsel Bloğu',
  text: 'Yazı Bloğu',
  qr_code: 'QR Kod',
  line: 'Çizgi',
}

/** Google Fonts listesi - teklif çıktısında kullanılabilir yazı tipleri */
export const FONT_FAMILIES = [
  'Roboto',
  'Open Sans',
  'Inter',
  'Montserrat',
  'Poppins',
  'Lato',
  'Source Sans 3',
  'Raleway',
  'Ubuntu',
  'Nunito',
  'Work Sans',
  'DM Sans',
  'Merriweather',
  'Playfair Display',
  'Oswald',
  'PT Sans',
  'Roboto Condensed',
  'Roboto Mono',
  'Arimo',
  'Bebas Neue',
  'Barlow',
  'Barlow Condensed',
  'Fira Sans',
  'Libre Baskerville',
  'Libre Franklin',
  'Manrope',
  'Mukta',
  'Noto Sans',
  'Noto Serif',
  'Outfit',
  'Plus Jakarta Sans',
  'Quicksand',
  'Rajdhani',
  'Red Hat Display',
  'Rubik',
  'Sora',
  'Space Grotesk',
  'Titillium Web',
  'Urbanist',
  'Vollkorn',
  'Yanone Kaffeesatz',
  'Zilla Slab',
  'Crimson Text',
  'EB Garamond',
  'Inconsolata',
  'Josefin Sans',
  'Karla',
  'Lexend',
  'Lora',
  'Mulish',
  'Nunito Sans',
  'Oxygen',
  'Palanquin',
  'Prompt',
  'Public Sans',
  'Readex Pro',
  'Sarabun',
  'Sen',
  'Source Serif 4',
  'Spectral',
  'Syne',
  'Tinos',
  'Trirong',
  'Varela Round',
  'Abel',
  'Acme',
  'Almarai',
  'Archivo',
  'Asap',
  'Bitter',
  'Cabin',
  'Cairo',
  'Comfortaa',
  'Dancing Script',
  'Dosis',
  'Exo 2',
  'Figtree',
  'Hind',
  'IBM Plex Sans',
  'IBM Plex Serif',
  'Kanit',
  'Kreon',
  'Lilita One',
  'Martel',
  'Maven Pro',
  'Oleo Script',
  'Pacifico',
  'Permanent Marker',
  'Philosopher',
  'Raleway Dots',
  'Righteous',
  'Roboto Slab',
  'Satisfy',
  'Shadows Into Light',
  'Signika',
  'Staatliches',
  'Tajawal',
  'Ubuntu Condensed',
  'Unbounded',
  'Vollkorn SC',
]

/** Yeni blok varsayılan değerleri */
export function createDefaultBlock(type: PdfBlockType, sortOrder: number): PdfBlock {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const base = {
    id,
    type,
    sortOrder,
    x: 20,
    y: 20 + sortOrder * 60,
    width: 170,
    height: 40,
    fontSize: 11,
    fontFamily: 'Roboto',
    fontColor: '#000000',
    fontWeight: 'normal' as const,
    fontStyle: 'normal' as const,
    textDecoration: 'none' as const,
    textAlign: 'left' as const,
    visible: true,
  }
  switch (type) {
    case 'company':
      return { ...base, x: 20, y: 20, width: 85, height: 45, logo_width: 60, logo_height: 40 }
    case 'customer':
      return { ...base, x: 120, y: 20, width: 70, height: 55 }
    case 'offer_header':
      return { ...base, x: 20, y: 85, width: 170, height: 25, fontSize: 12 }
    case 'offer_items':
      return { ...base, x: 20, y: 120, width: 170, height: 80 }
    case 'offer_notes':
      return { ...base, x: 20, y: 210, width: 170, height: 40 }
    case 'footer':
      return { ...base, x: 20, y: 260, width: 170, height: 35, fontSize: 9 }
    case 'image':
      return { ...base, x: 20, y: 20, width: 60, height: 40 }
    case 'text':
      return { ...base, x: 20, y: 20, width: 170, height: 30, text_content: 'Serbest metin' }
    case 'qr_code':
      return { ...base, x: 20, y: 20, width: 40, height: 40, qr_content: 'https://example.com' }
    case 'line':
      return { ...base, x: 20, y: 20, width: 170, height: 0.5, lineOrientation: 'horizontal', lineLength: 170, lineThickness: 0.5, lineColor: '#000000' }
    default:
      return base as PdfBlock
  }
}

/** Eski formatı blocks dizisine çevir */
function migrateLegacyToBlocks(legacy: Record<string, unknown>): PdfBlock[] {
  const blocks: PdfBlock[] = []
  const map: Record<string, PdfBlockType> = {
    company_block: 'company',
    customer_block: 'customer',
    offer_header_block: 'offer_header',
    footer_block: 'footer',
  }
  let so = 0
  for (const [key, val] of Object.entries(legacy)) {
    const type = map[key]
    if (!type || !val || typeof val !== 'object') continue
    const v = val as Record<string, unknown>
    blocks.push({
      id: `migrated-${key}-${Date.now()}`,
      type,
      sortOrder: so++,
      x: (v.x as number) ?? 20,
      y: (v.y as number) ?? 20,
      width: (v.width as number) ?? 80,
      height: (v.height as number) ?? 40,
      fontSize: (v.fontSize as number) ?? 11,
      fontFamily: (v.fontFamily as string) || 'Arial',
      fontColor: (v.fontColor as string) || '#000000',
      fontWeight: (v.fontWeight as 'normal' | 'bold') || 'normal',
      fontStyle: (v.fontStyle as 'normal' | 'italic') || 'normal',
      textDecoration: (v.textDecoration as 'none' | 'underline') || 'none',
      textAlign: (v.textAlign as 'left' | 'center' | 'right') || 'left',
      visible: (v.visible as boolean) !== false,
      logo_url: v.logo_url as string | undefined,
      logo_width: v.logo_width as number | undefined,
      logo_height: v.logo_height as number | undefined,
      company_name: v.company_name as string | undefined,
      company_address: v.company_address as string | undefined,
      company_phone: v.company_phone as string | undefined,
      company_tax_office: v.company_tax_office as string | undefined,
      footer_text: v.footer_text as string | undefined,
    })
  }
  return blocks.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Varsayılan layout - boş (kullanıcı blok ekleyecek) */
export function getDefaultLayoutConfig(): TeklifCiktiLayoutConfig {
  return { blocks: [], pageWidth: 2100, pageHeight: 2970 }
}

export function parseLayoutConfig(json: string | undefined): TeklifCiktiLayoutConfig {
  if (!json?.trim()) return getDefaultLayoutConfig()
  try {
    const parsed = JSON.parse(json) as TeklifCiktiLayoutConfig | Record<string, unknown>
    if (parsed && Array.isArray((parsed as TeklifCiktiLayoutConfig).blocks)) {
      return parsed as TeklifCiktiLayoutConfig
    }
    return { blocks: migrateLegacyToBlocks(parsed as Record<string, unknown>) }
  } catch {
    return getDefaultLayoutConfig()
  }
}

/** app_settings'ten Teklif Çıktı Ayarları'nı çeker */
export async function fetchTeklifCiktiAyarlari(): Promise<TeklifCiktiLayoutConfig> {
  const res = await fetch(
    `${API_URL}/api/app-settings?category=${encodeURIComponent(TEKLIF_CIKTI_AYARLARI_CATEGORY)}`
  )
  const data = await parseJsonResponse<Record<string, string>>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `API hatası: ${res.status}`)
  }
  return parseLayoutConfig(data.layout_config)
}

/** Teklif Çıktı Ayarları'nı app_settings'e kaydeder */
export async function saveTeklifCiktiAyarlari(config: TeklifCiktiLayoutConfig): Promise<void> {
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: TEKLIF_CIKTI_AYARLARI_CATEGORY,
      settings: { layout_config: JSON.stringify(config) },
    }),
  })
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
  }
}
