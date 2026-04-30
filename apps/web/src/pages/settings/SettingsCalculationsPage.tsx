import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Trash2, Save, Calculator } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_URL } from '@/lib/api'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { toastSuccess, toastError } from '@/lib/toast'
import {
  GENERAL_PRICE_FIELD,
  OPERATION_TYPES,
  generateId,
  type CalculationRule,
  type CalculationOperation,
  type OperationTypeId,
} from '@/lib/calculations'

const HESAPLAMALAR_CATEGORY = 'hesaplamalar'
const CALCULATIONS_KEY = 'calculations'

const emptyOperation: CalculationOperation = { type: 'add_percent', value: 18 }

function OperationRow({
  op,
  onChange,
  onRemove,
  canRemove,
}: {
  op: CalculationOperation
  onChange: (op: CalculationOperation) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div className="flex gap-2 items-center">
      <select
        value={op.type}
        onChange={(e) => onChange({ ...op, type: e.target.value as OperationTypeId })}
        className="flex h-9 flex-1 min-w-[140px] rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      >
        {OPERATION_TYPES.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
      <Input
        type="number"
        step={1}
        value={op.value ?? ''}
        onChange={(e) => onChange({ ...op, value: parseFloat(e.target.value) || 0 })}
        className="w-24 text-right tabular-nums"
      />
      {canRemove && (
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="shrink-0 h-9 w-9">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  )
}

interface PriceFieldOption {
  id: string
  label: string
}

interface CategoryOption {
  id: number
  name: string
  code?: string
  group_id?: number | null
  category_id?: number | null
  sort_order?: number
}

interface CategorySelectOption {
  id: number
  label: string
  sortLabel: string
}

function buildCategoryPathLabel(category: CategoryOption, byId: Map<number, CategoryOption>): string {
  const parts: string[] = []
  const seen = new Set<number>()
  let current: CategoryOption | undefined = category

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    parts.unshift(current.name)

    const parentId: number | null =
      current.category_id != null && current.category_id > 0
        ? current.category_id
        : current.group_id != null && current.group_id > 0
          ? current.group_id
          : null
    current = parentId != null ? byId.get(parentId) : undefined
  }

  return parts.join(' > ')
}

export function SettingsCalculationsPage() {
  const [calculations, setCalculations] = useState<CalculationRule[]>([])
  const [priceFields, setPriceFields] = useState<PriceFieldOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CalculationRule | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })
  const [error, setError] = useState<string | null>(null)

  const [currencies, setCurrencies] = useState<{ id: number; name: string }[]>([])
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])

  const categoryOptions = useMemo<CategorySelectOption[]>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    return categories
      .map((category) => {
        const label = buildCategoryPathLabel(category, byId)
        return {
          id: category.id,
          label,
          sortLabel: label.toLocaleLowerCase('tr'),
        }
      })
      .sort((a, b) => a.sortLabel.localeCompare(b.sortLabel, 'tr'))
  }, [categories])

  const categoryLabelById = useMemo(
    () => new Map(categoryOptions.map((category) => [category.id, category.label])),
    [categoryOptions]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, ptRes, curRes, brandsRes, categoriesRes] = await Promise.all([
        fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(HESAPLAMALAR_CATEGORY)}`),
        fetch(`${API_URL}/api/product-price-types?limit=9999`),
        fetch(`${API_URL}/api/product-currencies?limit=9999`),
        fetch(`${API_URL}/api/product-brands?limit=9999`),
        fetch(`${API_URL}/api/product-categories?limit=9999`),
      ])
      const ptJson = await ptRes.json()
      const curJson = await curRes.json()
      const brandsJson = await brandsRes.json()
      const categoriesJson = await categoriesRes.json()
      const ptList = ptJson?.data ?? []
      setCurrencies((curJson?.data ?? []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })))
      setBrands((brandsJson?.data ?? []).map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })))
      setCategories(
        (categoriesJson?.data ?? []).map((c: { id: number; name: string; code?: string; group_id?: number | null; category_id?: number | null; sort_order?: number }) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          group_id: c.group_id,
          category_id: c.category_id,
          sort_order: c.sort_order ?? 0,
        }))
      )
      const fields: PriceFieldOption[] = [
        GENERAL_PRICE_FIELD,
        ...ptList.map((pt: { id: number; name: string }) => ({ id: String(pt.id), label: pt.name })),
      ]
      setPriceFields(fields)
      const data = await settingsRes.json()
      if (settingsRes.ok && data?.[CALCULATIONS_KEY]) {
        try {
          const parsed = JSON.parse(data[CALCULATIONS_KEY])
          const calcs = Array.isArray(parsed) ? parsed : []
          setCalculations(calcs.map((c: CalculationRule) => ({
            ...c,
            target: c.target === 'ecommerce_price' ? '1' : c.target,
          })))
        } catch {
          setCalculations([])
        }
      } else {
        setCalculations([])
      }
    } catch {
      setCalculations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function openNew() {
    const firstTarget = priceFields.find((f) => f.id !== 'price')?.id ?? '1'
    setForm({
      id: generateId(),
      name: '',
      source: 'price',
      target: firstTarget,
      operations: [{ ...emptyOperation }],
      result_currency_id: null,
      brand_id: null,
      category_id: null,
    })
    setEditingId(null)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(calc: CalculationRule) {
    setForm({ ...calc })
    setEditingId(calc.id)
    setError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm(null)
    setError(null)
  }

  function openDeleteConfirm(id: string) {
    setDeleteConfirm({ open: true, id })
  }

  async function executeDelete() {
    const { id } = deleteConfirm
    if (!id) return
    setDeleting(true)
    try {
      const next = calculations.filter((c) => c.id !== id)
      const res = await fetch(`${API_URL}/api/app-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: HESAPLAMALAR_CATEGORY,
          settings: { [CALCULATIONS_KEY]: JSON.stringify(next) },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      setCalculations(next)
      setDeleteConfirm({ open: false, id: null })
      closeModal()
      toastSuccess('Silindi', 'Hesaplama kuralı kaldırıldı.')
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleting(false)
    }
  }

  function addOperation() {
    if (!form) return
    setForm({
      ...form,
      operations: [...form.operations, { ...emptyOperation }],
    })
  }

  function updateOperation(index: number, op: CalculationOperation) {
    if (!form) return
    const next = [...form.operations]
    next[index] = op
    setForm({ ...form, operations: next })
  }

  function removeOperation(index: number) {
    if (!form || form.operations.length <= 1) return
    setForm({
      ...form,
      operations: form.operations.filter((_, i) => i !== index),
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    if (!form.name?.trim()) {
      setError('Hesaplama adı gerekli.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const next = editingId
        ? calculations.map((c) => (c.id === editingId ? form : c))
        : [...calculations, form]
      const res = await fetch(`${API_URL}/api/app-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: HESAPLAMALAR_CATEGORY,
          settings: { [CALCULATIONS_KEY]: JSON.stringify(next) },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      setCalculations(next)
      closeModal()
      toastSuccess('Kaydedildi', 'Hesaplama kuralları güncellendi.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
      toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageLayout
      title="Hesaplamalar"
      description="Hesaplama ve fiyatlandırma kuralları"
      backTo="/ayarlar"
      showRefresh
      onRefresh={fetchData}
      headerActions={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={openNew}>
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Yeni hesaplama</TooltipContent>
        </Tooltip>
      }
    >
      <div className="grid grid-cols-12 gap-4">
        {loading ? (
          <div className="col-span-12 p-8 text-center text-muted-foreground">Yükleniyor...</div>
        ) : calculations.length === 0 ? (
          <div className="col-span-12 p-8 text-center text-muted-foreground">Henüz hesaplama kuralı yok.</div>
        ) : (
          calculations.map((calc) => (
            <button
              key={calc.id}
              type="button"
              onClick={() => openEdit(calc)}
              className="col-span-4 text-left"
            >
              <Card className="cursor-pointer transition-colors hover:bg-accent/50 h-full">
                <CardHeader className="flex flex-row items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Calculator className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{calc.name || 'İsimsiz'}</CardTitle>
                    <CardDescription>
                      {priceFields.find((f) => f.id === calc.source)?.label ?? calc.source} → {priceFields.find((f) => f.id === calc.target)?.label ?? calc.target}
                      {calc.brand_id != null && calc.brand_id > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          • {brands.find((b) => b.id === calc.brand_id)?.name ?? 'Marka'}
                        </span>
                      )}
                      {calc.category_id != null && calc.category_id > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          • {categoryLabelById.get(calc.category_id) ?? 'Kategori'}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </button>
          ))
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Hesaplama Düzenle' : 'Yeni Hesaplama'}</DialogTitle>
            <DialogDescription>Kaynak fiyattan hedef fiyata dönüşüm kuralı. Birden fazla işlem eklenebilir.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="calc-name">Hesaplama Adı</Label>
              <Input
                id="calc-name"
                value={form?.name ?? ''}
                onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })}
                placeholder="Örn: Genel → E-Ticaret"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calc-brand">Marka</Label>
              <select
                id="calc-brand"
                value={form?.brand_id != null && form.brand_id > 0 ? form.brand_id : ''}
                onChange={(e) => setForm((f) => f && { ...f, brand_id: e.target.value ? Number(e.target.value) : null })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Tümü</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Tümü seçilirse kural tüm markalar için geçerli olur.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="calc-category">Kategori</Label>
              <select
                id="calc-category"
                value={form?.category_id != null && form.category_id > 0 ? form.category_id : ''}
                onChange={(e) => setForm((f) => f && { ...f, category_id: e.target.value ? Number(e.target.value) : null })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Tümü</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Tümü seçilirse kural tüm kategoriler için geçerli olur.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kaynak Fiyat</Label>
                <select
                  value={form?.source ?? 'price'}
                  onChange={(e) => setForm((f) => f && { ...f, source: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {priceFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Hedef Fiyat</Label>
                <select
                  value={form?.target ?? '1'}
                  onChange={(e) => setForm((f) => f && { ...f, target: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {priceFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="result-currency">Sonuç Para Birimi</Label>
              <select
                id="result-currency"
                value={form?.result_currency_id != null && form.result_currency_id > 0 ? form.result_currency_id : ''}
                onChange={(e) => setForm((f) => f && { ...f, result_currency_id: e.target.value ? Number(e.target.value) : null })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Kaynak ile aynı</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Hesaplama sonucunun para birimi. Boş bırakılırsa kaynak fiyatın para birimi kullanılır.</p>
            </div>
            <div className="space-y-2">
              <Label>İşlemler</Label>
              <div className="space-y-2">
                {form?.operations.map((op, idx) => (
                  <OperationRow
                    key={idx}
                    op={op}
                    onChange={(o) => updateOperation(idx, o)}
                    onRemove={() => removeOperation(idx)}
                    canRemove={(form?.operations.length ?? 0) > 1}
                  />
                ))}
                <div className="flex gap-2 items-center">
                  <Button type="button" variant="outline" size="icon" onClick={addOperation} className="h-9 w-9 shrink-0">
                    <Save className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">İşlem ekle</span>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-row justify-between gap-4 sm:justify-between">
              <div className="flex items-center gap-4" />
              <div className="flex items-center gap-1">
                {editingId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={(e) => { e.preventDefault(); editingId && openDeleteConfirm(editingId) }}
                          disabled={saving}
                          className="text-destructive hover:text-destructive"
                        >
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
                      <Button type="submit" variant="outline" size="icon" disabled={saving || !form?.name?.trim()}>
                        <Save className="h-4 w-4" />
                      </Button>
                    </span>
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
        description="Bu hesaplamayı silmek istediğinize emin misiniz?"
        onConfirm={executeDelete}
        loading={deleting}
      />
    </PageLayout>
  )
}
