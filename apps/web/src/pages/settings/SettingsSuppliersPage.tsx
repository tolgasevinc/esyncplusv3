import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLayout } from '@/components/layout/PageLayout'

const SOURCE_TYPES = [
  { value: 'excel', label: 'Excel' },
  { value: 'xml', label: 'XML' },
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
]

export function SettingsSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Array<{
    id: string
    name: string
    sourceType: string
    headerRow: number
    recordRowStart: number
  }>>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    sourceType: 'excel',
    headerRow: 1,
    recordRowStart: 2,
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSuppliers([
      ...suppliers,
      { ...form, id: crypto.randomUUID() },
    ])
    setForm({ name: '', sourceType: 'excel', headerRow: 1, recordRowStart: 2 })
    setShowForm(false)
  }

  return (
    <PageLayout
      title="Tedarikçiler"
      description="Tedarikçi kartları yönetimi"
      backTo="/ayarlar"
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Tedarikçi Kartları</CardTitle>
            <CardDescription>
              Tedarikçi adı, kaynak tipi, başlık satırı ve kayıt satır başlangıcı
            </CardDescription>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Tedarikçi Ekle
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {showForm && (
            <form onSubmit={handleAdd} className="p-4 border rounded-lg space-y-4 bg-muted/30">
              <div className="space-y-2">
                <Label>Tedarikçi Adı</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Örn: Tedarikçi A"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Kaynak Tipi</Label>
                <select
                  value={form.sourceType}
                  onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {SOURCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Başlık Satırı</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.headerRow}
                    onChange={(e) => setForm({ ...form, headerRow: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Kayıt Satır Başlangıcı</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.recordRowStart}
                    onChange={(e) => setForm({ ...form, recordRowStart: parseInt(e.target.value) || 2 })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit">Kaydet</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  İptal
                </Button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {suppliers.length === 0 && !showForm && (
              <p className="text-muted-foreground py-4">Henüz tedarikçi eklenmemiş.</p>
            )}
            {suppliers.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Kaynak: {SOURCE_TYPES.find(t => t.value === s.sourceType)?.label} • 
                    Başlık: {s.headerRow} • Kayıt başlangıç: {s.recordRowStart}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  )
}
