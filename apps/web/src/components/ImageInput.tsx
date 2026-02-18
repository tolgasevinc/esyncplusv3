import { useRef, useState } from 'react'
import { Upload, Link as LinkIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

/** Görsel path/URL'den görüntüleme URL'i oluştur */
export function getImageDisplayUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return ''
  if (pathOrUrl.startsWith('http')) return pathOrUrl
  return `${API_URL}/storage/serve?key=${encodeURIComponent(pathOrUrl)}`
}

export type ImageSize = 'brand' | 'product' | 'customer' | 'sidebar'

const SIZE_MAP: Record<ImageSize, number> = {
  brand: 50,
  product: 1000,
  customer: 50,
  sidebar: 50,
}

interface ImageInputProps {
  value: string
  onChange: (url: string) => void
  size?: ImageSize
  folderStorageKey: string
  placeholder?: string
}

/** Kenar rengini al (köşe piksellerinin ortalaması), tainted canvas'ta varsayılan döner */
function getEdgeColor(ctx: CanvasRenderingContext2D, w: number, h: number): string {
  try {
    const pixels = [
      ctx.getImageData(0, 0, 1, 1).data,
      ctx.getImageData(w - 1, 0, 1, 1).data,
      ctx.getImageData(0, h - 1, 1, 1).data,
      ctx.getImageData(w - 1, h - 1, 1, 1).data,
    ]
    let r = 0, g = 0, b = 0
    for (const p of pixels) {
      r += p[0]
      g += p[1]
      b += p[2]
    }
    return `rgb(${Math.round(r / 4)},${Math.round(g / 4)},${Math.round(b / 4)})`
  } catch {
    return '#f0f0f0'
  }
}

/** Görseli kare yap: kısa kenarı uzun kenara eşitle, eklenen alanları kenar rengiyle doldur */
async function processToSquare(
  img: HTMLImageElement,
  targetSize: number
): Promise<Blob> {
  const w = img.naturalWidth
  const h = img.naturalHeight

  const canvas = document.createElement('canvas')
  canvas.width = targetSize
  canvas.height = targetSize
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = w
  tempCanvas.height = h
  const tctx = tempCanvas.getContext('2d')!
  tctx.drawImage(img, 0, 0)
  const fillColor = getEdgeColor(tctx, w, h)

  ctx.fillStyle = fillColor
  ctx.fillRect(0, 0, targetSize, targetSize)

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

export function ImageInput({
  value,
  onChange,
  size = 'brand',
  folderStorageKey,
  placeholder = 'Görsel linki',
}: ImageInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkPreview, setLinkPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetSize = SIZE_MAP[size]
  const folder = (typeof localStorage !== 'undefined' ? localStorage.getItem(folderStorageKey) : null) || 'images/'


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

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    e.target.value = ''
    setUploading(true)
    setError(null)
    try {
      const htmlImg = new Image()
      htmlImg.src = URL.createObjectURL(file)
      await new Promise<void>((r, reject) => {
        htmlImg.onload = () => r()
        htmlImg.onerror = () => reject(new Error('Görsel yüklenemedi'))
      })
      const blob = await processToSquare(htmlImg, targetSize)
      URL.revokeObjectURL(htmlImg.src)
      const path = await uploadBlob(blob, file.name.replace(/\.[^.]+$/, '.png'))
      onChange(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yükleme başarısız')
    } finally {
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
      const processed = await processToSquare(img, targetSize)
      const url = await uploadBlob(processed, 'image.png')
      onChange(url)
      setLinkModalOpen(false)
      setLinkUrl('')
      setLinkPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          readOnly
          placeholder={placeholder}
          className="flex-1 bg-muted/50"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Yükle"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Linkten indir"
          onClick={() => {
            setLinkModalOpen(true)
            setLinkUrl('')
            setLinkPreview(null)
            setError(null)
          }}
          disabled={uploading}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      {value && (
        <div className="flex items-center gap-2">
          <img
            src={getImageDisplayUrl(value)}
            alt="Önizleme"
            className="h-12 w-12 object-contain rounded border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <span className="text-xs text-muted-foreground">{targetSize}x{targetSize} px</span>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Linkten Görsel İndir</DialogTitle>
            <DialogDescription>
              Web üzerindeki bir görselin URL adresini yapıştırın
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Görsel URL</Label>
              <div className="flex gap-2">
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  onKeyDown={(e) => e.key === 'Enter' && handleLinkFetch()}
                />
                <Button onClick={handleLinkFetch} disabled={uploading || !linkUrl.trim()}>
                  {uploading ? '...' : 'Getir'}
                </Button>
              </div>
            </div>
            {linkPreview && (
              <div className="space-y-2">
                <Label>Önizleme</Label>
                <div className="flex items-center gap-4 p-4 border rounded-lg">
                  <img src={linkPreview} alt="Önizleme" className="h-12 w-12 object-contain rounded border" />
                  <p className="text-sm text-muted-foreground">Görsel hazır. Kaydetmek için onaylayın.</p>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkModalOpen(false)} disabled={uploading}>
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
