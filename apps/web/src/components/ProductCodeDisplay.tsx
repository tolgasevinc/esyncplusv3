import { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { buildProductCode, type CategoryPathItem } from '@/lib/productCode'

export interface ProductCodeDisplayProps {
  categoryPath: CategoryPathItem[]
  brandCode: string
  supplierCode: string
  onSupplierCodeChange: (value: string) => void
  placeholder?: string
  id?: string
  className?: string
}

/**
 * Oluşturulan kodu gösterir. Tıklanınca modal açılır; sadece son kısım (tedarikçi kodu) düzenlenebilir.
 */
export function ProductCodeDisplay({
  categoryPath,
  brandCode,
  supplierCode,
  onSupplierCodeChange,
  placeholder = 'Kategori, marka ve tedarikçi kodu seçin',
  id,
  className,
}: ProductCodeDisplayProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editValue, setEditValue] = useState('')

  const prefix = buildProductCode(categoryPath, brandCode, '')
  const fullCode = buildProductCode(categoryPath, brandCode, supplierCode)
  const hasCode = fullCode.length > 0

  const handleOpen = () => {
    if (!hasCode) return
    setEditValue(supplierCode)
    setModalOpen(true)
  }

  const handleSave = () => {
    onSupplierCodeChange(editValue.trim())
    setModalOpen(false)
  }

  const handleCancel = () => {
    setEditValue(supplierCode)
    setModalOpen(false)
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={hasCode ? handleOpen : undefined}
        onKeyDown={(e) => hasCode && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleOpen())}
        id={id}
        className={`flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm ${
          hasCode ? 'cursor-pointer hover:bg-muted hover:border-primary/50' : 'cursor-default text-muted-foreground'
        } ${className ?? ''}`}
      >
        {hasCode ? (
          <span className="truncate font-mono">
            {prefix && <span className="text-muted-foreground">{prefix}.</span>}
            <span className="text-foreground">{supplierCode || <span className="text-muted-foreground italic">(boş)</span>}</span>
          </span>
        ) : (
          <span>{placeholder}</span>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kod Düzenle</DialogTitle>
            <DialogDescription>
              Sadece son kısım (tedarikçi kodu) değiştirilebilir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {prefix && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Ön ek (değiştirilemez)</Label>
                <div className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm text-muted-foreground">
                  {prefix}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="product-code-editable">Tedarikçi kodu</Label>
              <Input
                id="product-code-editable"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Son kısım"
                className="font-mono"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              İptal
            </Button>
            <Button type="button" onClick={handleSave}>
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
