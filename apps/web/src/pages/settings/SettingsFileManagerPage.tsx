import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  Folder,
  File,
  ChevronRight,
  Home,
  Loader2,
  Trash2,
  Pencil,
  Move,
  Copy,
  Link2,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { PageLayout } from '@/components/layout/PageLayout'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { API_URL } from '@/lib/api'
import { getImageDisplayUrl } from '@/components/ImageInput'
import { cn } from '@/lib/utils'
import { toastSuccess, toastError } from '@/lib/toast'

interface ListItem {
  key: string
  size: number
  uploaded?: string
}

interface SubfolderStats {
  count: number
  size: number
  latestUploaded?: string
}

type FileSortBy = 'name' | 'uploaded'
type FileSortOrder = 'asc' | 'desc'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileExtension(key: string): string {
  const m = (key || '').match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toUpperCase() : ''
}

export function SettingsFileManagerPage() {
  const [folders, setFolders] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [contents, setContents] = useState<{
    subfolders: string[]
    files: ListItem[]
    subfolderStats: Record<string, SubfolderStats>
    allItems: ListItem[]
  }>({ subfolders: [], files: [], subfolderStats: {}, allItems: [] })
  const [loadingFolders, setLoadingFolders] = useState(true)
  const [loadingContents, setLoadingContents] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<string[]>([])
  const [previewItem, setPreviewItem] = useState<ListItem | null>(null)
  const [actionMode, setActionMode] = useState<'rename' | 'move' | 'copy' | null>(null)
  const [actionValue, setActionValue] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [mediaDimensions, setMediaDimensions] = useState<{ width: number; height: number } | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<FileSortBy>('name')
  const [sortOrder, setSortOrder] = useState<FileSortOrder>('asc')

  const fetchFolders = useCallback(async (prefix = '') => {
    setLoadingFolders(true)
    setError(null)
    try {
      const url = prefix
        ? `${API_URL}/storage/prefixes?prefix=${encodeURIComponent(prefix)}&r2_only=1`
        : `${API_URL}/storage/prefixes?r2_only=1`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Klasörler yüklenemedi')
      setFolders(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setFolders([])
    } finally {
      setLoadingFolders(false)
    }
  }, [])

  const fetchContents = useCallback(async (prefix: string) => {
    if (!prefix) {
      setContents({ subfolders: [], files: [], subfolderStats: {}, allItems: [] })
      return
    }
    setLoadingContents(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/storage/list?prefix=${encodeURIComponent(prefix)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'İçerik yüklenemedi')
      const items: ListItem[] = Array.isArray(data) ? data : []
      const subfolders = new Set<string>()
      const files: ListItem[] = []
      const subfolderStats: Record<string, SubfolderStats> = {}
      const baseLen = prefix.endsWith('/') ? prefix.length : prefix.length + 1
      for (const o of items) {
        let rest = (o.key || '').slice(baseLen)
        rest = rest.replace(/^\/+/, '')
        if (!rest) continue
        const slashIdx = rest.indexOf('/')
        if (slashIdx > 0) {
          const subName = rest.slice(0, slashIdx + 1)
          subfolders.add(subName)
          if (!subfolderStats[subName]) subfolderStats[subName] = { count: 0, size: 0 }
          subfolderStats[subName].count += 1
          subfolderStats[subName].size += o.size || 0
          const up = (o as { uploaded?: string }).uploaded
          if (up && (!subfolderStats[subName].latestUploaded || up > subfolderStats[subName].latestUploaded!)) {
            subfolderStats[subName].latestUploaded = up
          }
        } else if (!rest.includes('/')) {
          files.push(o)
        }
      }
      setContents({
        subfolders: Array.from(subfolders).sort(),
        files: files.sort((a, b) => (a.key || '').localeCompare(b.key || '')),
        subfolderStats,
        allItems: items,
      })
      setBreadcrumb(prefix ? prefix.replace(/\/$/, '').split('/').filter(Boolean) : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setContents({ subfolders: [], files: [], subfolderStats: {}, allItems: [] })
    } finally {
      setLoadingContents(false)
    }
  }, [])

  useEffect(() => {
    fetchFolders()
  }, [fetchFolders])

  useEffect(() => {
    if (selectedFolder) {
      fetchContents(selectedFolder)
    } else {
      setContents({ subfolders: [], files: [], subfolderStats: {}, allItems: [] })
      setBreadcrumb([])
    }
  }, [selectedFolder, fetchContents])

  const handleSubfolderClick = (name: string) => {
    const newPath = selectedFolder.endsWith('/')
      ? `${selectedFolder}${name}`
      : `${selectedFolder}/${name}`
    setSelectedFolder(newPath)
  }

  const handleBreadcrumbClick = (index: number) => {
    const path = breadcrumb.slice(0, index + 1).join('/') + '/'
    setSelectedFolder(path)
  }

  const isImage = (key: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(key)
  const isVideo = (key: string) => /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(key)
  const isPreviewable = (key: string) => isImage(key) || isVideo(key)

  const previewUrl = (key: string) =>
    key ? `${API_URL}/storage/serve?key=${encodeURIComponent(key)}` : ''

  const getFullUrl = (key: string) =>
    key ? `${API_URL}/storage/serve?key=${encodeURIComponent(key)}` : ''

  const handleCopyLink = () => {
    if (!previewItem?.key) return
    const url = getFullUrl(previewItem.key)
    navigator.clipboard.writeText(url).then(
      () => toastSuccess('Link kopyalandı', url),
      () => toastError('Link kopyalanamadı')
    )
  }

  const handleDelete = async () => {
    if (!previewItem?.key || !confirm('Bu dosyayı silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/storage/delete?key=${encodeURIComponent(previewItem.key)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Silinemedi')
      toastSuccess('Dosya silindi')
      setPreviewItem(null)
      if (selectedFolder) fetchContents(selectedFolder)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  const getParentPath = (key: string) => {
    const parts = (key || '').split('/').filter(Boolean)
    parts.pop()
    return parts.length ? parts.join('/') + '/' : ''
  }

  const getFileName = (key: string) => (key || '').split('/').pop() || ''

  const handleActionSubmit = async () => {
    if (!previewItem?.key || !actionMode || !actionValue.trim()) return
    setActionLoading(true)
    try {
      const from = previewItem.key
      let to = actionValue.trim()
      if (actionMode === 'rename') {
        const parent = getParentPath(from)
        to = parent ? `${parent}${to}` : to
      }
      if (!to) throw new Error('Hedef belirtilmedi')
      const endpoint = actionMode === 'copy' ? '/storage/copy' : '/storage/move'
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'İşlem başarısız')
      toastSuccess(actionMode === 'copy' ? 'Dosya kopyalandı' : 'Dosya taşındı')
      setActionMode(null)
      setActionValue('')
      setPreviewItem(null)
      if (selectedFolder) fetchContents(selectedFolder)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setActionLoading(false)
    }
  }

  const openRename = () => {
    setActionMode('rename')
    setActionValue(getFileName(previewItem?.key || ''))
  }
  const openMove = () => {
    setActionMode('move')
    setActionValue(getParentPath(previewItem?.key || ''))
  }
  useEffect(() => {
    setMediaDimensions(null)
  }, [previewItem?.key])

  const handleRefresh = useCallback(() => {
    fetchFolders()
    if (selectedFolder) fetchContents(selectedFolder)
  }, [fetchFolders, fetchContents, selectedFolder])

  const searchLower = search.trim().toLowerCase()
  const filteredSubfoldersRaw = searchLower
    ? contents.subfolders.filter((n) => n.replace(/\/$/, '').toLowerCase().includes(searchLower))
    : contents.subfolders
  const filteredFilesRaw = searchLower
    ? contents.files.filter((f) => (f.key || '').split('/').pop()?.toLowerCase().includes(searchLower))
    : contents.files

  const sortSubfolders = (arr: string[]) => {
    const mul = sortOrder === 'asc' ? 1 : -1
    return [...arr].sort((a, b) => {
      if (sortBy === 'name') {
        return mul * (a.replace(/\/$/, '').localeCompare(b.replace(/\/$/, '')))
      }
      const upA = contents.subfolderStats[a]?.latestUploaded || ''
      const upB = contents.subfolderStats[b]?.latestUploaded || ''
      return mul * (upA.localeCompare(upB) || a.localeCompare(b))
    })
  }
  const sortFiles = (arr: ListItem[]) => {
    const mul = sortOrder === 'asc' ? 1 : -1
    return [...arr].sort((a, b) => {
      if (sortBy === 'name') {
        return mul * ((a.key || '').localeCompare(b.key || ''))
      }
      const upA = a.uploaded || ''
      const upB = b.uploaded || ''
      return mul * (upA.localeCompare(upB) || (a.key || '').localeCompare(b.key || ''))
    })
  }
  const filteredSubfolders = sortSubfolders(filteredSubfoldersRaw)
  const filteredFiles = sortFiles(filteredFilesRaw)

  const handleSort = (by: FileSortBy) => {
    if (sortBy === by) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(by)
      setSortOrder(by === 'uploaded' ? 'desc' : 'asc')
    }
  }

  const openCopy = () => {
    setActionMode('copy')
    const parent = getParentPath(previewItem?.key || '')
    const base = getFileName(previewItem?.key || '')
    const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : ''
    const name = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base
    setActionValue(parent ? `${parent}${name}_kopya${ext}` : `${name}_kopya${ext}`)
  }

  return (
    <PageLayout
      title="Dosya Yöneticisi"
      description="Depolama klasörlerini görüntüleyin"
      backTo="/ayarlar"
      showRefresh
      onRefresh={handleRefresh}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Dosya veya klasör ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-56 h-9"
            />
          </div>
          {search.trim() && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setSearch('')}>
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Aramayı temizle</TooltipContent>
            </Tooltip>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-12rem)] min-h-[400px]">
        {/* Sol: Klasör listesi (2/12) */}
        <div className="col-span-2 min-w-[140px] flex flex-col border rounded-lg bg-muted/30 overflow-hidden">
          <div className="p-2 border-b bg-muted/50 shrink-0">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <FolderOpen className="h-4 w-4" />
              Klasörler
            </h3>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {loadingFolders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive p-2">{error}</p>
            ) : folders.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">Klasör bulunamadı</p>
            ) : (
              <ul className="space-y-0.5">
                {folders.map((path) => {
                  const label = path.replace(/\/$/, '').split('/').pop() || path
                  const isSelected = selectedFolder === path
                  return (
                    <li key={path}>
                      <button
                        type="button"
                        onClick={() => setSelectedFolder(path)}
                        className={cn(
                          'w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-1.5 truncate',
                          isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                        )}
                      >
                        <Folder className="h-4 w-4 shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Sağ: Klasör içeriği (10/12) */}
        <div className="col-span-10 flex flex-col border rounded-lg bg-background overflow-hidden min-w-0">
          {/* Breadcrumb */}
          {selectedFolder && (
            <div className="p-2 border-b bg-muted/30 shrink-0 flex items-center gap-1 text-sm">
              <button
                type="button"
                onClick={() => setSelectedFolder('')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted"
              >
                <Home className="h-4 w-4" />
              </button>
              {breadcrumb.map((part, i) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => handleBreadcrumbClick(i)}
                    className="px-1.5 py-0.5 rounded hover:bg-muted"
                  >
                    {part}
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {loadingContents ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-destructive">{error}</p>
            ) : !selectedFolder ? (
              <p className="text-muted-foreground text-center py-16">Klasör seçin</p>
            ) : (
              <>
                {(contents.files.length > 0 || contents.subfolders.length > 0) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <p className="text-sm text-muted-foreground">
                      Bu klasörde: {filteredFiles.length} dosya
                      {contents.subfolders.length > 0 &&
                        `, ${filteredSubfolders.length} alt klasör`}
                      {contents.files.length > 0 && ` · ${formatSize(contents.files.reduce((s, f) => s + (f.size || 0), 0))} boyut`}
                      {search.trim() && ` (filtre: ${filteredFiles.length}/${contents.files.length})`}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground mr-1">Sırala:</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={sortBy === 'name' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => handleSort('name')}
                          >
                            {sortBy === 'name' ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                            Ad
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>İsme göre sırala</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={sortBy === 'uploaded' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => handleSort('uploaded')}
                          >
                            {sortBy === 'uploaded' ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                            Tarih
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Eklenme tarihine göre sırala</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                {filteredSubfolders.map((name) => {
                  const stats = contents.subfolderStats[name]
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleSubfolderClick(name)}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Folder className="h-8 w-8 text-amber-500 shrink-0" />
                      <span className="text-xs truncate w-full text-center font-medium">{name.replace(/\/$/, '')}</span>
                      {stats && (
                        <span className="text-[10px] text-muted-foreground text-center">
                          {stats.count} dosya · {formatSize(stats.size)}
                        </span>
                      )}
                    </button>
                  )
                })}
                {filteredFiles.map((item) => {
                  const fileName = (item.key || '').split('/').pop() || item.key
                  const isImg = isImage(item.key || '')
                  const canPreview = isPreviewable(item.key || '')
                  const Wrapper = canPreview ? 'button' : 'div'
                  const wrapperProps = canPreview
                    ? { type: 'button' as const, onClick: () => setPreviewItem(item) }
                    : {}
                  return (
                    <Wrapper
                      key={item.key}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-2 rounded-lg border bg-card min-w-0',
                        canPreview && 'cursor-pointer hover:bg-muted/50 transition-colors'
                      )}
                      {...wrapperProps}
                    >
                      {isImg ? (
                        <img
                          src={getImageDisplayUrl(item.key || '')}
                          alt={fileName}
                          className="h-8 w-8 object-contain rounded shrink-0"
                        />
                      ) : (
                        <File className="h-8 w-8 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs truncate w-full text-center" title={fileName}>
                        {fileName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{formatSize(item.size || 0)}</span>
                    </Wrapper>
                  )
                })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && (setPreviewItem(null), setActionMode(null))}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 py-2 border-b shrink-0">
            <DialogTitle className="text-base truncate pr-8">
              {previewItem ? (previewItem.key || '').split('/').pop() : ''}
            </DialogTitle>
            {previewItem && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {getFileExtension(previewItem.key || '')} · {formatSize(previewItem.size || 0)}
                {mediaDimensions && ` · ${mediaDimensions.width}×${mediaDimensions.height} px`}
              </p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/30 min-h-[300px]">
            {previewItem && (
              <>
                {isImage(previewItem.key || '') ? (
                  <img
                    src={getImageDisplayUrl(previewItem.key || '')}
                    alt={(previewItem.key || '').split('/').pop() || ''}
                    className="max-w-full max-h-[70vh] object-contain"
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (img.naturalWidth && img.naturalHeight) {
                        setMediaDimensions({ width: img.naturalWidth, height: img.naturalHeight })
                      }
                    }}
                  />
                ) : isVideo(previewItem.key || '') ? (
                  <video
                    src={previewUrl(previewItem.key || '')}
                    controls
                    className="max-w-full max-h-[70vh]"
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget
                      if (v.videoWidth && v.videoHeight) {
                        setMediaDimensions({ width: v.videoWidth, height: v.videoHeight })
                      }
                    }}
                  />
                ) : null}
              </>
            )}
          </div>
          <DialogFooter className="flex-row justify-end gap-1 border-t px-4 py-2 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sil</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={openRename}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>İsim değiştir</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={openMove}>
                  <Move className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Taşı</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={openCopy}>
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Kopyala</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleCopyLink}>
                  <Link2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Linki kopyala</TooltipContent>
            </Tooltip>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionMode} onOpenChange={(open) => !open && (setActionMode(null), setActionValue(''))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionMode === 'rename' && 'İsim değiştir'}
              {actionMode === 'move' && 'Taşı'}
              {actionMode === 'copy' && 'Kopyala'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                {actionMode === 'rename' ? 'Yeni dosya adı' : 'Hedef yol'}
              </Label>
              <Input
                value={actionValue}
                onChange={(e) => setActionValue(e.target.value)}
                placeholder={actionMode === 'rename' ? 'dosya.png' : 'images/klasor/dosya.png'}
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => (setActionMode(null), setActionValue(''))}>
              İptal
            </Button>
            <Button onClick={handleActionSubmit} disabled={!actionValue.trim() || actionLoading}>
              {actionLoading ? '...' : actionMode === 'copy' ? 'Kopyala' : 'Tamam'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
