import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { API_URL } from '@/lib/api'

export interface PackageItem {
  item_product_id: number
  quantity: number
  item_name?: string
  item_sku?: string
}

interface ProductOption {
  id: number
  name: string
  sku?: string
}

export interface PackageContentsTabProps {
  packageItems: PackageItem[]
  onChange: (items: PackageItem[]) => void
  excludeProductId?: number
}

export function PackageContentsTab({
  packageItems,
  onChange,
  excludeProductId,
}: PackageContentsTabProps) {
  const [allProducts, setAllProducts] = useState<ProductOption[]>([])
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('')
  const [newQuantity, setNewQuantity] = useState<string>('1')

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch(`${API_URL}/api/products?limit=9999`)
        const json = await res.json()
        if (res.ok && json.data) {
          setAllProducts(json.data.map((p: { id: number; name: string; sku?: string }) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
          })))
        }
      } catch {
        setAllProducts([])
      }
    }
    fetchProducts()
  }, [])

  const availableProducts = allProducts.filter(
    (p) => p.id !== excludeProductId && !packageItems.some((i) => i.item_product_id === p.id)
  )

  function handleAdd() {
    if (!selectedProductId || !newQuantity || parseFloat(newQuantity) <= 0) return
    const prod = allProducts.find((p) => p.id === selectedProductId)
    onChange([
      ...packageItems,
      {
        item_product_id: selectedProductId,
        quantity: parseFloat(newQuantity),
        item_name: prod?.name,
        item_sku: prod?.sku,
      },
    ])
    setSelectedProductId('')
    setNewQuantity('1')
  }

  function handleRemove(index: number) {
    onChange(packageItems.filter((_, i) => i !== index))
  }

  function handleQuantityChange(index: number, value: number) {
    const next = [...packageItems]
    next[index] = { ...next[index], quantity: value }
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-2">
          <Label>Ürün</Label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : '')}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Seçin</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.sku ? `(${p.sku})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24 space-y-2">
          <Label>Adet</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          />
        </div>
        <Button type="button" variant="outline" size="icon" onClick={handleAdd} disabled={!selectedProductId}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Paket içeriği</Label>
        {packageItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Henüz ürün eklenmedi.</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {packageItems.map((item, idx) => {
              const name = item.item_name ?? allProducts.find((p) => p.id === item.item_product_id)?.name ?? `#${item.item_product_id}`
              return (
                <div key={idx} className="flex items-center gap-4 p-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{name}</span>
                    {item.item_sku && (
                      <span className="text-muted-foreground text-sm ml-2">({item.item_sku})</span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => handleQuantityChange(idx, parseFloat(e.target.value) || 0)}
                    className="w-24 h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(idx)}
                    className="text-destructive hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
