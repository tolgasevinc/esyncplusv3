/** Kenar rengini al (köşe piksellerinin ortalaması). Şeffaf köşelerde beyaz döner. */
function getEdgeColor(ctx: CanvasRenderingContext2D, w: number, h: number): string {
  try {
    const corners = [
      ctx.getImageData(0, 0, 1, 1).data,
      ctx.getImageData(w - 1, 0, 1, 1).data,
      ctx.getImageData(0, h - 1, 1, 1).data,
      ctx.getImageData(w - 1, h - 1, 1, 1).data,
    ]
    let r = 0, g = 0, b = 0, aSum = 0
    for (const p of corners) {
      r += p[0]
      g += p[1]
      b += p[2]
      aSum += p[3]
    }
    const avgA = aSum / 4
    if (avgA < 30) return '#ffffff'
    const luminance = (r + g + b) / 3 / 255
    if (luminance < 0.1) return '#ffffff'
    return `rgb(${Math.round(r / 4)},${Math.round(g / 4)},${Math.round(b / 4)})`
  } catch {
    return '#ffffff'
  }
}

export type ImageFormat = 'png' | 'jpeg' | 'webp'

const MIME_MAP: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export interface ProcessImageOptions {
  /** Kare boyut (px). null = orijinal boyut */
  size?: number | null
  /** Çıktı formatı. null = orijinal format */
  format?: ImageFormat | null
}

/**
 * Görseli yeniden boyutlandırır ve/veya format dönüştürür.
 * Tarayıcıda Canvas API ile işlenir.
 */
export async function processImage(
  file: File,
  options: ProcessImageOptions
): Promise<Blob> {
  const { size, format } = options
  const needsResize = size != null && size > 0
  const needsFormatChange = format != null
  const needsProcessing = needsResize || needsFormatChange

  if (!needsProcessing) {
    return file.slice(0, file.size, file.type)
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Görsel yüklenemedi'))
    image.src = URL.createObjectURL(file)
  })

  try {
    const w = img.naturalWidth
    const h = img.naturalHeight
    const targetSize = needsResize ? size! : Math.max(w, h)
    const outW = needsResize ? targetSize : w
    const outH = needsResize ? targetSize : h

    const ext = file.name.split('.').pop()?.toLowerCase()
    const origFormat: ImageFormat | null = ext === 'jpeg' || ext === 'jpg' ? 'jpeg' : ext === 'webp' ? 'webp' : 'png'
    const outFormat = format ?? origFormat
    const supportsAlpha = outFormat === 'png' || outFormat === 'webp'

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d', { alpha: true })!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    if (needsResize) {
      if (supportsAlpha) {
        ctx.clearRect(0, 0, outW, outH)
      } else {
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = w
        tempCanvas.height = h
        const tctx = tempCanvas.getContext('2d')!
        tctx.drawImage(img, 0, 0)
        const fillColor = getEdgeColor(tctx, w, h)
        ctx.fillStyle = fillColor
        ctx.fillRect(0, 0, targetSize, targetSize)
      }

      const scale = Math.min(targetSize / w, targetSize / h)
      const dw = w * scale
      const dh = h * scale
      const dx = (targetSize - dw) / 2
      const dy = (targetSize - dh) / 2
      ctx.drawImage(img, 0, 0, w, h, dx, dy, dw, dh)
    } else {
      ctx.clearRect(0, 0, outW, outH)
      ctx.drawImage(img, 0, 0)
    }

    const mimeType = MIME_MAP[outFormat]
    const quality = outFormat === 'jpeg' ? 0.92 : outFormat === 'webp' ? 1 : undefined

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Blob oluşturulamadı'))),
        mimeType,
        quality
      )
    })
  } finally {
    URL.revokeObjectURL(img.src)
  }
}
