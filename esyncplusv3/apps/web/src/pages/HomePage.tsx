import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageLayout } from '@/components/layout/PageLayout'

import { API_URL } from '@/lib/api'

export function HomePage() {
  const [tablolar, setTablolar] = useState<string[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function tablolariGetir() {
    setYukleniyor(true)
    setHata(null)
    setTablolar([])
    try {
      const response = await fetch(`${API_URL}/tables`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'API hatası')
      }
      setTablolar(Array.isArray(data) ? data : [])
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'API bağlantısı kurulamadı.')
    } finally {
      setYukleniyor(false)
    }
  }

  return (
    <PageLayout
      title="Ana Sayfa"
      description="Veritabanı tablolarını görüntüleyin"
      showRefresh
      onRefresh={tablolariGetir}
    >
      <div className="flex flex-col items-center justify-center gap-4">
      <Button onClick={tablolariGetir} disabled={yukleniyor}>
        {yukleniyor ? 'Yükleniyor...' : 'Tabloları Göster'}
      </Button>

      {hata && (
        <p className="text-destructive font-medium">{hata}</p>
      )}

      {tablolar.length > 0 && (
        <div className="w-full max-w-md">
          <h2 className="text-lg font-semibold text-foreground mb-2">Veritabanı Tabloları</h2>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground bg-muted/50 rounded-lg p-4">
            {tablolar.map((tablo) => (
              <li key={tablo} className="text-foreground">
                {tablo}
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </PageLayout>
  )
}
