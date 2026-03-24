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
  textAlign?: 'left' | 'center' | 'right'
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
  company_tax_office?: string
  /** Teklif düzenleyen firma — vergi numarası */
  company_tax_no?: string
  footer_text?: string
  image_key?: string
  text_content?: string
  qr_content?: string
  lineOrientation?: 'horizontal' | 'vertical'
  lineLength?: number
  lineThickness?: number
  lineColor?: string
}

/** Satır içi hücre: yüzde genişlik + blok */
export type PdfLayoutCell = {
  id: string
  sortOrder: number
  /** Satır içinde yüzde (satırdaki hücrelerin toplamı 100 olacak şekilde normalize edilir) */
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

/** Hücre genişliklerini 100'e normalize et */
export function normalizeRowCellWidths(cells: PdfLayoutCell[]): PdfLayoutCell[] {
  if (cells.length === 0) return cells
  const sorted = [...cells].sort((a, b) => a.sortOrder - b.sortOrder)
  const sum = sorted.reduce((s, c) => s + Math.max(0, c.widthPercent || 0), 0)
  if (sum <= 0) {
    const eq = 100 / sorted.length
    return sorted.map((c) => ({ ...c, widthPercent: eq }))
  }
  if (Math.abs(sum - 100) > 0.001) {
    return sorted.map((c) => ({ ...c, widthPercent: (Math.max(0, c.widthPercent || 0) / sum) * 100 }))
  }
  return sorted
}

/**
 * Bir hücrenin yüzdesini kullanıcı değerine ayarlar; kalan %100 payı diğer hücreler
 * önceki genişlik oranlarına göre paylaşır (düzenlenen hücrenin girdiği değer korunur).
 */
export function redistributeWidthsAfterCellEdit(
  cells: PdfLayoutCell[],
  editedCellId: string,
  newPercentForEdited: number
): PdfLayoutCell[] {
  const round4 = (x: number) => Math.round(x * 10000) / 10000
  if (cells.length === 0) return cells
  const sorted = [...cells].sort((a, b) => a.sortOrder - b.sortOrder)
  if (sorted.length === 1) {
    return [{ ...sorted[0], widthPercent: 100, sortOrder: 0 }]
  }

  const p = round4(Math.max(0, Math.min(100, newPercentForEdited)))
  const others = sorted.filter((c) => c.id !== editedCellId)
  const rem = round4(100 - p)

  if (rem <= 0) {
    return sorted.map((c, i) => ({
      ...c,
      sortOrder: i,
      widthPercent: c.id === editedCellId ? 100 : 0,
    }))
  }

  if (others.length === 1) {
    return sorted.map((c, i) => ({
      ...c,
      sortOrder: i,
      widthPercent: c.id === editedCellId ? p : rem,
    }))
  }

  const sumOthers = others.reduce((s, c) => s + Math.max(0, c.widthPercent || 0), 0)
  const widths = new Map<string, number>()
  widths.set(editedCellId, p)

  let sumMid = 0
  for (let i = 0; i < others.length - 1; i++) {
    const c = others[i]
    const raw =
      sumOthers <= 1e-9
        ? rem / others.length
        : (rem * Math.max(0, c.widthPercent || 0)) / sumOthers
    const nw = round4(raw)
    widths.set(c.id, nw)
    sumMid = round4(sumMid + nw)
  }
  const last = others[others.length - 1]
  widths.set(last.id, Math.max(0, round4(100 - p - sumMid)))

  return sorted.map((c, i) => ({
    ...c,
    sortOrder: i,
    widthPercent: widths.get(c.id) ?? 0,
  }))
}

function normalizeBlock(b: Record<string, unknown>): PdfBlock {
  const type = (b.type as string) || 'text'
  return {
    id: (b.id as string) || newId('block'),
    type: type as PdfBlockType,
    fontSize: (b.fontSize as number) ?? 11,
    fontFamily: (b.fontFamily as string) || 'Roboto',
    fontColor: (b.fontColor as string) || '#000000',
    fontWeight: (b.fontWeight as 'normal' | 'bold') || 'normal',
    fontStyle: (b.fontStyle as 'normal' | 'italic') || 'normal',
    textDecoration: (b.textDecoration as 'none' | 'underline') || 'none',
    textAlign: (b.textAlign as 'left' | 'center' | 'right') || 'left',
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
  }
}

function normalizeCell(c: Record<string, unknown>): PdfLayoutCell {
  const blockRaw = c.block as Record<string, unknown> | undefined
  return {
    id: (c.id as string) || newId('cell'),
    sortOrder: (c.sortOrder as number) ?? 0,
    widthPercent: Math.max(0, Number(c.widthPercent) || 0),
    block: blockRaw ? normalizeBlock(blockRaw) : normalizeBlock({ type: 'text', id: newId('block') }),
  }
}

function normalizeRow(r: Record<string, unknown>): PdfLayoutRow {
  const cellsRaw = (r.cells as unknown[]) || []
  const cells = cellsRaw.filter(Boolean).map((x) => normalizeCell(x as Record<string, unknown>))
  return {
    id: (r.id as string) || newId('row'),
    sortOrder: (r.sortOrder as number) ?? 0,
    marginTopMm: Math.max(0, Number(r.marginTopMm) ?? 0),
    cells: normalizeRowCellWidths(cells),
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
      return { ...base, fontSize: 11 }
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
    widthPercent,
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
      const sorted = rows.sort((a, b) => a.sortOrder - b.sortOrder).map((row) => ({
        ...row,
        cells: normalizeRowCellWidths(row.cells.map((c, j) => ({ ...c, sortOrder: j }))),
      }))
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
