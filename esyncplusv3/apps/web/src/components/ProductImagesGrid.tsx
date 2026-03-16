import { useRef, useState, useEffect } from 'react'
import { Upload, Link as LinkIcon, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getImageDisplayUrl } from '@/components/ImageInput'
import { API_URL } from '@/lib/api'
import { processToSquareWebP } from '@/lib/image-processor'

const SLOT_SIZE = 64
const ROWS = 5
const COLS = 2
const GAP = 8
const TOTAL_SLOTS = ROWS * COLS
const TARGET_SIZE = 1000
const GRID_HEIGHT = ROWS * SLOT_SIZE + (ROWS - 1) * GAP

function getImageExtension(blob: Blob): string {
  if (blob.type === 'image/webp') return 'webp'
  if (blob.type === 'image/svg+xml') return 'svg'
  if (blob.type === 'image/jpeg' || blob.type === 'image/jpg') return 'jpg'
  if (blob.type === 'image/gif') return 'gif'
  return 'png'
}

export interface ProductImagesGridProps {
  images: string[]
  onChange: (images: string[]) => void
  /** @deprecated Ürün görselleri her zaman images/products/ klasörüne kaydedilir */
  folderStorageKey?: string
}

export function ProductImagesGrid({
  images,
  onChange,
}: ProductImagesGridProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState(0)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkPreview, setLinkPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false)
  const [failedThumbnails, setFailedThumbnails] = useState<Set<number>>(new Set())
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const PRODUCT_IMAGES_FOLDER = 'images/products/'

  function getUploadFolder(): string {
    return PRODUCT_IMAGES_FOLDER
  }

  const paddedImages = [...images]
  while (paddedImages.length < TOTAL_SLOTS) paddedImages.push('')

  const selectedImage = paddedImages[selectedIndex] || paddedImages.find(Boolean) || ''
  const previewUrl = selectedImage ? getImageDisplayUrl(selectedImage) : ''

  useEffect(() => {
    setPreviewLoadFailed(false)
  }, [selectedImage, previewUrl])

  useEffect(() => {
    setFailedThumbnails(new Set())
  }, [images])

  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.setData('application/json', JSON.stringify({ index }))
  }

  function handleDragEnd() {
    setDragIndex(null)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault()
    const fromIndex = dragIndex
    if (fromIndex == null || fromIndex === dropIndex) return
    const next = [...paddedImages]
    const [dragged] = next.splice(fromIndex, 1)
    next.splice(dropIndex, 0, dragged)
    onChange(next)
    setDragIndex(null)
  }

  async function openModal(index: number) {
    setEditingIndex(index)
    setSelectedIndex(index)
    setLinkPreview(null)
    setError(null)
    setModalOpen(true)
    try {
      const text = await navigator.clipboard?.readText?.()
      const trimmed = (text || '').trim()
      if (trimmed && /^https?:\/\/.+/i.test(trimmed)) {
        setLinkUrl(trimmed)
      } else {
        setLinkUrl('')
      }
    } catch {
      setLinkUrl('')
    }
  }

  async function uploadBlob(blob: Blob, filename: string): Promise<string> {
    const folder = getUploadFolder()
    const formData = new FormData()
    formData.append('file', blob, filename)
    formData.append('folder', folder)

    const res = await fetch(`${API_URL}/storage/upload`, {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Yükleme başarısız')
    return json.path
  }

  async function deleteOldImage(oldPath: string): Promise<void> {
    if (!oldPath || oldPath.startsWith('http')) return
    try {
      await fetch(`${API_URL}/storage/delete?key=${encodeURIComponent(oldPath)}`, { method: 'DELETE' })
    } catch {
      /* ignore */
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    e.target.value = ''
    setUploading(true)
    setError(null)
    const htmlImg = new Image()
    htmlImg.src = URL.createObjectURL(file)
    htmlImg.onload = async () => {
      try {
        const blob = await processToSquareWebP(htmlImg, TARGET_SIZE)
        URL.revokeObjectURL(htmlImg.src)
        const ext = getImageExtension(blob)
        const path = await uploadBlob(blob, file.name.replace(/\.[^.]+$/, `.${ext}`))
        const oldPath = paddedImages[editingIndex]
        if (oldPath) await deleteOldImage(oldPath)
        const next = [...paddedImages]
        next[editingIndex] = path
        onChange(next)
        setModalOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Yükleme başarısız')
      } finally {
        setUploading(false)
      }
    }
    htmlImg.onerror = () => {
      setError('Görsel yüklenemedi')
      setUploading(false)
    }
  }

  async function handleLinkFetch() {
    if (!linkUrl.trim()) return
    setUploading(true)
    setError(null)
    setLinkPreview(null)
    try {
      let blob: Blob
      try {
        const res = await fetch(linkUrl)
        if (!res.ok) throw new Error('Görsel alınamadı')
        blob = await res.blob()
      } catch {
        const proxyUrl = `${API_URL}/storage/proxy-image?url=${encodeURIComponent(linkUrl)}`
        const res = await fetch(proxyUrl)
        if (!res.ok) throw new Error('Görsel alınamadı (CORS veya geçersiz link)')
        blob = await res.blob()
      }
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = URL.createObjectURL(blob)
      await new Promise<void>((r, reject) => {
        img.onload = () => r()
        img.onerror = () => reject(new Error('Görsel yüklenemedi'))
      })
      setLinkPreview(img.src)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Görsel alınamadı')
    } finally {
      setUploading(false)
    }
  }

  async function handleLinkConfirm() {
    if (!linkPreview) return
    setUploading(true)
    setError(null)
    try {
      const res = await fetch(linkPreview)
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) {
        throw new Error('Geçersiz görsel formatı')
      }
      let toUpload: Blob
      let ext: string
      if (blob.type === 'image/svg+xml') {
        toUpload = blob
        ext = 'svg'
      } else {
        const img = new Image()
        img.src = URL.createObjectURL(blob)
        try {
          await new Promise<void>((r, reject) => {
            img.onload = () => r()
            img.onerror = () => reject(new Error('Görsel yüklenemedi'))
          })
          try {
            toUpload = await processToSquareWebP(img, TARGET_SIZE)
            ext = getImageExtension(toUpload)
          } catch {
            toUpload = blob
            ext = blob.type === 'image/jpeg' || blob.type === 'image/jpg' ? 'jpg' : blob.type === 'image/gif' ? 'gif' : 'png'
          }
        } finally {
          URL.revokeObjectURL(img.src)
        }
      }
      const path = await uploadBlob(toUpload, `image.${ext}`)
      const oldPath = paddedImages[editingIndex]
      if (oldPath) await deleteOldImage(oldPath)
      const next = [...paddedImages]
      next[editingIndex] = path
      onChange(next)
      setModalOpen(false)
      setLinkUrl('')
      setLinkPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex gap-6 items-start">
      {/* Sol: 5 satır x 2 sütun kare avatar grid */}
      <div className="flex flex-col">
        <Label className="mb-2">Görüntü listesi</Label>
        <p className="text-xs text-muted-foreground mb-2">Sürükleyerek sıralayabilirsiniz</p>
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${COLS}, ${SLOT_SIZE}px)`, gap: GAP }}
        >
          {paddedImages.slice(0, TOTAL_SLOTS).map((path, idx) => (
            <div
              key={idx}
              role="button"
              tabIndex={0}
              onClick={() => openModal(idx)}
              onKeyDown={(e) => e.key === 'Enter' && openModal(idx)}
              draggable={!!path}
              onDragStart={(e) => path && handleDragStart(e, idx)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              className={`aspect-square w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors cursor-pointer select-none
                ${path ? 'border-muted-foreground/30 hover:border-primary/50 bg-muted/30' : 'border-muted-foreground/20 bg-muted/20'}
                ${dragIndex === idx ? 'opacity-50 ring-2 ring-primary' : ''}
                ${dragIndex != null && dragIndex !== idx ? 'ring-1 ring-primary/50' : ''}`}
            >
              {path && !failedThumbnails.has(idx) ? (
                <img
                  src={getImageDisplayUrl(path)}
                  alt={`Görsel ${idx + 1}`}
                  className="w-full h-full object-contain bg-white pointer-events-none"
                  onError={() => setFailedThumbnails((s) => new Set(s).add(idx))}
                  draggable={false}
                />
              ) : path && failedThumbnails.has(idx) ? (
                <span className="text-xs text-muted-foreground text-center px-1">Yüklenemedi</span>
              ) : (
                <Plus className="h-6 w-6 text-muted-foreground pointer-events-none" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sağ: Önizleme (sol grid ile aynı yükseklik) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Label className="mb-2 shrink-0">Önizleme</Label>
        <div
          className="rounded-lg border bg-white flex items-center justify-center overflow-hidden shrink-0"
          style={{ width: GRID_HEIGHT, height: GRID_HEIGHT }}
        >
          {previewUrl && !previewLoadFailed ? (
            <img
              src={previewUrl}
              alt="Önizleme"
              className="max-w-full max-h-full object-contain"
              style={{ maxWidth: GRID_HEIGHT, maxHeight: GRID_HEIGHT }}
              onError={() => setPreviewLoadFailed(true)}
            />
          ) : previewUrl && previewLoadFailed ? (
            <span className="text-sm text-muted-foreground text-center p-4">Görsel yüklenemedi</span>
          ) : (
            <span className="text-sm text-muted-foreground">Görsel seçin</span>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Görsel Ekle</DialogTitle>
            <DialogDescription>
              Yükleme veya linkten indirme ile görsel ekleyin
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex min-w-0 rounded-md border border-input bg-background overflow-hidden">
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Görsel URL yapıştırın"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleLinkFetch())}
                className="flex-1 min-w-0 border-0 rounded-l-md rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="rounded-none border-0 border-l h-10 shrink-0 px-3"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Yükle</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleLinkFetch}
                    disabled={uploading || !linkUrl.trim()}
                    className="rounded-r-md rounded-l-none border-0 border-l h-10 shrink-0 px-3"
                  >
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Linkten indir</TooltipContent>
              </Tooltip>
            </div>
            {linkPreview && (
              <div className="space-y-2">
                <Label>Önizleme</Label>
                <div className="flex items-center gap-4 p-4 border rounded-lg">
                  <div
                    className="h-16 w-16 shrink-0 rounded border bg-white"
                    style={{
                      backgroundImage: `url(${linkPreview})`,
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                    }}
                  />
                  <p className="text-sm text-muted-foreground">Kaydetmek için onaylayın.</p>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            {paddedImages[editingIndex] && (
              <div className="flex gap-2 mr-auto">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = [...paddedImages]
                        next[editingIndex] = ''
                        onChange(next)
                        setModalOpen(false)
                      }}
                      disabled={uploading}
                    >
                      Kaldır
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Üründen kaldır (storage'da kalır)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        const path = paddedImages[editingIndex]
                        const next = [...paddedImages]
                        next[editingIndex] = ''
                        onChange(next)
                        if (path && !path.startsWith('http')) {
                          try {
                            await fetch(`${API_URL}/storage/delete?key=${encodeURIComponent(path)}`, { method: 'DELETE' })
                          } catch { /* ignore */ }
                        }
                        setModalOpen(false)
                      }}
                      disabled={uploading}
                    >
                      Sil
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Üründen kaldır ve storage'dan sil</TooltipContent>
                </Tooltip>
              </div>
            )}
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={uploading}>
              İptal
            </Button>
            <Button onClick={handleLinkConfirm} disabled={!linkPreview || uploading}>
              {uploading ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
