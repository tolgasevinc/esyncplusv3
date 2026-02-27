import { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Trash2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { API_URL } from '@/lib/api'

export interface PackageItem {
  item_product_id: number
  quantity: number
  item_name?: string
  item_sku?: string
  item_price?: number
}

interface ProductOption {
  id: number
  name: string
  sku?: string
  price?: number
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
  const [productSearch, setProductSearch] = useState('')
  const [productPopoverOpen, setProductPopoverOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (productPopoverOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [productPopoverOpen])

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch(`${API_URL}/api/products?limit=9999`)
        const json = await res.json()
        if (res.ok && json.data) {
          setAllProducts(json.data.map((p: { id: number; name: string; sku?: string; price?: number }) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: p.price,
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

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return availableProducts
    const q = productSearch.toLowerCase()
    return availableProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku?.toLowerCase().includes(q) ?? false)
    )
  }, [availableProducts, productSearch])

  const selectedProduct = allProducts.find((p) => p.id === selectedProductId)

  function addProductById(productId: number) {
    const prod = allProducts.find((p) => p.id === productId)
    const qty = parseFloat(newQuantity) || 1
    if (!prod || qty <= 0) return
    onChange([
      ...packageItems,
      {
        item_product_id: productId,
        quantity: qty,
        item_name: prod.name,
        item_sku: prod.sku,
        item_price: prod.price,
      },
    ])
    setSelectedProductId('')
    setNewQuantity('1')
    setProductPopoverOpen(false)
    setProductSearch('')
  }

  function handleAdd() {
    if (!selectedProductId) return
    addProductById(selectedProductId)
  }

  function handleSelectProduct(id: number) {
    setSelectedProductId(id)
    setProductSearch('')
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
    <div className="space-y-3">
      <div className="flex gap-2 items-end">
        <div className="flex-1 space-y-1.5">
          <Label className="text-sm">Ürün</Label>
          <Popover open={productPopoverOpen} onOpenChange={(open) => { setProductPopoverOpen(open); if (!open) setProductSearch('') }}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal h-9 text-sm"
              >
                <span className={cn(!selectedProductId && 'text-muted-foreground')}>
                  {selectedProduct
                    ? `${selectedProduct.name}${selectedProduct.sku ? ` (${selectedProduct.sku})` : ''}`
                    : 'Seçin'}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="p-2 border-b">
                <Input
                  ref={searchInputRef}
                  placeholder="Ürün ara..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const first = filteredProducts[0]
                      if (first) addProductById(first.id)
                    }
                  }}
                  className="h-8 text-sm"
                />
              </div>
              <div className="max-h-[220px] overflow-y-auto py-1">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectProduct(p.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm hover:bg-muted',
                      selectedProductId === p.id && 'bg-accent'
                    )}
                  >
                    {p.name}
                    {p.sku && <span className="text-muted-foreground ml-1">({p.sku})</span>}
                  </button>
                ))}
                {filteredProducts.length === 0 && availableProducts.length > 0 && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">Sonuç bulunamadı</div>
                )}
                {availableProducts.length === 0 && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">Eklenebilir ürün yok</div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="w-20 space-y-1.5">
          <Label className="text-sm">Adet</Label>
          <Input
            type="number"
            min="0.01"
            step={1}
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            className="h-9 text-sm"
          />
        </div>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handleAdd} disabled={!selectedProductId}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Paket içeriği</Label>
        {packageItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Henüz ürün eklenmedi.</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {packageItems.map((item, idx) => {
              const name = item.item_name ?? allProducts.find((p) => p.id === item.item_product_id)?.name ?? `#${item.item_product_id}`
              return (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5">
                  <div className="flex-1 min-w-0 truncate">
                    <span className="font-medium text-sm">{name}</span>
                    {item.item_sku && (
                      <span className="text-muted-foreground text-xs ml-1.5 font-mono">({item.item_sku})</span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0.01"
                    step={1}
                    value={item.quantity}
                    onChange={(e) => handleQuantityChange(idx, parseFloat(e.target.value) || 0)}
                    className="w-20 h-7 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(idx)}
                    className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
