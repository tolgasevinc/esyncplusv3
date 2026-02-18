import { useState, useEffect, useCallback } from 'react'
import { Cloud, Database, FolderOpen, Image, Package, Plus, Users } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLayout } from '@/components/layout/PageLayout'
import { FolderPickerCard } from '@/components/FolderPickerCard'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

interface StorageFolder {
  id: number
  name: string
  path: string
  type: string
  sort_order: number
}

export function SettingsStoragePage() {
  const [folders, setFolders] = useState<StorageFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [folderSelectOpen, setFolderSelectOpen] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedStoragePath, setSelectedStoragePath] = useState('')
  const [adding, setAdding] = useState(false)
  const [storagePrefixes, setStoragePrefixes] = useState<string[]>([])

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/storage/folders`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Yüklenemedi')
      setFolders(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFolders()
  }, [fetchFolders])

  useEffect(() => {
    if (!folderSelectOpen) return
    fetch(`${API_URL}/storage/prefixes`)
      .then((r) => r.json())
      .then((data) => setStoragePrefixes(Array.isArray(data) ? data : []))
      .catch(() => setStoragePrefixes([]))
  }, [folderSelectOpen])

  const dropdownOptions = [
    ...folders.map((f) => ({ id: String(f.id), path: f.path })),
    ...storagePrefixes
      .filter((p) => !folders.some((f) => f.path === p))
      .map((p) => ({ id: p, path: p })),
  ]
  const defaultOptions = [
    { id: 'documents', path: 'documents/' },
    { id: 'images', path: 'images/' },
    { id: 'videos', path: 'videos/' },
  ]
  const options = dropdownOptions.length > 0 ? dropdownOptions : defaultOptions

  async function handleAddFromStorage() {
    if (!selectedStoragePath) return
    setAdding(true)
    try {
      const path = selectedStoragePath.endsWith('/') ? selectedStoragePath : `${selectedStoragePath}/`
      const name = path.replace(/\/$/, '').split('/').pop() || path
      const res = await fetch(`${API_URL}/storage/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Eklenemedi')
      }
      await fetchFolders()
      setSelectedStoragePath('')
      setFolderSelectOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi')
    } finally {
      setAdding(false)
    }
  }

  async function handleAddNewFolder() {
    if (!newFolderName.trim()) return
    setAdding(true)
    try {
      const path = `${newFolderName.trim().toLowerCase().replace(/\s+/g, '-')}/`
      const res = await fetch(`${API_URL}/storage/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), path }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Oluşturulamadı')
      }
      await fetchFolders()
      setNewFolderName('')
      setShowNewFolder(false)
      setFolderSelectOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oluşturulamadı')
    } finally {
      setAdding(false)
    }
  }

  return (
    <PageLayout
      title="Depolama Ayarları"
      description="Depolama hizmetlerini yapılandırın"
      backTo="/ayarlar"
    >
      <Tabs defaultValue="folders" className="w-full">
        <TabsList>
          <TabsTrigger value="folders">Klasör Tanımları</TabsTrigger>
          <TabsTrigger value="folder-pick">Klasör Seçimi</TabsTrigger>
          <TabsTrigger value="storage">Mevcut Storage Bilgisi</TabsTrigger>
          <TabsTrigger value="gdrive">Google Drive</TabsTrigger>
          <TabsTrigger value="onedrive">OneDrive</TabsTrigger>
        </TabsList>

        <TabsContent value="folders">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Klasör Tanımları
              </CardTitle>
              <CardDescription>
                Uygulama içinde upload edilecek dosyaların kaydedileceği klasörleri belirleyin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dialog open={folderSelectOpen} onOpenChange={(open) => {
                setFolderSelectOpen(open)
                if (!open) {
                  setShowNewFolder(false)
                  setNewFolderName('')
                  setSelectedStoragePath('')
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Database className="h-4 w-4 mr-2" />
                    Mevcut Storage'dan Seç
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Klasör Seç</DialogTitle>
                    <DialogDescription>
                      Mevcut storage üzerinden klasör seçin veya yeni klasör oluşturun
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-2">
                        <Label>Klasör</Label>
                        <select
                          value={selectedStoragePath}
                          onChange={(e) => {
                            setSelectedStoragePath(e.target.value)
                            setShowNewFolder(false)
                          }}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Klasör seçin...</option>
                          {options.map((o) => (
                            <option key={o.path} value={o.path}>
                              {o.path}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          size="icon"
                          title="Yeni klasör"
                          onClick={() => {
                            setShowNewFolder(true)
                            setSelectedStoragePath('')
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {showNewFolder && (
                      <div className="space-y-2 pt-2 border-t">
                        <Label>Yeni Klasör Adı</Label>
                        <Input
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          placeholder="Örn: raporlar"
                        />
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setFolderSelectOpen(false)} disabled={adding}>
                      İptal
                    </Button>
                    {showNewFolder ? (
                      <Button onClick={handleAddNewFolder} disabled={!newFolderName.trim() || adding}>
                        {adding ? '...' : 'Oluştur'}
                      </Button>
                    ) : (
                      <Button onClick={handleAddFromStorage} disabled={!selectedStoragePath || adding}>
                        {adding ? '...' : 'Ekle'}
                      </Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="space-y-2">
                <Label>Tanımlı Klasörler (R2: döküman, resim, video)</Label>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {loading ? (
                  <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
                ) : folders.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 border rounded-lg text-center">
                    Henüz klasör tanımlanmamış. Migration çalıştırın veya yukarıdaki butonlarla ekleyin.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {folders.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{f.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {f.path} <span className="text-xs">({f.type})</span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="folder-pick">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Uygulama içinde kullanılacak özel klasörleri seçin. Klasör butonu ile listeden seçim yapın veya + ile mevcut konumda yeni klasör oluşturun.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FolderPickerCard
                title="Marka Logoları"
                description="Marka logolarının saklanacağı klasör"
                icon={<Image className="h-5 w-5" />}
                storageKey="marka-logolari-klasor"
              />
              <FolderPickerCard
                title="Ürün Görselleri"
                description="Ürün görsellerinin saklanacağı klasör"
                icon={<Package className="h-5 w-5" />}
                storageKey="urun-gorselleri-klasor"
              />
              <FolderPickerCard
                title="Müşteri Logoları"
                description="Müşteri logolarının saklanacağı klasör"
                icon={<Users className="h-5 w-5" />}
                storageKey="musteri-logolari-klasor"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="storage">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Mevcut Storage Bilgisi
              </CardTitle>
              <CardDescription>
                Cloudflare R2 - döküman, resim, video depolama
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4">
                <p className="font-medium">R2 Bucket: esync-storage</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Klasörler: documents/, images/, videos/
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gdrive">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Google Drive
              </CardTitle>
              <CardDescription>
                Google Drive entegrasyonu ayarları
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Google Drive bağlantı ayarlarını yapılandırın.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onedrive">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                OneDrive
              </CardTitle>
              <CardDescription>
                Microsoft OneDrive entegrasyonu ayarları
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                OneDrive bağlantı ayarlarını yapılandırın.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
