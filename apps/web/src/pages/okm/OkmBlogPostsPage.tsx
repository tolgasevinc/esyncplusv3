import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { downloadOkmBlog301RedirectSheet } from '@/lib/okm-blog-301-export'
import { toastError, toastSuccess } from '@/lib/toast'

/** Tabloda göstermeyelim — kullanıcı isteği: `content` sütunu (büyük/küçük harf duyarsız) */
const OKM_BLOG_TABLE_HIDE_COLUMNS = new Set(['content'])

const OKM_BLOG_CONTENT_VIEW_CANDIDATES = [
  'content',
  'icerik',
  'body',
  'description',
  'aciklama',
  'text',
  'detay',
  'icerik_tr',
  'html',
] as const

function resolveOkmImageUrl(raw: string, baseRaw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (t.toLowerCase().startsWith('data:image')) return t
  if (/^https?:\/\//i.test(t)) return t
  if (t.startsWith('//')) return `https:${t}`
  const base = baseRaw.trim().replace(/\/+$/, '')
  if (!base) return null
  if (t.startsWith('/')) return `${base}${t}`
  return `${base}/${t.replace(/^\/+/, '')}`
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** iframe `srcDoc`: biçimli önizleme; göreli `img src` için isteğe bağlı `<base href>`. */
function buildOkmBlogPreviewSrcDoc(bodyHtml: string, siteBaseRaw: string): string {
  const base = (siteBaseRaw || '').trim().replace(/\/+$/, '')
  const baseTag = base ? `<base href="${escapeHtmlAttr(base)}/">` : ''
  const body = bodyHtml.trim() ? bodyHtml : '<p style="color:#666">İçerik yok.</p>'
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">${baseTag}<meta name="viewport" content="width=device-width,initial-scale=1"><style>
    html,body{min-height:100%;margin:0}
    body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:15px;line-height:1.65;color:#171717;background:#fafafa;padding:18px 22px 40px;max-width:48rem;margin:0 auto;box-sizing:border-box}
    img,video,iframe{max-width:100%;height:auto}
    table{border-collapse:collapse;max-width:100%;font-size:14px}
    th,td{border:1px solid #e5e5e5;padding:8px 10px}
    a{color:#2563eb;text-decoration:underline}
    pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
    pre{overflow:auto;background:#f4f4f5;padding:14px;border-radius:10px;border:1px solid #e5e5e5}
    code{background:#f4f4f5;padding:2px 6px;border-radius:4px}
    blockquote{margin:1em 0;padding-left:1rem;border-left:4px solid #d4d4d8;color:#404040}
    h1{font-size:1.75rem;margin:0.4em 0 0.5em;font-weight:700}
    h2{font-size:1.4rem;margin:1em 0 0.45em;font-weight:650}
    h3{font-size:1.15rem;margin:1em 0 0.4em;font-weight:600}
    h4,h5,h6{margin:1em 0 0.35em;font-weight:600}
    p{margin:0.65em 0}
    ul,ol{padding-left:1.35rem;margin:0.65em 0}
    hr{border:none;border-top:1px solid #e5e5e5;margin:1.5rem 0}
  </style></head><body>${body}</body></html>`
}

function pickRowBlogHtmlContent(row: BlogRow): string {
  const keys = Object.keys(row).filter((k) => k !== '_ideasoft')
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k] as const))
  for (const c of OKM_BLOG_CONTENT_VIEW_CANDIDATES) {
    const k = lower.get(c)
    if (!k) continue
    const v = row[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

type IdeasoftSyncMeta = {
  sync_status: string
  ideasoft_blog_id: number | null
  last_error: string | null
  last_synced_at?: string | null
}

type BlogRow = Record<string, unknown> & { _ideasoft?: IdeasoftSyncMeta }

export function OkmBlogPostsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<BlogRow[]>([])
  const [idColumn, setIdColumn] = useState<string>('id')
  const [blogTable, setBlogTable] = useState<string>('')
  const [pushingAll, setPushingAll] = useState(false)
  const [pushingId, setPushingId] = useState<string | null>(null)
  const [importingLegacy, setImportingLegacy] = useState(false)
  const [contentModalOpen, setContentModalOpen] = useState(false)
  const [contentModalTitle, setContentModalTitle] = useState('')
  /** Ham HTML parçası; modalda iframe `srcDoc` ile biçimli önizleme */
  const [contentModalBody, setContentModalBody] = useState('')
  const [contentModalFrameKey, setContentModalFrameKey] = useState(0)
  const [blogImageBaseUrl, setBlogImageBaseUrl] = useState('')

  const loadPosts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/okm/blog-posts?limit=300`)
      const data = await parseJsonResponse<{
        data?: BlogRow[]
        error?: string
        blog_table?: string
        blog_source_id_column?: string
        blog_image_base_url?: string
      }>(res)
      if (!res.ok) throw new Error(data.error || 'Liste alınamadı')
      setRows(Array.isArray(data.data) ? data.data : [])
      if (data.blog_source_id_column) setIdColumn(data.blog_source_id_column)
      if (data.blog_table) setBlogTable(data.blog_table)
      setBlogImageBaseUrl(typeof data.blog_image_base_url === 'string' ? data.blog_image_base_url : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await loadPosts()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [loadPosts])

  const mysqlColumns = useMemo(() => {
    if (rows.length === 0) return [] as string[]
    return Object.keys(rows[0] ?? {}).filter((k) => k !== '_ideasoft')
  }, [rows])

  const tableColumns = useMemo(
    () => mysqlColumns.filter((col) => !OKM_BLOG_TABLE_HIDE_COLUMNS.has(col.toLowerCase())),
    [mysqlColumns],
  )

  async function pushToIdeasoft(sourceIds: string[]) {
    const res = await fetch(`${API_URL}/api/okm/blog-posts/push-to-ideasoft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_ids: sourceIds }),
    })
    const data = await parseJsonResponse<{
      ok?: boolean
      error?: string
      summary?: { synced?: number; failed?: number; total?: number }
    }>(res)
    if (!res.ok || !data.ok) throw new Error(data.error || 'Aktarım başarısız')
    const s = data.summary
    if (s) {
      toastSuccess(
        'IdeaSoft aktarımı',
        `${s.synced ?? 0} başarılı, ${s.failed ?? 0} hata (toplam ${s.total ?? 0}).`,
      )
    } else {
      toastSuccess('IdeaSoft aktarımı', 'İşlem tamamlandı.')
    }
    await loadPosts()
  }

  async function handlePushOne(sourceId: string) {
    setPushingId(sourceId)
    try {
      await pushToIdeasoft([sourceId])
    } catch (e) {
      toastError('Aktarım', e instanceof Error ? e.message : 'Hata')
    } finally {
      setPushingId(null)
    }
  }

  async function handlePushPending() {
    setPushingAll(true)
    try {
      await pushToIdeasoft([])
    } catch (e) {
      toastError('Toplu aktarım', e instanceof Error ? e.message : 'Hata')
    } finally {
      setPushingAll(false)
    }
  }

  function handleDownload301List() {
    if (rows.length === 0) {
      toastError('301 listesi', 'Önce liste yüklenmeli.')
      return
    }
    const tableSlug = (blogTable || 'blog').replace(/[^\w\-]+/g, '_').slice(0, 60)
    const { exported, skipped } = downloadOkmBlog301RedirectSheet(rows, { fileBase: `okm-301-${tableSlug}` })
    if (exported === 0) {
      toastError(
        '301 listesi',
        'SEF alanı okunamadı (slug, url, link, permalink vb.). Tabloda bu sütunlardan en az biri dolu olmalı.',
      )
      return
    }
    toastSuccess(
      '301 listesi indirildi',
      `${exported} satır yazıldı${skipped > 0 ? `; SEF’siz ${skipped} satır atlandı.` : '.'}`,
    )
  }

  async function handleImportLegacySync() {
    if (
      !window.confirm(
        'MySQL blog tablosunda tanımlı IdeaSoft ID sütununa göre D1 eşlemesi güncellenecek. Devam edilsin mi?',
      )
    ) {
      return
    }
    setImportingLegacy(true)
    try {
      const res = await fetch(`${API_URL}/api/okm/blog-posts/import-legacy-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await parseJsonResponse<{
        ok?: boolean
        error?: string
        upserted?: number
        scanned?: number
        skipped_no_legacy_id?: number
        skipped_no_source_id?: number
      }>(res)
      if (!res.ok || !data.ok) throw new Error(data.error || 'İçe aktarım başarısız')
      toastSuccess(
        'D1 içe aktarma',
        `${data.upserted ?? 0} kayıt güncellendi (${data.scanned ?? 0} satır tarandı; boş ID: ${data.skipped_no_legacy_id ?? 0}).`,
      )
      await loadPosts()
    } catch (e) {
      toastError('D1 içe aktarma', e instanceof Error ? e.message : 'Hata')
    } finally {
      setImportingLegacy(false)
    }
  }

  function syncLabel(s: IdeasoftSyncMeta | undefined): string {
    if (!s) return '—'
    const m: Record<string, string> = {
      none: 'Kayıt yok',
      pending: 'Bekliyor',
      synced: 'Aktarıldı',
      failed: 'Hata',
    }
    return m[s.sync_status] ?? s.sync_status
  }

  function openContentModal(row: BlogRow, sourceId: string) {
    const raw = pickRowBlogHtmlContent(row)
    const titleCand =
      typeof row.title === 'string'
        ? row.title
        : typeof row.baslik === 'string'
          ? row.baslik
          : typeof row.name === 'string'
            ? row.name
            : ''
    setContentModalTitle((titleCand || `Yazı #${sourceId}`).trim().slice(0, 200))
    setContentModalBody(raw)
    setContentModalFrameKey((k) => k + 1)
    setContentModalOpen(true)
  }

  return (
    <PageLayout
      title="OKM — Blog sayfaları"
      description={
        blogTable
          ? `OKM tablosu: ${blogTable} · Kimlik sütunu: ${idColumn} — IdeaSoft eşlemesi D1’de saklanır.`
          : 'OKM MySQL veritabanındaki blog tablosundan okunan kayıtlar'
      }
      backTo="/okm"
      footerActions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDownload301List()}
            disabled={loading || rows.length === 0}
            title="Eski: /blog/(sef) → Yeni: /blog/icerik/(sef)"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2 shrink-0" />
            301 listesi (.xls)
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleImportLegacySync()}
            disabled={importingLegacy || pushingAll || loading}
          >
            {importingLegacy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                D1’e aktarılıyor…
              </>
            ) : (
              'D1’e eski eşlemeleri aktar'
            )}
          </Button>
          <Button variant="outline" onClick={() => void handlePushPending()} disabled={pushingAll || loading || rows.length === 0}>
            {pushingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Aktarılıyor…
              </>
            ) : (
              'Eşlenmemişleri IdeaSoft’a aktar'
            )}
          </Button>
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Blog yazıları</CardTitle>
          <CardDescription>
            Bağlantı ve blog tablosu{' '}
            <Link className="underline font-medium text-foreground" to="/ayarlar/entegrasyonlar?tab=okm">
              Ayarlar › Entegrasyonlar › OKM
            </Link>{' '}
            üzerinden yapılır. Varsayılan kategori ve etiketler için{' '}
            <Link className="underline font-medium text-foreground" to="/ideasoft/blog">
              IdeaSoft › Blog sayfaları
            </Link>{' '}
            kullanılabilir; aksi halde OKM kartında <strong>IdeaSoft blog kategori ID</strong> gerekir. OAuth
            kapsamlarında <code className="text-[11px] bg-muted px-1 rounded">blog_create</code>,{' '}
            <code className="text-[11px] bg-muted px-1 rounded">blog_update</code> ve{' '}
            <code className="text-[11px] bg-muted px-1 rounded">blog_category_read</code> olmalıdır; kapak /{' '}
            <code className="text-[11px] bg-muted px-1 rounded">blog_images</code> için{' '}
            <code className="text-[11px] bg-muted px-1 rounded">blog_image_create</code> gerekebilir. Eski sitede göreli resim yolları için OKM
            ayarlarında <strong>Eski site kök URL</strong> tanımlayın. Eski sitede yazı başına IdeaSoft blog
            kimliği zaten tutuluyorsa önce <strong>D1’e eski eşlemeleri aktar</strong> kullanın.{' '}
            <strong>301 listesi (.xls)</strong> ile SEF’ten iki sütun üretilir:{' '}
            <code className="text-[11px] bg-muted px-1 rounded">/blog/(sef)</code> →{' '}
            <code className="text-[11px] bg-muted px-1 rounded">/blog/icerik/(sef)</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Yükleniyor…
            </div>
          )}
          {!loading && error && <p className="text-sm text-destructive py-4">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-6">Kayıt bulunamadı veya tablo boş.</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <>
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      {tableColumns.map((col) => (
                        <th key={col} className="p-2 font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      <th className="p-2 font-medium whitespace-nowrap">İçerik</th>
                      <th className="p-2 font-medium whitespace-nowrap">IdeaSoft durumu</th>
                      <th className="p-2 font-medium whitespace-nowrap">IdeaSoft blog #</th>
                      <th className="p-2 font-medium whitespace-nowrap min-w-[140px]">Son hata</th>
                      <th className="p-2 font-medium whitespace-nowrap min-w-[100px]">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const sync = row._ideasoft
                      const sidRaw = row[idColumn]
                      const sourceId = sidRaw == null ? '' : String(sidRaw).trim()
                      const isSynced = sync?.sync_status === 'synced' && sync.ideasoft_blog_id
                      const htmlRaw = pickRowBlogHtmlContent(row)
                      return (
                        <tr key={`${sourceId || i}`} className="border-b border-border/60 align-top hover:bg-muted/30">
                          {tableColumns.map((col) => (
                            <td key={col} className="p-2 max-w-[280px] break-words align-top">
                              <OkmBlogTableCell
                                columnKey={col}
                                cellValue={row[col]}
                                imageBaseUrl={blogImageBaseUrl}
                              />
                            </td>
                          ))}
                          <td className="p-2 whitespace-nowrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8"
                              disabled={!htmlRaw}
                              title={htmlRaw ? 'Biçimli HTML önizleme' : 'İçerik sütunu yok veya boş'}
                              onClick={() => openContentModal(row, sourceId || String(i))}
                            >
                              Göster
                            </Button>
                          </td>
                          <td className="p-2 whitespace-nowrap">{syncLabel(sync)}</td>
                          <td className="p-2 whitespace-nowrap">
                            {sync?.ideasoft_blog_id != null ? String(sync.ideasoft_blog_id) : '—'}
                          </td>
                          <td className="p-2 max-w-[220px] break-words text-destructive text-xs">
                            {sync?.last_error ? formatCell(sync.last_error) : '—'}
                          </td>
                          <td className="p-2">
                            {!sourceId ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-8"
                                disabled={pushingAll || pushingId === sourceId}
                                onClick={() => void handlePushOne(sourceId)}
                              >
                                {pushingId === sourceId ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : isSynced ? (
                                  'Yinele'
                                ) : (
                                  'Aktar'
                                )}
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <Dialog
                open={contentModalOpen}
                onOpenChange={(open) => {
                  setContentModalOpen(open)
                  if (!open) setContentModalBody('')
                }}
              >
                <DialogContent className="max-w-[min(100vw-1rem,920px)] w-[min(100vw-1rem,920px)] max-h-[min(92vh,780px)] flex flex-col gap-3 p-4 sm:p-6">
                  <DialogHeader className="space-y-1 shrink-0">
                    <DialogTitle className="pr-8">İçerik önizleme</DialogTitle>
                    <p className="text-sm text-muted-foreground font-normal line-clamp-2">{contentModalTitle}</p>
                  </DialogHeader>
                  <div className="flex-1 min-h-[min(58vh,520px)] overflow-hidden rounded-lg border bg-muted/20">
                    <iframe
                      key={contentModalFrameKey}
                      title="Blog HTML önizleme"
                      srcDoc={buildOkmBlogPreviewSrcDoc(contentModalBody, blogImageBaseUrl)}
                      sandbox=""
                      className="h-[min(58vh,520px)] w-full border-0 bg-white"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0 leading-snug">
                    Önizleme <code className="text-[11px] bg-muted px-1 rounded">iframe</code> içindedir;{' '}
                    <code className="text-[11px] bg-muted px-1 rounded">sandbox</code> ile betik çalıştırılmaz. Göreli resimler için OKM’de{' '}
                    <strong>Eski site kök URL</strong> kullanılır.
                  </p>
                </DialogContent>
              </Dialog>
            </>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

function formatCell(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır'
  const s = String(v)
  return s.length > 400 ? `${s.slice(0, 400)}…` : s
}

function OkmBlogTableCell({
  columnKey,
  cellValue,
  imageBaseUrl,
}: {
  columnKey: string
  cellValue: unknown
  imageBaseUrl: string
}): ReactNode {
  if (columnKey.toLowerCase() !== 'image') {
    return formatCell(cellValue)
  }
  const raw = cellValue == null ? '' : String(cellValue).trim()
  if (!raw) return <span className="text-muted-foreground">—</span>
  const src = resolveOkmImageUrl(raw, imageBaseUrl)
  if (!src) {
    return (
      <div className="space-y-1">
        <span className="text-xs text-amber-600 dark:text-amber-500 block">
          Göreli yol; OKM ayarlarında eski site kök URL gerekir.
        </span>
        <span className="text-xs break-all text-muted-foreground">{formatCell(cellValue)}</span>
      </div>
    )
  }
  return <OkmBlogImageAvatarCell src={src} fallbackLabel={formatCell(cellValue)} />
}

function OkmBlogImageAvatarCell({ src, fallbackLabel }: { src: string; fallbackLabel: string }) {
  const fb =
    fallbackLabel.replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ]/g, '').slice(0, 2).toUpperCase() || '?'
  return (
    <Tooltip delayDuration={220}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Kapak önizlemesi"
        >
          <Avatar className="h-11 w-11 border border-border shadow-sm">
            <AvatarImage src={src} alt="" className="object-cover" referrerPolicy="no-referrer" />
            <AvatarFallback className="text-[10px] font-medium bg-muted">{fb}</AvatarFallback>
          </Avatar>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="start"
        sideOffset={10}
        className="z-[80] max-w-none overflow-visible border-0 bg-transparent p-0 shadow-none"
      >
        <div className="rounded-xl border bg-background p-1.5 shadow-xl">
          <img
            src={src}
            alt=""
            className="max-h-[min(70vh,520px)] w-auto max-w-[min(90vw,440px)] rounded-lg object-contain bg-muted/30"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
