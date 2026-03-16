import { useState } from 'react'
import { Pencil } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { buildProductCode, type CategoryPathItem } from '@/lib/productCode'

export interface ProductCodeDisplayProps {
  categoryPath: CategoryPathItem[]
  brandCode: string
  supplierCode: string
  onSupplierCodeChange: (value: string) => void
  /** Paket/mamül/hizmet gibi tiplerde tedarikçi kodu düzenlenemez */
  supplierCodeEditable?: boolean
  /** Mevcut SKU (nokta ile ayrılmış). Verilirse son noktadan sonrası parse edilir */
  sku?: string
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
  supplierCodeEditable = true,
  sku: skuProp,
  placeholder = 'Kategori, marka ve tedarikçi kodu seçin',
  id,
  className,
}: ProductCodeDisplayProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editValue, setEditValue] = useState('')

  const builtPrefix = buildProductCode(categoryPath, brandCode, '')
  const builtFullCode = buildProductCode(categoryPath, brandCode, supplierCode)

  const { prefix, suffix, hasCode } =
    skuProp && skuProp.trim().length > 0
      ? (() => {
          const s = skuProp.trim()
          if (builtPrefix) {
            if (s.startsWith(builtPrefix + '.')) {
              return { prefix: builtPrefix, suffix: s.slice(builtPrefix.length + 1), hasCode: true }
            }
            if (s === builtPrefix) {
              return { prefix: builtPrefix, suffix: '', hasCode: true }
            }
          }
          return { prefix: builtPrefix, suffix: supplierCode, hasCode: true }
        })()
      : { prefix: builtPrefix, suffix: supplierCode, hasCode: builtFullCode.length > 0 }

  const canEdit = supplierCodeEditable && builtPrefix.length > 0

  const handleOpen = () => {
    if (!canEdit) return
    setEditValue(suffix)
    setModalOpen(true)
  }

  const handleSave = () => {
    onSupplierCodeChange(editValue.trim())
    setModalOpen(false)
  }

  const handleCancel = () => {
    setEditValue(suffix)
    setModalOpen(false)
  }

  return (
    <>
      <div className={`flex gap-0 ${className ?? ''}`}>
        <div
          role={canEdit ? 'button' : undefined}
          tabIndex={canEdit ? 0 : undefined}
          onClick={canEdit ? handleOpen : undefined}
          onKeyDown={(e) => canEdit && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleOpen())}
          id={id}
          className={`flex h-10 flex-1 min-w-0 items-center border border-input bg-muted/50 px-3 py-2 text-sm ${
            canEdit
              ? 'cursor-pointer rounded-l-md hover:bg-muted hover:border-primary/50'
              : 'cursor-default rounded-md text-muted-foreground'
          }`}
        >
          {hasCode ? (
            <span className="truncate font-mono">
              {prefix && <span className="text-muted-foreground">{prefix}</span>}
              {supplierCodeEditable && (
                <>
                  {prefix && <span className="text-muted-foreground">.</span>}
                  <span className="text-foreground">{suffix || <span className="text-muted-foreground italic">(boş)</span>}</span>
                </>
              )}
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
        </div>
        {canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleOpen}
                className="h-10 w-10 shrink-0 rounded-l-none rounded-r-md border-l-0"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Marka kodundan sonrasını düzenle</TooltipContent>
          </Tooltip>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kod Düzenle</DialogTitle>
            <DialogDescription>
              Marka kodundan sonraki kısım (tedarikçi kodu) düzenlenebilir.
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
              <Label htmlFor="product-code-editable">Marka kodundan sonrası</Label>
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
