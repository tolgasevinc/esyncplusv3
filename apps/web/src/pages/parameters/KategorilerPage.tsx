import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, X, Trash2, Copy, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toastSuccess, toastError } from '@/lib/toast'

import { API_URL } from '@/lib/api'

interface ProductCategory {
  id: number
  group_id?: number
  category_id?: number
  name: string
  code: string
  slug?: string
  description?: string
  image?: string
  icon?: string
  sort_order: number
  status?: number
  created_at?: string
}

interface ProductGroup {
  id: number
  name: string
  code: string
}

const emptyForm = {
  name: '',
  code: '',
  slug: '',
  description: '',
  image: '',
  icon: '',
  group_id: '' as number | '',
  category_id: '' as number | '',
  sort_order: 0,
  status: 1,
}

/** Gruplar = product_categories where group_id=0 veya null */
export function KategorilerPage() {
  const [groups, setGroups] = useState<ProductGroup[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupForm, setGroupForm] = useState({ name: '', code: '', description: '' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasFilter = search.length > 0

  const fetchGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/product-categories?group_id=0&limit=100`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gruplar yüklenemedi')
      const list = json.data || []
      setGroups(list)
      setActiveGroupId((prev) => (list.length > 0 && !prev ? String(list[0].id) : prev))
    } catch {
      setGroups([])
    } finally {
      setGroupsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [])

  const fetchData = useCallback(async () => {
    if (!activeGroupId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '9999', group_id: activeGroupId })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/product-categories?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setData(json.data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [search, activeGroupId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openNew = async (parentCategoryId?: number) => {
    setEditingId(null)
    setForm({
      ...emptyForm,
      group_id: activeGroupId ? Number(activeGroupId) : ('' as number | ''),
      category_id: parentCategoryId !== undefined ? parentCategoryId : (0 as number | ''),
    })
    setModalOpen(true)
    try {
      const res = await fetch(`${API_URL}/api/product-categories/next-sort-order`)
      const json = await res.json()
      if (res.ok && json.next != null) setForm((f) => ({ ...f, sort_order: json.next }))
    } catch { /* ignore */ }
  }

  const openEdit = (item: ProductCategory) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      code: item.code,
      slug: item.slug || '',
      description: item.description || '',
      image: item.image || '',
      icon: item.icon || '',
      group_id: item.group_id ?? '',
      category_id: item.category_id ?? '',
      sort_order: item.sort_order ?? 0,
      status: item.status ?? 1,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function handleCopy() {
    setEditingId(null)
    setForm((f) => ({ ...f, name: f.name + ' (kopya)' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const url = editingId ? `${API_URL}/api/product-categories/${editingId}` : `${API_URL}/api/product-categories`
      const method = editingId ? 'PUT' : 'POST'
      const body = {
        ...form,
        code: form.code || form.name.slice(0, 2).toUpperCase(),
        group_id: (form.group_id === '' || form.group_id === undefined || form.group_id === null) ? undefined : Number(form.group_id),
        category_id: (form.category_id === '' || form.category_id === undefined || form.category_id === null) ? 0 : Number(form.category_id),
        status: form.status,
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Kategori güncellendi' : 'Kategori eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, onSuccess?: () => void) {
    if (!confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/product-categories/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Kategori silindi', 'Kategori başarıyla silindi.')
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  async function handleSaveGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!groupForm.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/product-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupForm.name.trim(),
          code: groupForm.code || groupForm.name.slice(0, 2).toUpperCase(),
          description: groupForm.description || null,
          group_id: 0,
          category_id: 0,
          sort_order: 0,
          status: 1,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Grup eklenemedi')
      setGroupModalOpen(false)
      setGroupForm({ name: '', code: '', description: '' })
      fetchGroups()
      toastSuccess('Grup eklendi', 'Yeni grup başarıyla oluşturuldu.')
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Grup eklenemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageLayout
      title="Kategoriler"
      description="Ürün kategorilerini yönetin"
      backTo="/parametreler"
      showRefresh
      onRefresh={() => {
        setSearch('')
        fetchGroups()
        fetchData()
      }}
      headerActions={
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-48 h-9"
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => setGroupModalOpen(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Yeni grup</TooltipContent>
              </Tooltip>
              {hasFilter && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => setSearch('')}>
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Filtreleri sıfırla</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>
      }
      footerContent={undefined}
    >
      {groupsLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Gruplar yükleniyor...</CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Henüz grup yok. Önce <Link to="/parametreler/gruplar" className="text-primary underline">Gruplar</Link> sayfasından grup ekleyin.
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeGroupId} onValueChange={setActiveGroupId} className="w-full">
          <div className="flex items-center mb-4">
            <TabsList className="flex-1">
              {groups.map((g) => (
                <TabsTrigger key={g.id} value={String(g.id)}>
                  {g.name} ({g.code})
                </TabsTrigger>
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openNew()}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-sm ml-1 px-2 text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm transition-all shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Yeni kategori (bu gruba)</TooltipContent>
              </Tooltip>
            </TabsList>
          </div>
          {groups.map((g) => {
            const mainCategories = data.filter((c) => !c.category_id || c.category_id === 0)
            return (
              <TabsContent key={g.id} value={String(g.id)} className="mt-0">
                {loading ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">Yükleniyor...</CardContent>
                  </Card>
                ) : error ? (
                  <Card>
                    <CardContent className="p-8 text-center text-destructive">{error}</CardContent>
                  </Card>
                ) : mainCategories.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      Bu grupta henüz kategori yok.{' '}
                      <Button variant="link" className="p-0 h-auto" onClick={() => openNew()}>
                        İlk kategoriyi ekleyin
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {mainCategories.map((mainCat) => {
                      const subcategories = data.filter((c) => c.category_id === mainCat.id)
                      return (
                        <Card key={mainCat.id} className="overflow-hidden">
                          <div
                            className="flex items-center justify-between gap-2 p-4 cursor-pointer hover:bg-muted/50 transition-colors border-b"
                            onClick={() => openEdit(mainCat)}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{mainCat.name}</p>
                              <p className="text-xs text-muted-foreground">{mainCat.code}</p>
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0 h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openNew(mainCat.id)
                                  }}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Yeni alt kategori</TooltipContent>
                            </Tooltip>
                          </div>
                          <CardContent className="p-0">
                            {subcategories.length === 0 ? (
                              <div className="p-3 text-sm text-muted-foreground text-center">
                                Alt kategori yok
                              </div>
                            ) : (
                              <ul className="divide-y">
                                {subcategories.map((sub) => (
                                  <li
                                    key={sub.id}
                                    className="flex items-center justify-between gap-2 px-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors text-sm"
                                    onClick={() => openEdit(sub)}
                                  >
                                    <span className="truncate">{sub.name}</span>
                                    <span className="text-xs text-muted-foreground shrink-0">{sub.code}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            )
          })}
        </Tabs>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Kategori Düzenle' : 'Yeni Kategori'}</DialogTitle>
            <DialogDescription>Kategori bilgilerini girin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="name">Kategori Adı *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Örn: Bilgisayar" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Kod</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Örn: BL" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group_id">Grup</Label>
              <select
                id="group_id"
                value={form.group_id}
                onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value ? parseInt(e.target.value) : '' }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Seçiniz</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category_id">Üst Kategori</Label>
              <select
                id="category_id"
                value={form.category_id === '' || form.category_id === undefined ? 0 : form.category_id}
                onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? parseInt(e.target.value) : 0 }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value={0}>Ana kategori</option>
                {data.filter((c) => !c.category_id || c.category_id === 0).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="Örn: bilgisayar" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Açıklama</Label>
              <Input id="description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Kısa açıklama" />
            </div>
            <DialogFooter className="flex-row justify-between gap-4 sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="sort_order" className="text-sm">Sıra</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                    className="w-16 h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="modal-status"
                    checked={!!form.status}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                  />
                  <Label htmlFor="modal-status" className="text-sm cursor-pointer">Aktif</Label>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {editingId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button type="button" variant="outline" size="icon" onClick={() => handleDelete(editingId, closeModal)} disabled={saving} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Sil</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block">
                      <Button type="button" variant="outline" size="icon" onClick={handleCopy} disabled={saving}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Kopyala</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="submit" variant="outline" size="icon" disabled={saving || !form.name.trim()}>
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Kaydet</TooltipContent>
                </Tooltip>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={groupModalOpen} onOpenChange={setGroupModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Grup</DialogTitle>
            <DialogDescription>Grup bilgilerini girin. Gruplar product_categories tablosunda group_id=0 olarak saklanır.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveGroup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Grup Adı *</Label>
              <Input
                id="group-name"
                value={groupForm.name}
                onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Örn: Elektronik"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-code">Kod</Label>
              <Input
                id="group-code"
                value={groupForm.code}
                onChange={(e) => setGroupForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Örn: EL"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-desc">Açıklama</Label>
              <Input
                id="group-desc"
                value={groupForm.description}
                onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Kısa açıklama"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGroupModalOpen(false)}>
                İptal
              </Button>
              <Button type="submit" disabled={saving || !groupForm.name.trim()}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
