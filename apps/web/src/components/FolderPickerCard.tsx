import { useState, useEffect } from 'react'
import { FolderOpen, Plus, Check } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ReactNode } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

interface FolderPickerCardProps {
  title: string
  description?: string
  icon?: ReactNode
  storageKey: string
}

export function FolderPickerCard({
  title,
  description,
  icon,
  storageKey,
}: FolderPickerCardProps) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [prefixes, setPrefixes] = useState<string[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) setValue(saved)
  }, [storageKey])

  useEffect(() => {
    if (!open) return
    setCurrentPath('')
    setNewFolderName('')
    fetchPrefixes('')
  }, [open])

  async function fetchPrefixes(prefix: string) {
    setLoading(true)
    try {
      const url = prefix
        ? `${API_URL}/storage/prefixes?prefix=${encodeURIComponent(prefix)}`
        : `${API_URL}/storage/prefixes`
      const res = await fetch(url)
      const data = await res.json()
      setPrefixes(Array.isArray(data) ? data : [])
    } catch {
      setPrefixes([])
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(path: string) {
    setValue(path)
    localStorage.setItem(storageKey, path)
    setOpen(false)
  }

  function handleNavigate(path: string) {
    setCurrentPath(path)
    fetchPrefixes(path)
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`${API_URL}/storage/folder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name: newFolderName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Oluşturulamadı')
      }
      const data = await res.json()
      setNewFolderName('')
      await fetchPrefixes(currentPath)
      if (data.path) handleSelect(data.path)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Klasör oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  const breadcrumbs = currentPath ? currentPath.split('/').filter(Boolean) : []
  const showRoot = !currentPath

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            value={value}
            readOnly
            placeholder="Klasör seçilmedi"
            className="flex-1 bg-muted/50"
          />
          <Button
            variant="outline"
            size="icon"
            title="Klasör seç"
            onClick={() => setOpen(true)}
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Klasör Seç: {title}</DialogTitle>
            <DialogDescription>
              Klasör seçin veya mevcut konumda yeni klasör oluşturun
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Breadcrumb / Konum */}
            {breadcrumbs.length > 0 && (
              <div className="flex flex-wrap gap-1 text-sm">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => handleNavigate('')}
                >
                  Kök
                </button>
                {breadcrumbs.map((part, i) => {
                  const path = breadcrumbs.slice(0, i + 1).join('/') + '/'
                  return (
                    <span key={path}>
                      <span className="text-muted-foreground mx-1">/</span>
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => handleNavigate(path.slice(0, -1))}
                      >
                        {part}
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Yeni klasör */}
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label>Mevcut konumda yeni klasör</Label>
                <div className="flex gap-2">
                  <Input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Klasör adı"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim() || creating}
                    title="Yeni klasör oluştur"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Klasör listesi */}
            <div className="space-y-2">
              <Label>Klasörler</Label>
              {loading ? (
                <p className="text-sm text-muted-foreground py-4">Yükleniyor...</p>
              ) : prefixes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 border rounded-lg text-center">
                  {currentPath ? 'Alt klasör bulunamadı' : 'Klasör bulunamadı'}
                </p>
              ) : (
                <ul className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-2">
                  {showRoot && (
                    <li className="flex items-center justify-between gap-2 py-2 px-2 rounded hover:bg-accent/50">
                      <span className="text-sm font-medium">/ (Kök)</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelect('')}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Seç
                      </Button>
                    </li>
                  )}
                  {prefixes.map((p) => {
                    const name = p.replace(/\/$/, '').split('/').pop() || p
                    const isFolder = p.endsWith('/')
                    const displayPath = isFolder ? p.slice(0, -1) : p
                    return (
                      <li
                        key={p}
                        className="flex items-center justify-between gap-2 py-2 px-2 rounded hover:bg-accent/50 group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="text-sm truncate">{name}</span>
                          {isFolder && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => handleNavigate(displayPath)}
                            >
                              Giriş
                            </Button>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelect(p)}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Seç
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
