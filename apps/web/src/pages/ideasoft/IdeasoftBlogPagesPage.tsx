import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Loader2, RefreshCw } from 'lucide-react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { API_URL, formatIdeasoftProxyErrorForUi, parseJsonResponse } from '@/lib/api'
import { toastError, toastSuccess } from '@/lib/toast'
import {
  defaultBlogPushFormValues,
  extractBlogPushFromIdeasoftSettings,
  IDEASOFT_BLOG_PUSH_KEYS,
  type IdeasoftBlogPushFormValues,
  fetchIdeasoftSettingsRaw,
  saveIdeasoftBlogPushSettings,
} from '@/lib/ideasoft-blog-push-settings'

type IdTitleRow = { id: number; title: string }

function extractAdminListIdTitle(json: unknown): IdTitleRow[] {
  const row = (x: unknown): IdTitleRow | null => {
    if (!x || typeof x !== 'object') return null
    const o = x as Record<string, unknown>
    const id = Number(o.id)
    if (!Number.isFinite(id)) return null
    const t =
      typeof o.title === 'string'
        ? o.title.trim()
        : typeof o.name === 'string'
          ? o.name.trim()
          : ''
    return { id, title: t || `#${id}` }
  }
  if (Array.isArray(json)) {
    return json.map(row).filter((x): x is IdTitleRow => x != null)
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const hydra = o['hydra:member']
    if (Array.isArray(hydra)) return hydra.map(row).filter((x): x is IdTitleRow => x != null)
    const data = o.data
    if (Array.isArray(data)) return data.map(row).filter((x): x is IdTitleRow => x != null)
    const items = o.items
    if (Array.isArray(items)) return items.map(row).filter((x): x is IdTitleRow => x != null)
  }
  return []
}

export function IdeasoftBlogPagesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<IdeasoftBlogPushFormValues>(() => defaultBlogPushFormValues())
  const [catPreview, setCatPreview] = useState<string | null>(null)
  const [catLoading, setCatLoading] = useState(false)

  const [blogCats, setBlogCats] = useState<IdTitleRow[]>([])
  const [blogTags, setBlogTags] = useState<IdTitleRow[]>([])
  const [catsLoading, setCatsLoading] = useState(false)
  const [tagsLoading, setTagsLoading] = useState(false)

  const loadForm = useCallback(async () => {
    setLoading(true)
    try {
      const all = await fetchIdeasoftSettingsRaw()
      setForm(extractBlogPushFromIdeasoftSettings(all))
      setCatPreview(null)
    } catch (e) {
      toastError('Yükleme', e instanceof Error ? e.message : 'Hata')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadForm()
  }, [loadForm])

  async function handleSave() {
    const tagsRaw = (form[IDEASOFT_BLOG_PUSH_KEYS.tagsJson] ?? '').trim()
    if (tagsRaw) {
      try {
        JSON.parse(tagsRaw)
      } catch {
        toastError('Doğrulama', 'Etiketler geçerli bir JSON dizi olmalıdır (ör. [{"id":1,"title":"Haber"}]).')
        return
      }
    }
    setSaving(true)
    try {
      await saveIdeasoftBlogPushSettings({ ...form })
      toastSuccess('Kaydedildi', 'Blog gönderim varsayılanları güncellendi.')
      await loadForm()
    } catch (e) {
      toastError('Kayıt', e instanceof Error ? e.message : 'Hata')
    } finally {
      setSaving(false)
    }
  }

  async function fetchCategoryTitle() {
    const id = parseInt((form[IDEASOFT_BLOG_PUSH_KEYS.categoryId] ?? '').trim(), 10)
    if (!Number.isFinite(id) || id <= 0) {
      toastError('Kategori', 'Geçerli bir sayısal kategori ID girin.')
      return
    }
    setCatLoading(true)
    setCatPreview(null)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/blog_categories/${id}`)
      const data = await parseJsonResponse<Record<string, unknown>>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data) || `HTTP ${res.status}`)
      const t = typeof data.title === 'string' ? data.title.trim() : ''
      setCatPreview(t || `(başlık yok, id: ${id})`)
    } catch (e) {
      toastError('Kategori', e instanceof Error ? e.message : 'Hata')
    } finally {
      setCatLoading(false)
    }
  }

  async function loadBlogCategories() {
    setCatsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/blog_categories?limit=80`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data as object) || `HTTP ${res.status}`)
      setBlogCats(extractAdminListIdTitle(data))
    } catch (e) {
      toastError('Blog kategorileri', e instanceof Error ? e.message : 'Hata')
      setBlogCats([])
    } finally {
      setCatsLoading(false)
    }
  }

  async function loadBlogTags() {
    setTagsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/admin-api/blog_tags?limit=80`)
      const data = await parseJsonResponse<unknown>(res)
      if (!res.ok) throw new Error(formatIdeasoftProxyErrorForUi(data as object) || `HTTP ${res.status}`)
      setBlogTags(extractAdminListIdTitle(data))
    } catch (e) {
      toastError('Blog etiketleri', e instanceof Error ? e.message : 'Hata')
      setBlogTags([])
    } finally {
      setTagsLoading(false)
    }
  }

  return (
    <PageLayout
      title="Blog sayfaları"
      description="OKM veya diğer kaynaklardan IdeaSoft’a blog aktarımında kullanılan varsayılan Admin API alanları (Blog POST / PUT)."
      backTo="/ideasoft"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <CardTitle>Gönderim varsayılanları</CardTitle>
            </div>
            <CardDescription>
              Öncelik sırası: buradaki <strong>varsayılan blog kategori ID</strong> doluysa OKM ayarındaki kategori alanı yerine bu
              kullanılır. OAuth kapsamlarında en az <code className="text-[11px] bg-muted px-1 rounded">blog_create</code>,{' '}
              <code className="text-[11px] bg-muted px-1 rounded">blog_update</code>,{' '}
              <code className="text-[11px] bg-muted px-1 rounded">blog_category_read</code> ve etiket listesi için{' '}
              <code className="text-[11px] bg-muted px-1 rounded">blog_tag_read</code> (veya dökümandaki eşdeğer) tanımlı olmalıdır.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-2xl">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6">
                <Loader2 className="h-5 w-5 animate-spin" />
                Ayarlar yükleniyor…
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="blog-push-cat-id">Varsayılan blog kategori ID</Label>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Input
                      id="blog-push-cat-id"
                      inputMode="numeric"
                      placeholder="ör. 3"
                      value={form[IDEASOFT_BLOG_PUSH_KEYS.categoryId]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [IDEASOFT_BLOG_PUSH_KEYS.categoryId]: e.target.value }))
                      }
                      className="max-w-[200px]"
                    />
                    <Button type="button" variant="outline" size="sm" disabled={catLoading} onClick={() => void fetchCategoryTitle()}>
                      {catLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Başlığı GET ile doğrula'}
                    </Button>
                  </div>
                  {catPreview ? (
                    <p className="text-sm text-muted-foreground">
                      API başlığı: <span className="font-medium text-foreground">{catPreview}</span>
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="blog-push-tags">Sabit etiketler (JSON dizi)</Label>
                  <Textarea
                    id="blog-push-tags"
                    rows={5}
                    className="font-mono text-xs"
                    placeholder='[{"id":1,"title":"Haber"},{"id":2,"title":"Duyuru"}]'
                    value={form[IDEASOFT_BLOG_PUSH_KEYS.tagsJson]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [IDEASOFT_BLOG_PUSH_KEYS.tagsJson]: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Her öğede <code className="bg-muted px-1 rounded">id</code> zorunlu; <code className="bg-muted px-1 rounded">title</code>{' '}
                    IdeaSoft gövdesinde kullanılır. Boş göndermek için <code className="bg-muted px-1 rounded">[]</code> bırakın.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="blog-push-status">Yayın durumu (status)</Label>
                    <select
                      id="blog-push-status"
                      aria-label="Yayın durumu (status)"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form[IDEASOFT_BLOG_PUSH_KEYS.status]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [IDEASOFT_BLOG_PUSH_KEYS.status]: e.target.value }))
                      }
                    >
                      <option value="1">Yayında (1)</option>
                      <option value="0">Taslak (0)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="blog-push-bv">Blok görünürlüğü (blockVisibility)</Label>
                    <select
                      id="blog-push-bv"
                      aria-label="Blok görünürlüğü (blockVisibility)"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form[IDEASOFT_BLOG_PUSH_KEYS.blockVisibility]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [IDEASOFT_BLOG_PUSH_KEYS.blockVisibility]: e.target.value }))
                      }
                    >
                      <option value="1">1</option>
                      <option value="0">0</option>
                    </select>
                    <p className="text-xs text-muted-foreground">Mağaza ön yüzünde blokların görünürlüğü (dökümana göre).</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="save" onClick={() => void handleSave()} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Kaydet
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void loadForm()} disabled={loading || saving}>
                    Yenile
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mağazadaki blog kategorileri ve etiketleri</CardTitle>
            <CardDescription>
              LIST uçlarından kimlik ve başlıkları kopyalayabilirsiniz. OKM blog aktarımı için{' '}
              <Link className="underline font-medium text-foreground" to="/okm/blog">
                OKM › Blog sayfaları
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Blog kategorileri</Label>
                <Button type="button" variant="outline" size="sm" disabled={catsLoading} onClick={() => void loadBlogCategories()}>
                  {catsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="ml-1.5">Yükle</span>
                </Button>
              </div>
              <div className="border rounded-md max-h-[280px] overflow-auto text-sm">
                {blogCats.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-xs">Liste boş veya henüz yüklenmedi.</p>
                ) : (
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">ID</th>
                        <th className="text-left p-2 font-medium">Başlık</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blogCats.map((r) => (
                        <tr key={r.id} className="border-t border-border/60">
                          <td className="p-2 tabular-nums">{r.id}</td>
                          <td className="p-2 break-words">{r.title}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Blog etiketleri</Label>
                <Button type="button" variant="outline" size="sm" disabled={tagsLoading} onClick={() => void loadBlogTags()}>
                  {tagsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="ml-1.5">Yükle</span>
                </Button>
              </div>
              <div className="border rounded-md max-h-[280px] overflow-auto text-sm">
                {blogTags.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-xs">Liste boş veya henüz yüklenmedi.</p>
                ) : (
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">ID</th>
                        <th className="text-left p-2 font-medium">Başlık</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blogTags.map((r) => (
                        <tr key={r.id} className="border-t border-border/60">
                          <td className="p-2 tabular-nums">{r.id}</td>
                          <td className="p-2 break-words">{r.title}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}
