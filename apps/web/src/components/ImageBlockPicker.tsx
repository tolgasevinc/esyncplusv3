import { useState, useEffect, useCallback } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { API_URL } from '@/lib/api'

const ASSETS_PREFIX = 'assets/'
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

interface ImageBlockPickerProps {
  value: string
  onChange: (key: string) => void
  className?: string
}

export function ImageBlockPicker({ value, onChange, className }: ImageBlockPickerProps) {
  const [items, setItems] = useState<{ key: string; size: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/storage/list?prefix=${encodeURIComponent(ASSETS_PREFIX)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Liste yüklenemedi')
      const list: { key: string; size: number }[] = Array.isArray(data) ? data : []
      const images = list.filter((o) => {
        const k = (o.key || '').toLowerCase()
        return IMAGE_EXTS.some((ext) => k.endsWith(ext))
      })
      setItems(images)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  const getImageUrl = (key: string) =>
    `${API_URL}/storage/serve?key=${encodeURIComponent(key)}`

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 text-muted-foreground ${className || ''}`}>
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Yükleniyor...
      </div>
    )
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive ${className || ''}`}>
        {error}
        <p className="text-xs mt-2 text-muted-foreground">
          <code>assets/</code> klasörüne görsel yükleyin (Ayarlar {'>'} Dosya Yöneticisi veya Depolama).
        </p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={`rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm ${className || ''}`}>
        <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p>assets/ klasöründe görsel bulunamadı.</p>
        <p className="text-xs mt-1">Görsel eklemek için Ayarlar &gt; Depolama veya Dosya Yöneticisi kullanın.</p>
      </div>
    )
  }

  return (
    <div className={className || ''}>
      <p className="text-xs text-muted-foreground mb-2">R2 assets klasöründen görsel seçin:</p>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
        {items.map((item) => {
          const isSelected = value === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-colors ${
                isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
              }`}
            >
              <img
                src={getImageUrl(item.key)}
                alt={item.key.split('/').pop() || ''}
                className="w-full h-full object-contain bg-muted"
              />
            </button>
          )
        })}
      </div>
      {value && (
        <p className="text-xs text-muted-foreground mt-2 truncate">
          Seçili: {value}
        </p>
      )}
    </div>
  )
}
