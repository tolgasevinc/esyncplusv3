import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, Plus, SquarePen, Trash2, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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

interface OfferNoteOption {
  id: number
  category_id: number
  label: string
  sort_order: number
  enabled_by_default: number
}

interface OfferNoteCategory {
  id: number
  code: string
  label: string
  sort_order: number
  allow_custom: number
  options: OfferNoteOption[]
}

export function TeklifNotlariPage() {
  const [categories, setCategories] = useState<OfferNoteCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null)
  const [editCategoryLabel, setEditCategoryLabel] = useState('')
  const [editOptionId, setEditOptionId] = useState<number | null>(null)
  const [editOptionForm, setEditOptionForm] = useState({ label: '', enabled_by_default: 1 })
  const [addOptionCategoryId, setAddOptionCategoryId] = useState<number | null>(null)
  const [addOptionLabel, setAddOptionLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null; type: 'option' | null; onSuccess?: () => void }>({ open: false, id: null, type: null })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/offer-note-categories`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setCategories(json.data || [])
    } catch (err) {
      toastError('Yükleme hatası', err instanceof Error ? err.message : 'Yüklenemedi')
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openEditCategory = (cat: OfferNoteCategory) => {
    setEditCategoryId(cat.id)
    setEditCategoryLabel(cat.label)
  }

  const saveCategory = async () => {
    if (!editCategoryId || !editCategoryLabel.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/offer-note-categories/${editCategoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editCategoryLabel.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      setEditCategoryId(null)
      setEditCategoryLabel('')
      fetchData()
      toastSuccess('Kategori güncellendi')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const openAddOption = (categoryId: number) => {
    setAddOptionCategoryId(categoryId)
    setAddOptionLabel('')
  }

  const addOption = async () => {
    if (!addOptionCategoryId || !addOptionLabel.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/offer-note-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: addOptionCategoryId,
          label: addOptionLabel.trim(),
          enabled_by_default: 1,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Eklenemedi')
      setAddOptionCategoryId(null)
      setAddOptionLabel('')
      fetchData()
      toastSuccess('Seçenek eklendi')
    } catch (err) {
      toastError('Ekleme hatası', err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setSaving(false)
    }
  }

  const openEditOption = (opt: OfferNoteOption) => {
    setEditOptionId(opt.id)
    setEditOptionForm({ label: opt.label, enabled_by_default: opt.enabled_by_default ? 1 : 0 })
  }

  const saveOption = async () => {
    if (!editOptionId) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/offer-note-options/${editOptionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editOptionForm),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      setEditOptionId(null)
      setEditOptionForm({ label: '', enabled_by_default: 1 })
      fetchData()
      toastSuccess('Seçenek güncellendi')
    } catch (err) {
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const openDeleteOption = (id: number, onSuccess?: () => void) => {
    setDeleteConfirm({ open: true, id, type: 'option', onSuccess })
  }

  const deleteOption = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/offer-note-options/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Seçenek silindi')
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  return (
    <PageLayout title="Teklif Notları" description="Teklif çıktısında gösterilecek not kategorileri ve seçenekleri" backTo="/parametreler">
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-muted-foreground">Yükleniyor...</p>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="rounded-lg border">
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/30"
                    onClick={() => toggleExpand(cat.id)}
                  >
                    {expandedIds.has(cat.id) ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    <span className="font-medium flex-1">{cat.label}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        openEditCategory(cat)
                      }}
                    >
                      <SquarePen className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        openAddOption(cat.id)
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {expandedIds.has(cat.id) && (
                    <div className="border-t px-4 py-2 space-y-2 bg-muted/20">
                      {(cat.options || []).map((opt) => (
                        <div key={opt.id} className="flex items-center gap-2 py-1">
                          <Checkbox checked={!!opt.enabled_by_default} disabled />
                          <span className="flex-1 text-sm">{opt.label}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditOption(opt)}>
                            <SquarePen className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => openDeleteOption(opt.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {(!cat.options || cat.options.length === 0) && (
                        <p className="text-sm text-muted-foreground py-2">Henüz seçenek yok.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editCategoryId} onOpenChange={(o) => !o && setEditCategoryId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kategori Düzenle</DialogTitle>
            <DialogDescription>Kategori etiketini güncelleyin</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Etiket</Label>
            <Input value={editCategoryLabel} onChange={(e) => setEditCategoryLabel(e.target.value)} placeholder="Örn: Teslimat" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCategoryId(null)}>İptal</Button>
            <Button onClick={saveCategory} disabled={saving || !editCategoryLabel.trim()}>
              <Save className="h-4 w-4 mr-2" />
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editOptionId} onOpenChange={(o) => !o && setEditOptionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seçenek Düzenle</DialogTitle>
            <DialogDescription>Seçenek metnini ve varsayılan işaretini güncelleyin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Metin</Label>
              <Input value={editOptionForm.label} onChange={(e) => setEditOptionForm((f) => ({ ...f, label: e.target.value }))} placeholder="Seçenek metni" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={!!editOptionForm.enabled_by_default}
                onCheckedChange={(c) => setEditOptionForm((f) => ({ ...f, enabled_by_default: c ? 1 : 0 }))}
              />
              <Label>Varsayılan olarak işaretli</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOptionId(null)}>İptal</Button>
            <Button onClick={saveOption} disabled={saving || !editOptionForm.label.trim()}>
              <Save className="h-4 w-4 mr-2" />
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addOptionCategoryId} onOpenChange={(o) => !o && setAddOptionCategoryId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Seçenek Ekle</DialogTitle>
            <DialogDescription>Bu kategoriye yeni bir seçenek ekleyin</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Metin</Label>
            <Input value={addOptionLabel} onChange={(e) => setAddOptionLabel(e.target.value)} placeholder="Seçenek metni" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOptionCategoryId(null)}>İptal</Button>
            <Button onClick={addOption} disabled={saving || !addOptionLabel.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Ekle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => !o && setDeleteConfirm({ open: false, id: null, type: null })}
        title="Seçeneği Sil"
        description="Bu seçeneği silmek istediğinize emin misiniz?"
        onConfirm={async () => {
          if (deleteConfirm.id && deleteConfirm.type === 'option') {
            await deleteOption(deleteConfirm.id)
            deleteConfirm.onSuccess?.()
          }
          setDeleteConfirm({ open: false, id: null, type: null })
        }}
      />
    </PageLayout>
  )
}
