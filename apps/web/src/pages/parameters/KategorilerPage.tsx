import { useState, useEffect, useCallback } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
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
import { ColorPresetPicker } from '@/components/ColorPresetPicker'
import { toastSuccess, toastError } from '@/lib/toast'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'

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
  color?: string
  sort_order: number
  status?: number
  created_at?: string
  /** IdeaSoft Admin API Category.distributor ile eşleşir (master ↔ mağaza kodu) */
  ideasoft_category_code?: string | null
  /** IdeaSoft kategori tablosundaki satır id — eşleştirme için birincil alan */
  ideasoft_category_id?: number | null
}

interface ProductGroup {
  id: number
  name: string
  code: string
  color?: string
}

const emptyForm = {
  name: '',
  code: '',
  slug: '',
  description: '',
  image: '',
  icon: '',
  color: '',
  group_id: '' as number | '',
  category_id: '' as number | '',
  sort_order: 0,
  status: 1,
  ideasoft_category_code: '',
  ideasoft_category_id: '',
}

const kategorilerListDefaults = { search: '', activeGroupId: '' as string }

/** Gruplar = product_categories where group_id=0 veya null */
export function KategorilerPage() {
  const [listState, setListState] = usePersistedListState('kategoriler', kategorilerListDefaults)
  const { search, activeGroupId } = listState
  const [groups, setGroups] = useState<ProductGroup[]>([])
  const [data, setData] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupForm, setGroupForm] = useState({ name: '', code: '', description: '' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null; onSuccess?: () => void }>({ open: false, id: null })
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
    } catch {
      setGroups([])
    } finally {
      setGroupsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  useEffect(() => {
    if (groups.length > 0) {
      const valid = groups.some((g) => String(g.id) === activeGroupId)
      if (!valid) setListState({ activeGroupId: String(groups[0].id) })
    }
  }, [groups, activeGroupId, setListState])

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
      color: item.color || '',
      group_id: item.group_id ?? '',
      category_id: item.category_id ?? '',
      sort_order: item.sort_order ?? 0,
      status: item.status ?? 1,
      ideasoft_category_code: item.ideasoft_category_code ?? '',
      ideasoft_category_id: item.ideasoft_category_id != null ? String(item.ideasoft_category_id) : '',
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
      const rawIsId = String(form.ideasoft_category_id ?? '').trim()
      let ideasoft_category_id: number | null = null
      if (rawIsId) {
        const n = parseInt(rawIsId, 10)
        if (Number.isFinite(n) && n > 0) ideasoft_category_id = n
      }
      const body = {
        ...form,
        code: form.code || form.name.slice(0, 2).toUpperCase(),
        color: form.color || undefined,
        group_id: (form.group_id === '' || form.group_id === undefined || form.group_id === null) ? undefined : Number(form.group_id),
        category_id: (form.category_id === '' || form.category_id === undefined || form.category_id === null) ? 0 : Number(form.category_id),
        status: form.status,
        ideasoft_category_code: form.ideasoft_category_code.trim()
          ? form.ideasoft_category_code.trim()
          : null,
        ideasoft_category_id,
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

  function openDeleteConfirm(id: number, onSuccess?: () => void) {
    setDeleteConfirm({ open: true, id, onSuccess })
  }

  async function executeDelete() {
    const { id, onSuccess } = deleteConfirm
    if (!id) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/product-categories/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Kategori silindi', 'Kategori başarıyla silindi.')
      setDeleteConfirm({ open: false, id: null })
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleting(false)
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
        setListState({ search: '' })
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
                  onChange={(e) => setListState({ search: e.target.value })}
                  className="pl-8 w-48 h-9"
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => openNew()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Yeni kategori</TooltipContent>
              </Tooltip>
              <Button variant="ghost" size="sm" onClick={() => setGroupModalOpen(true)}>
                Grup ekle
              </Button>
              {hasFilter && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => setListState({ search: '' })}>
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
        <Tabs value={activeGroupId} onValueChange={(v) => setListState({ activeGroupId: v })} className="w-full">
          <div className="flex items-center mb-4">
            <TabsList className="flex-1">
              {groups.map((g) => (
                <TabsTrigger key={g.id} value={String(g.id)} className="flex items-center gap-1.5">
                  {g.color && (
                    <span
                      className="shrink-0 w-3 h-3 rounded-full border"
                      style={{ backgroundColor: g.color }}
                    />
                  )}
                  {g.name}
                  <span className="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-muted text-muted-foreground">
                    {g.code}
                  </span>
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
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              {mainCat.color && (
                                <span
                                  className="shrink-0 w-3 h-3 rounded-full border"
                                  style={{ backgroundColor: mainCat.color }}
                                />
                              )}
                              <p className="font-medium truncate min-w-0 flex-1">{mainCat.name}</p>
                              <span className="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-muted text-muted-foreground">
                                {mainCat.code}
                              </span>
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
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {sub.color && (
                                        <span
                                          className="shrink-0 w-2.5 h-2.5 rounded-full border"
                                          style={{ backgroundColor: sub.color }}
                                        />
                                      )}
                                      <span className="truncate">{sub.name}</span>
                                      <span className="shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-muted text-muted-foreground">
                                        {sub.code}
                                      </span>
                                    </div>
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
              <Label htmlFor="ideasoft_category_code">IdeaSoft kategori kodu</Label>
              <Input
                id="ideasoft_category_code"
                value={form.ideasoft_category_code}
                onChange={(e) => setForm((f) => ({ ...f, ideasoft_category_code: e.target.value }))}
                placeholder="Admin API Category.distributor ile aynı (eşleştirme)"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Mağaza kategorisindeki &quot;Kod&quot; (distributor) ile birebir eşleşmeli. IdeaSoft 2 › Kategoriler listesinde doğrulama gösterilir.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ideasoft_category_id">IdeaSoft kategori ID</Label>
              <Input
                id="ideasoft_category_id"
                type="number"
                min={1}
                inputMode="numeric"
                value={form.ideasoft_category_id}
                onChange={(e) => setForm((f) => ({ ...f, ideasoft_category_id: e.target.value }))}
                placeholder="Örn: 42 (IdeaSoft kategori tablosundaki id)"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Eşleştirme için birincil alan: bu değer, IdeaSoft kategori listesindeki satır <code className="rounded bg-muted px-1">id</code> ile aynı olmalıdır. Boş bırakılırsa eşleşme kalkar.
              </p>
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
            <ColorPresetPicker
              value={form.color}
              onChange={(color) => setForm((f) => ({ ...f, color }))}
              label="Renk"
            />
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
                        <Button type="button" variant="outline" size="icon" onClick={() => openDeleteConfirm(editingId!, closeModal)} disabled={saving} className="text-destructive hover:text-destructive">
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

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((p) => ({ ...p, open: o }))}
        description="Bu kategoriyi silmek istediğinize emin misiniz?"
        onConfirm={executeDelete}
        loading={deleting}
      />

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
