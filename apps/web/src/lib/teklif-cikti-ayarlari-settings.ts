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

/** Tek bir PDF içerik bloğu (konum yok; genişlik satır hücresinde %) */
export type PdfBlock = {
  id: string
  type: PdfBlockType
  fontSize: number
  fontFamily?: string
  fontColor?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline'
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  visible: boolean
  /** @deprecated Eski düz blok listesi */
  sortOrder?: number
  x?: number
  y?: number
  width?: number
  height?: number
  logo_url?: string
  logo_width?: number
  logo_height?: number
  company_name?: string
  company_address?: string
  company_phone?: string
  /** Eski kayıtlarda kalabilir; teklif PDF’inde basılmaz */
  company_tax_office?: string
  company_tax_no?: string
  footer_text?: string
  image_key?: string
  text_content?: string
  qr_content?: string
  lineOrientation?: 'horizontal' | 'vertical'
  lineLength?: number
  lineThickness?: number
  lineColor?: string
  /** Müşteri bloğu: PDF’te gösterilsin mi (false = gizle). Tanımsız = göster. */
  customer_show_title?: boolean
  customer_show_authorized?: boolean
  customer_show_phone?: boolean
  customer_show_email?: boolean
  customer_show_tax_office?: boolean
  customer_show_tax_no?: boolean
}

/** Satır içi hücre: genişlik yüzdesi (1–100); satır toplamı en fazla 100 */
export type PdfLayoutCell = {
  id: string
  sortOrder: number
  /** 1–100; diğer hücreleri değiştirmeden düzenlenir, satır toplamı 100’ü aşamaz */
  widthPercent: number
  block: PdfBlock
}

/** Satır: üst boşluk + yatayda yan yana hücreler */
export type PdfLayoutRow = {
  id: string
  sortOrder: number
  /** Önceki satırdan sonra boşluk (mm). İlk satır: sayfa içeriğinin üst boşluğu */
  marginTopMm: number
  cells: PdfLayoutCell[]
}

/** Sayfa boyutu preset'leri */
export const PAGE_PRESETS = [
  { label: 'A4 (210 × 297 mm)', width: 2100, height: 2970 },
  { label: 'A3 (297 × 420 mm)', width: 2970, height: 4200 },
  { label: 'Letter (216 × 279 mm)', width: 2160, height: 2790 },
  { label: 'Legal (216 × 356 mm)', width: 2160, height: 3560 },
] as const

/** Layout: satırlar dizisi */
export type TeklifCiktiLayoutConfig = {
  rows: PdfLayoutRow[]
  pageWidth?: number
  pageHeight?: number
  /** @deprecated Yüklemede satırlara dönüştürülür */
  blocks?: PdfBlock[]
}

/** Blok tipi etiketleri */
export const BLOCK_TYPE_LABELS: Record<PdfBlockType, string> = {
  company: 'Teklif veren firma',
  customer: 'Müşteri (teklifteki firma)',
  offer_header: 'Teklif Üst Bilgileri',
  offer_items: 'Teklif Satırları',
  offer_notes: 'Teklif Notları',
  footer: 'Alt Antet Bilgileri',
  image: 'Görsel Bloğu',
  text: 'Yazı Bloğu',
  qr_code: 'QR Kod',
  line: 'Çizgi',
}

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

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** PDF müşteri satırı gösterilsin mi; false/0/"false" kapalı, aksi (undefined dahil) açık */
export function parseCustomerShowField(v: unknown): boolean {
  if (v === false || v === 0) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false
  }
  return true
}

function normalizeCustomerBlockShowFlags(block: PdfBlock): PdfBlock {
  if (block.type !== 'customer') return block
  return {
    ...block,
    customer_show_title: parseCustomerShowField(block.customer_show_title),
    customer_show_authorized: parseCustomerShowField(block.customer_show_authorized),
    customer_show_phone: parseCustomerShowField(block.customer_show_phone),
    customer_show_email: parseCustomerShowField(block.customer_show_email),
    customer_show_tax_office: parseCustomerShowField(block.customer_show_tax_office),
    customer_show_tax_no: parseCustomerShowField(block.customer_show_tax_no),
  }
}

/** Kayıtta customer_show_* her zaman açık boolean olsun (false değerleri JSON'dan düşmesin) */
export function ensureCustomerPdfShowFlagsInLayout(config: TeklifCiktiLayoutConfig): TeklifCiktiLayoutConfig {
  return {
    ...config,
    rows: config.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        block: normalizeCustomerBlockShowFlags(cell.block),
      })),
    })),
  }
}

function numOrRaw(c: Record<string, unknown>, key: string, d: number): number {
  const v = Number(c[key])
  return Number.isFinite(v) ? v : d
}

export function clampCellWidthPercent(w: number): number {
  return Math.max(1, Math.min(100, Math.round(Number(w) || 1)))
}

/** Ağırlıklara göre 1–100 tam yüzdeler, toplamı tam 100 (sadece bozuk / >100 kayıtlar için) */
function redistributePercentsToSum100(weights: number[]): number[] {
  const n = weights.length
  if (n === 0) return []
  if (n === 1) return [100]
  const w = weights.map((x) => Math.max(1e-6, x))
  const W = w.reduce((a, b) => a + b, 0)
  const ideal = w.map((x) => (x / W) * 100)
  const ints = ideal.map((x) => Math.max(1, Math.floor(x)))
  let rem = 100 - ints.reduce((a, b) => a + b, 0)
  const byFrac = ideal.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r)
  let t = 0
  while (rem > 0 && t < 200) {
    ints[byFrac[t % n].i]++
    rem--
    t++
  }
  return ints
}

function rowPercentsFromColSpans(spans: number[]): number[] {
  const sumS = spans.reduce((a, b) => a + b, 0) || 1
  const raw = spans.map((s) => Math.max(1, Math.round((100 * s) / sumS)))
  let drift = 100 - raw.reduce((a, b) => a + b, 0)
  const out = [...raw]
  out[out.length - 1] = clampCellWidthPercent(out[out.length - 1] + drift)
  return out
}

function normalizeBlock(b: Record<string, unknown>): PdfBlock {
  const type = (b.type as string) || 'text'
  const t = type as PdfBlockType
  const customerFlags =
    t === 'customer'
      ? {
          customer_show_title: parseCustomerShowField(b.customer_show_title),
          customer_show_authorized: parseCustomerShowField(b.customer_show_authorized),
          customer_show_phone: parseCustomerShowField(b.customer_show_phone),
          customer_show_email: parseCustomerShowField(b.customer_show_email),
          customer_show_tax_office: parseCustomerShowField(b.customer_show_tax_office),
          customer_show_tax_no: parseCustomerShowField(b.customer_show_tax_no),
        }
      : {
          customer_show_title: b.customer_show_title as boolean | undefined,
          customer_show_authorized: b.customer_show_authorized as boolean | undefined,
          customer_show_phone: b.customer_show_phone as boolean | undefined,
          customer_show_email: b.customer_show_email as boolean | undefined,
          customer_show_tax_office: b.customer_show_tax_office as boolean | undefined,
          customer_show_tax_no: b.customer_show_tax_no as boolean | undefined,
        }
  return {
    id: (b.id as string) || newId('block'),
    type: t,
    fontSize: (b.fontSize as number) ?? 11,
    fontFamily: (b.fontFamily as string) || 'Roboto',
    fontColor: (b.fontColor as string) || '#000000',
    fontWeight: (b.fontWeight as 'normal' | 'bold') || 'normal',
    fontStyle: (b.fontStyle as 'normal' | 'italic') || 'normal',
    textDecoration: (b.textDecoration as 'none' | 'underline') || 'none',
    textAlign: (b.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
    visible: (b.visible as boolean) !== false,
    sortOrder: b.sortOrder as number | undefined,
    x: b.x as number | undefined,
    y: b.y as number | undefined,
    width: b.width as number | undefined,
    height: b.height as number | undefined,
    logo_url: b.logo_url as string | undefined,
    logo_width: b.logo_width as number | undefined,
    logo_height: b.logo_height as number | undefined,
    company_name: b.company_name as string | undefined,
    company_address: b.company_address as string | undefined,
    company_phone: b.company_phone as string | undefined,
    company_tax_office: b.company_tax_office as string | undefined,
    company_tax_no: b.company_tax_no as string | undefined,
    footer_text: b.footer_text as string | undefined,
    image_key: b.image_key as string | undefined,
    text_content: b.text_content as string | undefined,
    qr_content: b.qr_content as string | undefined,
    lineOrientation: (b.lineOrientation as 'horizontal' | 'vertical') || 'horizontal',
    lineLength: (b.lineLength as number) ?? 170,
    lineThickness: (b.lineThickness as number) ?? 0.5,
    lineColor: (b.lineColor as string) || '#000000',
    ...customerFlags,
  }
}

function normalizeRow(r: Record<string, unknown>): PdfLayoutRow {
  const cellsRaw = ((r.cells as unknown[]) || []).filter(Boolean) as Record<string, unknown>[]
  const sortedRaw = [...cellsRaw].sort((a, b) => numOrRaw(a, 'sortOrder', 0) - numOrRaw(b, 'sortOrder', 0))

  const useColMigrate =
    sortedRaw.length > 0 &&
    sortedRaw.every((c) => {
      const wp = Number(c.widthPercent)
      if (Number.isFinite(wp) && wp > 0) return false
      const cs = Number(c.colSpan)
      return Number.isFinite(cs) && cs >= 1 && cs <= 12
    })

  let cells: PdfLayoutCell[]
  if (useColMigrate) {
    const spans = sortedRaw.map((c) => {
      const cs = Number(c.colSpan)
      return Number.isFinite(cs) && cs >= 1 && cs <= 12 ? cs : 12
    })
    const wps = rowPercentsFromColSpans(spans)
    cells = sortedRaw.map((c, i) => {
      const blockRaw = c.block as Record<string, unknown> | undefined
      return {
        id: (c.id as string) || newId('cell'),
        sortOrder: i,
        widthPercent: clampCellWidthPercent(wps[i] ?? 100),
        block: blockRaw ? normalizeBlock(blockRaw) : normalizeBlock({ type: 'text', id: newId('block') }),
      }
    })
  } else {
    const n = sortedRaw.length
    cells = sortedRaw.map((c, i) => {
      const blockRaw = c.block as Record<string, unknown> | undefined
      const wp = Number(c.widthPercent)
      let w = Number.isFinite(wp) && wp > 0 ? Math.round(wp) : n === 1 ? 100 : Math.max(1, Math.round(100 / n))
      return {
        id: (c.id as string) || newId('cell'),
        sortOrder: i,
        widthPercent: clampCellWidthPercent(w),
        block: blockRaw ? normalizeBlock(blockRaw) : normalizeBlock({ type: 'text', id: newId('block') }),
      }
    })
    const sumW = cells.reduce((s, c) => s + c.widthPercent, 0)
    if (sumW > 100) {
      const next = redistributePercentsToSum100(cells.map((c) => c.widthPercent))
      cells = cells.map((c, i) => ({ ...c, widthPercent: clampCellWidthPercent(next[i] ?? c.widthPercent) }))
    }
  }

  return {
    id: (r.id as string) || newId('row'),
    sortOrder: (r.sortOrder as number) ?? 0,
    marginTopMm: Math.max(0, Number(r.marginTopMm) ?? 0),
    cells,
  }
}

/** Eski düz blok listesini satırlara çevir (her blok = tek satır %100) */
export function migrateBlocksToRows(blocks: PdfBlock[]): PdfLayoutRow[] {
  const sorted = [...blocks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  return sorted.map((b, i) => ({
    id: newId(`row-${b.id}`),
    sortOrder: i,
    marginTopMm: i === 0 ? Math.max(0, b.y ?? 0) : Math.max(0, b.height ?? 8),
    cells: [
      {
        id: newId(`cell-${b.id}`),
        sortOrder: 0,
        widthPercent: 100,
        block: { ...b },
      },
    ],
  }))
}

function migrateLegacyObjectToBlocks(legacy: Record<string, unknown>): PdfBlock[] {
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
    blocks.push(
      normalizeBlock({
        ...v,
        id: `migrated-${key}`,
        type,
        sortOrder: so++,
      })
    )
  }
  return blocks.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

export function createDefaultBlock(type: PdfBlockType): PdfBlock {
  const id = newId('block')
  const base: PdfBlock = {
    id,
    type,
    fontSize: 11,
    fontFamily: 'Roboto',
    fontColor: '#000000',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'left',
    visible: true,
  }
  switch (type) {
    case 'company':
      return { ...base, logo_width: 60, logo_height: 40, fontSize: 11 }
    case 'customer':
      return {
        ...base,
        fontSize: 11,
        customer_show_title: true,
        customer_show_authorized: true,
        customer_show_phone: true,
        customer_show_email: true,
        customer_show_tax_office: true,
        customer_show_tax_no: true,
      }
    case 'offer_header':
      return { ...base, fontSize: 12 }
    case 'offer_items':
      return { ...base, fontSize: 11 }
    case 'offer_notes':
      return { ...base, fontSize: 11 }
    case 'footer':
      return { ...base, fontSize: 9 }
    case 'image':
      return { ...base }
    case 'text':
      return { ...base, text_content: 'Serbest metin' }
    case 'qr_code':
      return { ...base, qr_content: 'https://example.com' }
    case 'line':
      return {
        ...base,
        lineOrientation: 'horizontal',
        lineLength: 170,
        lineThickness: 0.5,
        lineColor: '#000000',
      }
    default:
      return base
  }
}

export function createDefaultCell(block: PdfBlock, widthPercent = 100, sortOrder = 0): PdfLayoutCell {
  return {
    id: newId('cell'),
    sortOrder,
    widthPercent: clampCellWidthPercent(widthPercent),
    block,
  }
}

export function createDefaultRow(block: PdfBlock, sortOrder = 0, marginTopMm = 8): PdfLayoutRow {
  return {
    id: newId('row'),
    sortOrder,
    marginTopMm,
    cells: [createDefaultCell(block, 100, 0)],
  }
}

export function getDefaultLayoutConfig(): TeklifCiktiLayoutConfig {
  return { rows: [], pageWidth: 2100, pageHeight: 2970 }
}

export function parseLayoutConfig(json: string | undefined): TeklifCiktiLayoutConfig {
  if (!json?.trim()) return getDefaultLayoutConfig()
  try {
    const parsed = JSON.parse(json) as Record<string, unknown> & {
      rows?: unknown[]
      blocks?: unknown[]
      pageWidth?: unknown
      pageHeight?: unknown
    }
    const pageWidth = Number(parsed.pageWidth) || 2100
    const pageHeight = Number(parsed.pageHeight) || 2970
    if (parsed && Array.isArray(parsed.rows)) {
      const rows = (parsed.rows as unknown[]).filter(Boolean).map((r) => normalizeRow(r as Record<string, unknown>))
      const sorted = rows.sort((a, b) => a.sortOrder - b.sortOrder).map((row, i) => ({ ...row, sortOrder: i }))
      return { rows: sorted, pageWidth, pageHeight }
    }
    if (parsed && Array.isArray(parsed.blocks)) {
      const blocks = (parsed.blocks as unknown[]).filter(Boolean).map((b) => normalizeBlock(b as Record<string, unknown>))
      return { rows: migrateBlocksToRows(blocks), pageWidth, pageHeight }
    }
    const legacyBlocks = migrateLegacyObjectToBlocks(parsed)
    if (legacyBlocks.length > 0) {
      const withItems = [...legacyBlocks]
      if (!withItems.some((b) => b.type === 'offer_items')) {
        withItems.push(createDefaultBlock('offer_items'))
      }
      if (!withItems.some((b) => b.type === 'offer_notes')) {
        withItems.push(createDefaultBlock('offer_notes'))
      }
      return { rows: migrateBlocksToRows(withItems), pageWidth, pageHeight }
    }
    return { rows: [], pageWidth, pageHeight }
  } catch {
    return getDefaultLayoutConfig()
  }
}

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

export async function saveTeklifCiktiAyarlari(config: TeklifCiktiLayoutConfig): Promise<void> {
  const toStore = ensureCustomerPdfShowFlagsInLayout(config)
  const res = await fetch(`${API_URL}/api/app-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category: TEKLIF_CIKTI_AYARLARI_CATEGORY,
      settings: { layout_config: JSON.stringify(toStore) },
    }),
  })
  const data = await parseJsonResponse<unknown>(res)
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Kaydedilemedi')
  }
}

/** Tüm satırlardaki blokları düz liste (tekil tip kontrolü vb.) */
export function flattenBlocksFromRows(rows: PdfLayoutRow[]): PdfBlock[] {
  return rows
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((r) =>
      r.cells
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.block)
    )
}

/** PDF müşteri bloğunda açık alanlar (birden fazla müşteri bloğunda biri açıksa formda gösterilir) */
export type CustomerPdfOutputFlags = {
  showTitle: boolean
  showAuthorized: boolean
  showPhone: boolean
  showEmail: boolean
  showTaxOffice: boolean
  showTaxNo: boolean
}

export function defaultCustomerPdfOutputFlags(): CustomerPdfOutputFlags {
  return {
    showTitle: true,
    showAuthorized: true,
    showPhone: true,
    showEmail: true,
    showTaxOffice: true,
    showTaxNo: true,
  }
}

export function customerPdfOutputFlagsFromLayout(rows: PdfLayoutRow[]): CustomerPdfOutputFlags {
  const blocks = flattenBlocksFromRows(rows).filter((b) => b.type === 'customer')
  if (blocks.length === 0) return defaultCustomerPdfOutputFlags()
  return {
    showTitle: blocks.some((b) => parseCustomerShowField(b.customer_show_title)),
    showAuthorized: blocks.some((b) => parseCustomerShowField(b.customer_show_authorized)),
    showPhone: blocks.some((b) => parseCustomerShowField(b.customer_show_phone)),
    showEmail: blocks.some((b) => parseCustomerShowField(b.customer_show_email)),
    showTaxOffice: blocks.some((b) => parseCustomerShowField(b.customer_show_tax_office)),
    showTaxNo: blocks.some((b) => parseCustomerShowField(b.customer_show_tax_no)),
  }
}
