import { useRef, useState } from 'react'
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

const SLOT_SIZE = 64
const ROWS = 5
const COLS = 2
const GAP = 8
const TOTAL_SLOTS = ROWS * COLS
const TARGET_SIZE = 1000
const GRID_HEIGHT = ROWS * SLOT_SIZE + (ROWS - 1) * GAP

/** Görseli kare yap */
async function processToSquare(img: HTMLImageElement, targetSize: number): Promise<Blob> {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = targetSize
  canvas.height = targetSize
  const ctx = canvas.getContext('2d', { alpha: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, targetSize, targetSize)
  const scale = Math.min(targetSize / w, targetSize / h)
  const dw = w * scale
  const dh = h * scale
  const dx = (targetSize - dw) / 2
  const dy = (targetSize - dh) / 2
  ctx.drawImage(img, 0, 0, w, h, dx, dy, dw, dh)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Blob oluşturulamadı'))),
      'image/png',
      0.92
    )
  })
}

export interface ProductImagesGridProps {
  images: string[]
  onChange: (images: string[]) => void
  folderStorageKey: string
}

export function ProductImagesGrid({
  images,
  onChange,
  folderStorageKey,
}: ProductImagesGridProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState(0)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkPreview, setLinkPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const defaultFolder = 'images/'
  const folder = (typeof localStorage !== 'undefined' ? localStorage.getItem(folderStorageKey) : null) || defaultFolder

  const paddedImages = [...images]
  while (paddedImages.length < TOTAL_SLOTS) paddedImages.push('')

  const selectedImage = paddedImages[selectedIndex] || paddedImages.find(Boolean) || ''
  const previewUrl = selectedImage ? getImageDisplayUrl(selectedImage) : ''

  async function uploadBlob(blob: Blob, filename: string): Promise<string> {
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

  function openModal(index: number) {
    setEditingIndex(index)
    setSelectedIndex(index)
    setLinkUrl('')
    setLinkPreview(null)
    setError(null)
    setModalOpen(true)
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
        const blob = await processToSquare(htmlImg, TARGET_SIZE)
        URL.revokeObjectURL(htmlImg.src)
        const path = await uploadBlob(blob, file.name.replace(/\.[^.]+$/, '.png'))
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
      const img = new Image()
      img.src = linkPreview
      await new Promise<void>((r) => { img.onload = () => r() })
      const processed = await processToSquare(img, TARGET_SIZE)
      const path = await uploadBlob(processed, 'image.png')
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
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${COLS}, ${SLOT_SIZE}px)`, gap: GAP }}
        >
          {paddedImages.slice(0, TOTAL_SLOTS).map((path, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => openModal(idx)}
              className="aspect-square w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 bg-muted/30 flex items-center justify-center overflow-hidden transition-colors"
            >
              {path ? (
                <div
                  className="w-full h-full bg-white"
                  style={{
                    backgroundImage: `url(${getImageDisplayUrl(path)})`,
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                  }}
                  role="img"
                  aria-label={`Görsel ${idx + 1}`}
                />
              ) : (
                <Plus className="h-6 w-6 text-muted-foreground" />
              )}
            </button>
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
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Önizleme"
              className="max-w-full max-h-full object-contain"
              style={{ maxWidth: GRID_HEIGHT, maxHeight: GRID_HEIGHT }}
            />
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
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive"
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
