import { useState, useEffect, useCallback } from 'react'
import { Plus, SquarePen, Trash2, Save, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError } from '@/lib/toast'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { API_URL } from '@/lib/api'

interface OfferTag {
  id: number
  type: 'dahil' | 'haric'
  label: string
  description: string | null
  sort_order: number
}

const emptyForm = { type: 'dahil' as 'dahil' | 'haric', label: '', description: '', sort_order: 0 }

export function DahilHaricEtiketleriPage() {
  const [dahilData, setDahilData] = useState<OfferTag[]>([])
  const [haricData, setHaricData] = useState<OfferTag[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dahil' | 'haric'>('dahil')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null; onSuccess?: () => void }>({ open: false, id: null })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [dahilRes, haricRes] = await Promise.all([
        fetch(`${API_URL}/api/offer-tags?type=dahil`),
        fetch(`${API_URL}/api/offer-tags?type=haric`),
      ])
      const dahilJson = await dahilRes.json()
      const haricJson = await haricRes.json()
      if (!dahilRes.ok) throw new Error(dahilJson.error || 'Yüklenemedi')
      if (!haricRes.ok) throw new Error(haricJson.error || 'Yüklenemedi')
      setDahilData(dahilJson.data || [])
      setHaricData(haricJson.data || [])
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Yüklenemedi')
      setDahilData([])
      setHaricData([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openNew = (type: 'dahil' | 'haric') => {
    setEditingId(null)
    setForm({ ...emptyForm, type })
    setActiveTab(type)
    setModalOpen(true)
  }

  const openEdit = (item: OfferTag) => {
    setEditingId(item.id)
    setForm({
      type: item.type,
      label: item.label,
      description: item.description || '',
      sort_order: item.sort_order ?? 0,
    })
    setActiveTab(item.type)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.label.trim()) return
    setSaving(true)
    try {
      const url = editingId ? `${API_URL}/api/offer-tags/${editingId}` : `${API_URL}/api/offer-tags`
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId
        ? { label: form.label.trim(), description: form.description.trim() || undefined, sort_order: form.sort_order }
        : { type: form.type, label: form.label.trim(), description: form.description.trim() || undefined, sort_order: form.sort_order }
      if (editingId && form.type) (body as Record<string, unknown>).type = form.type
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Etiket güncellendi' : 'Etiket eklendi')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const openDeleteConfirm = (id: number, onSuccess?: () => void) => {
    setDeleteConfirm({ open: true, id, onSuccess })
  }

  const handleDelete = async () => {
    if (!deleteConfirm.id) return
    try {
      const res = await fetch(`${API_URL}/api/offer-tags/${deleteConfirm.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Etiket silindi')
      deleteConfirm.onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleteConfirm({ open: false, id: null })
    }
  }

  return (
    <PageLayout title="Dahil/Hariç Etiketleri" description="Teklif dahil ve hariç etiketlerini yönetin" backTo="/parametreler">
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">
              Teklif formunda seçilebilecek dahil olanlar ve hariç olanlar etiketleri. Her etiketin kısa adı ve açıklaması olabilir.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => openNew('dahil')}>
                <Plus className="h-4 w-4 mr-2" />
                Dahil Etiketi
              </Button>
              <Button variant="outline" onClick={() => openNew('haric')}>
                <Plus className="h-4 w-4 mr-2" />
                Hariç Etiketi
              </Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'dahil' | 'haric')}>
            <TabsList>
              <TabsTrigger value="dahil">Dahil olanlar ({dahilData.length})</TabsTrigger>
              <TabsTrigger value="haric">Hariç olanlar ({haricData.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="dahil" className="mt-4">
              {loading ? (
                <p className="text-muted-foreground">Yükleniyor...</p>
              ) : dahilData.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">Henüz dahil etiketi tanımlanmamış.</p>
              ) : (
                <div className="space-y-2">
                  {dahilData.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 cursor-pointer"
                      onClick={() => openEdit(item)}
                    >
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-600" />
                          {item.label}
                        </p>
                        {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(item); }}>
                          <SquarePen className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => { e.stopPropagation(); openDeleteConfirm(item.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="haric" className="mt-4">
              {loading ? (
                <p className="text-muted-foreground">Yükleniyor...</p>
              ) : haricData.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">Henüz hariç etiketi tanımlanmamış.</p>
              ) : (
                <div className="space-y-2">
                  {haricData.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/30 cursor-pointer"
                      onClick={() => openEdit(item)}
                    >
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          <X className="h-4 w-4 text-red-600" />
                          {item.label}
                        </p>
                        {item.description && <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(item); }}>
                          <SquarePen className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => { e.stopPropagation(); openDeleteConfirm(item.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Etiket Düzenle' : `Yeni ${form.type === 'dahil' ? 'Dahil' : 'Hariç'} Etiketi`}</DialogTitle>
            <DialogDescription>Etiket metni ve açıklamasını girin. Teklif formunda seçilebilir hale gelir.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingId && (
              <div className="space-y-2">
                <Label>Tür</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'dahil' | 'haric' }))}
                >
                  <option value="dahil">Dahil olanlar</option>
                  <option value="haric">Hariç olanlar</option>
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Etiket *</Label>
              <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Örn: Montaj dahil" required />
            </div>
            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Detaylı açıklama (opsiyonel)" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Sıra</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className="w-20" />
            </div>
            <DialogFooter>
              {editingId && (
                <Button type="button" variant="outline" className="text-destructive" onClick={() => openDeleteConfirm(editingId, closeModal)} disabled={saving}>
                  Sil
                </Button>
              )}
              <Button type="submit" disabled={saving || !form.label.trim()}>
                <Save className="h-4 w-4 mr-2" />
                Kaydet
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, id: null })}
        title="Etiketi Sil"
        description="Bu etiketi silmek istediğinize emin misiniz?"
        onConfirm={handleDelete}
      />
    </PageLayout>
  )
}
