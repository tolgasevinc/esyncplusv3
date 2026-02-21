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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { API_URL } from '@/lib/api'

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
  /** İkonlar klasörü için: orijinal dosya adı korunur, boyut/format işlemleri uygulanır */
  preserveFilename?: boolean
}

/** Görseli kare yap: kısa kenarı uzun kenara eşitle. Arkaplan şeffaflığı korunur. */
async function processToSquare(
  img: HTMLImageElement,
  targetSize: number
): Promise<Blob> {
  const w = img.naturalWidth
  const h = img.naturalHeight

  const canvas = document.createElement('canvas')
  canvas.width = targetSize
  canvas.height = targetSize
  const ctx = canvas.getContext('2d', { alpha: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Şeffaf arkaplan - eklenen alanlar (letterbox) şeffaf kalır
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

export function ImageInput({
  value,
  onChange,
  size = 'brand',
  folderStorageKey,
  placeholder = 'Görsel linki',
  preserveFilename = false,
}: ImageInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkPreview, setLinkPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetSize = SIZE_MAP[size]
  const defaultFolder = folderStorageKey === 'ikonlar-klasor' ? 'icons/' : 'images/'
  const folder = (typeof localStorage !== 'undefined' ? localStorage.getItem(folderStorageKey) : null) || defaultFolder

  async function uploadBlob(blob: Blob, filename: string, keepName: boolean): Promise<string> {
    const formData = new FormData()
    formData.append('file', blob, filename)
    formData.append('folder', folder)
    if (keepName) formData.append('preserveFilename', 'true')

    const res = await fetch(`${API_URL}/storage/upload`, {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Yükleme başarısız')
    return json.path
  }

  /** Storage'daki eski görseli sil (dış URL'ler hariç) */
  async function deleteOldImage(oldPath: string): Promise<void> {
    if (!oldPath || oldPath.startsWith('http')) return
    try {
      await fetch(`${API_URL}/storage/delete?key=${encodeURIComponent(oldPath)}`, { method: 'DELETE' })
    } catch {
      // Silme hatası sessizce geç - yeni görsel yüklendi
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    e.target.value = ''
    setUploading(true)
    setError(null)
    try {
      const isSvg = file.type === 'image/svg+xml'
      const uploadFilename = preserveFilename ? file.name : file.name.replace(/\.[^.]+$/, '.png')

      let blob: Blob
      if (isSvg && preserveFilename) {
        // SVG: işleme yapmadan orijinal olarak yükle
        blob = file
      } else {
        const htmlImg = new Image()
        htmlImg.src = URL.createObjectURL(file)
        await new Promise<void>((r, reject) => {
          htmlImg.onload = () => r()
          htmlImg.onerror = () => reject(new Error('Görsel yüklenemedi'))
        })
        blob = await processToSquare(htmlImg, targetSize)
        URL.revokeObjectURL(htmlImg.src)
      }

      const path = await uploadBlob(blob, uploadFilename, preserveFilename)
      if (value) await deleteOldImage(value)
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
      const linkFilename = preserveFilename ? 'icon.png' : 'image.png'
      const url = await uploadBlob(processed, linkFilename, preserveFilename)
      if (value) await deleteOldImage(value)
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

  const logoBoxSize = Math.max(targetSize, 40)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          className="shrink-0 rounded border bg-white flex items-center justify-center text-muted-foreground text-xs"
          style={{
            width: logoBoxSize,
            height: logoBoxSize,
            ...(value
              ? {
                  backgroundImage: `url(${getImageDisplayUrl(value)})`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                }
              : {}),
          }}
          role="img"
          aria-label={value ? 'Önizleme' : 'Logo'}
        >
          {!value && `${targetSize}×${targetSize}`}
        </div>
        <div className="flex-1 flex min-w-0 rounded-md border bg-background overflow-hidden">
          <Input
            value={value}
            readOnly
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-muted/50 border-0 rounded-l-md rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-none border-0 border-l h-9 shrink-0 px-3"
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
                onClick={() => {
                  setLinkModalOpen(true)
                  setLinkUrl('')
                  setLinkPreview(null)
                  setError(null)
                }}
                disabled={uploading}
                className="rounded-r-md rounded-l-none border-0 border-l h-9 shrink-0 px-3"
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Linkten indir</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
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
                  <div
                className="h-12 w-12 shrink-0 rounded border bg-white"
                style={{
                  backgroundImage: `url(${linkPreview})`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                }}
                role="img"
                aria-label="Önizleme"
              />
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
