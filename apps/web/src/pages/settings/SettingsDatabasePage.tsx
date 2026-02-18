import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageLayout } from '@/components/layout/PageLayout'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

interface TableInfo {
  name: string
  rowCount: number
  size: string
}

export function SettingsDatabasePage() {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTables = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/tables/info`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'API hatası')
      setTables(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTables()
  }, [fetchTables])

  return (
    <PageLayout
      title="Veritabanı Ayarları"
      description="Bağlı veritabanının tablo listesi, boyut ve kayıt sayıları"
      backTo="/ayarlar"
      showRefresh
      onRefresh={fetchTables}
    >
      <Card>
        <CardHeader>
          <CardTitle>Tablo Bilgileri</CardTitle>
          <CardDescription>
            Veritabanındaki tüm tablolar ve istatistikleri
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-muted-foreground">Yükleniyor...</p>}
          {error && <p className="text-destructive">{error}</p>}
          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Tablo Adı</th>
                    <th className="text-right py-3 px-4 font-medium">Kayıt Sayısı</th>
                    <th className="text-right py-3 px-4 font-medium">Boyut</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t) => (
                    <tr key={t.name} className="border-b last:border-0">
                      <td className="py-3 px-4">{t.name}</td>
                      <td className="py-3 px-4 text-right">{t.rowCount.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">{t.size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tables.length === 0 && (
                <p className="py-4 text-muted-foreground">Henüz tablo bulunmuyor.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}
