import { useState, useEffect } from 'react'
import { Plus, Trash2, PanelLeft, GripVertical, Pencil, Minus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import {
  saveSidebarMenus,
  syncSidebarMenusToApi,
  getSidebarHeader,
  saveSidebarHeader,
  fetchSidebarMenus,
  fetchSidebarHeader,
  type SidebarMenuItem,
  SEPARATOR_COLORS,
  SEPARATOR_THICKNESSES,
} from '@/lib/sidebar-menus'
import { APP_MODULES } from '@/lib/app-modules'
import { toastSuccess, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { ImageInput, getImageDisplayUrl } from '@/components/ImageInput'

function genId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function SettingsGeneralPage() {
  const [menus, setMenus] = useState<SidebarMenuItem[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newLink, setNewLink] = useState('')
  const [newModuleId, setNewModuleId] = useState<string>('')
  const [newIconPath, setNewIconPath] = useState<string>('')
  const [editItem, setEditItem] = useState<SidebarMenuItem | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editLink, setEditLink] = useState('')
  const [editModuleId, setEditModuleId] = useState<string>('')
  const [editIconPath, setEditIconPath] = useState('')
  const [editSeparatorColor, setEditSeparatorColor] = useState('border')
  const [editSeparatorThickness, setEditSeparatorThickness] = useState(1)
  const [addSeparatorOpen, setAddSeparatorOpen] = useState(false)
  const [newSeparatorColor, setNewSeparatorColor] = useState('border')
  const [newSeparatorThickness, setNewSeparatorThickness] = useState(1)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [headerLogo, setHeaderLogo] = useState('')
  const [headerTitle, setHeaderTitle] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [menusData, headerData] = await Promise.all([
        fetchSidebarMenus(),
        fetchSidebarHeader(),
      ])
      setMenus(menusData)
      setHeaderLogo(headerData.logoPath || '')
      setHeaderTitle(headerData.title || 'eSync+')
    }
    load()
  }, [])

  const handleSaveMenus = (items: SidebarMenuItem[]) => {
    setMenus(items)
    saveSidebarMenus(items)
  }

  const handleSyncToDb = async () => {
    if (menus.length === 0) return
    setSyncing(true)
    try {
      await syncSidebarMenusToApi(menus)
      toastSuccess('Veritabanına aktarıldı', `${menus.length} menü öğesi kaydedildi.`)
    } catch (err) {
      toastError('Aktarım hatası', err instanceof Error ? err.message : 'Menüler aktarılamadı.')
    } finally {
      setSyncing(false)
    }
  }

  const handleAddMenu = () => {
    const label = newLabel.trim()
    const link = newLink.trim()
    const moduleId = newModuleId && newModuleId !== 'custom' ? newModuleId : undefined
    if (!label || !link) return
    const item: SidebarMenuItem = {
      id: genId(),
      type: 'menu',
      label,
      link,
      moduleId,
      iconPath: newIconPath || undefined,
    }
    handleSaveMenus([...menus, item])
    setNewLabel('')
    setNewLink('')
    setNewModuleId('')
    setNewIconPath('')
  }

  const handleAddSeparator = () => {
    const item: SidebarMenuItem = {
      id: genId(),
      type: 'separator',
      label: '',
      link: '',
      separatorColor: newSeparatorColor,
      separatorThickness: newSeparatorThickness,
    }
    handleSaveMenus([...menus, item])
    setAddSeparatorOpen(false)
  }

  const handleRemoveMenu = (id: string) => {
    handleSaveMenus(menus.filter((m) => m.id !== id))
  }

  const handleStartEdit = (item: SidebarMenuItem) => {
    setEditItem(item)
    setEditLabel(item.label)
    setEditLink(item.link)
    setEditModuleId(item.moduleId || '')
    setEditIconPath(item.iconPath || '')
    setEditSeparatorColor(item.separatorColor || 'border')
    setEditSeparatorThickness(item.separatorThickness ?? 1)
  }

  const handleSaveEdit = () => {
    if (!editItem) return
    const isSeparator = editItem.type === 'separator'
    const updated = menus.map((m) => {
      if (m.id !== editItem.id) return m
      if (isSeparator) {
        return { ...m, separatorColor: editSeparatorColor, separatorThickness: editSeparatorThickness }
      }
      const link = editLink.trim()
      return {
        ...m,
        label: editLabel.trim(),
        link,
        moduleId: editModuleId || undefined,
        iconPath: editIconPath || undefined,
      }
    })
    handleSaveMenus(updated)
    setEditItem(null)
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === targetIndex) return
    const newMenus = [...menus]
    const [removed] = newMenus.splice(draggedIndex, 1)
    newMenus.splice(targetIndex, 0, removed)
    handleSaveMenus(newMenus)
    setDraggedIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  return (
    <PageLayout
      title="Genel Ayarlar"
      description="Genel uygulama ayarları"
      backTo="/ayarlar"
    >
      <Tabs defaultValue="genel" className="space-y-4">
        <TabsList>
          <TabsTrigger value="genel">Genel</TabsTrigger>
          <TabsTrigger value="sidebar" className="gap-1.5">
            <PanelLeft className="h-4 w-4" />
            Sidebar
          </TabsTrigger>
        </TabsList>
        <TabsContent value="genel" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Genel Yapılandırma</CardTitle>
              <CardDescription>
                Uygulama genelinde geçerli ayarlar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Genel ayarlar formu burada yer alacak.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="sidebar" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Uygulama Logosu ve Başlığı</CardTitle>
              <CardDescription>
                Sidebar üstündeki logo ve uygulama adını özelleştirin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-2 min-w-[200px]">
                  <Label>Logo</Label>
                  <div className="flex items-end gap-2">
                    <ImageInput
                      value={headerLogo}
                      onChange={(v) => {
                        setHeaderLogo(v)
                        saveSidebarHeader({ ...getSidebarHeader(), logoPath: v || undefined })
                      }}
                      size="sidebar"
                      folderStorageKey="ikonlar-klasor"
                      preserveFilename
                      placeholder="Logo yükle"
                    />
                    {headerLogo && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setHeaderLogo('')
                          saveSidebarHeader({ ...getSidebarHeader(), logoPath: undefined })
                        }}
                      >
                        Kaldır
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  <Label htmlFor="header-title">Başlık</Label>
                  <Input
                    id="header-title"
                    value={headerTitle}
                    onChange={(e) => setHeaderTitle(e.target.value)}
                    onBlur={() => saveSidebarHeader({ ...getSidebarHeader(), title: headerTitle.trim() || 'eSync+' })}
                    placeholder="eSync+"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Menüler</CardTitle>
              <CardDescription>
                Sidebar menü öğelerini ve ayırıcıları ekleyin. Sıralamak için sürükleyin, düzenlemek için kalem ikonuna tıklayın. Veriler veritabanında saklanır.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg border bg-muted/30">
                <div className="space-y-2 flex-1">
                  <Label htmlFor="menu-module">Modül</Label>
                  <select
                    id="menu-module"
                    value={newModuleId}
                    onChange={(e) => setNewModuleId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Modül seçin...</option>
                    <option value="custom">custom</option>
                    {APP_MODULES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.path})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 flex-1">
                  <Label htmlFor="menu-label">Etiket</Label>
                  <Input
                    id="menu-label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Örn: Ürünler"
                  />
                </div>
                <div className="space-y-2 flex-1">
                  <Label htmlFor="menu-link">Link</Label>
                  <Input
                    id="menu-link"
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    placeholder="Örn: /products"
                  />
                </div>
                <div className="space-y-2 min-w-[200px]">
                  <Label>İkon</Label>
                  <ImageInput
                    value={newIconPath}
                    onChange={setNewIconPath}
                    size="sidebar"
                    folderStorageKey="ikonlar-klasor"
                    preserveFilename
                    placeholder="İkon yükle"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    onClick={handleAddMenu}
                    disabled={!newLabel.trim() || !newLink.trim()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Menü Ekle
                  </Button>
                  <Button variant="outline" onClick={() => setAddSeparatorOpen(true)}>
                    <Minus className="h-4 w-4 mr-2" />
                    Ayırıcı Ekle
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <Label>Öğeler ({menus.length})</Label>
                  {menus.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSyncToDb}
                      disabled={syncing}
                    >
                      {syncing ? 'Aktarılıyor...' : 'Veritabanına aktar'}
                    </Button>
                  )}
                </div>
                {menus.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Henüz menü eklenmedi.</p>
                ) : (
                  <>
                  <ul className="space-y-2">
                    {menus.map((item, index) => {
                      const isSeparator = item.type === 'separator'
                      const iconSrc = item.iconPath
                        ? getImageDisplayUrl(item.iconPath)
                        : item.iconDataUrl || ''
                      return (
                        <li
                          key={item.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', String(index))
                            handleDragStart(index)
                          }}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-3 p-3 rounded-lg border bg-background cursor-grab active:cursor-grabbing transition-opacity ${
                            draggedIndex === index ? 'opacity-50' : ''
                          } ${isSeparator ? 'py-2' : ''}`}
                        >
                          <div className="shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing" title="Sıralamak için sürükle">
                            <GripVertical className="h-4 w-4" />
                          </div>
                          {isSeparator ? (
                            <>
                              <div
                                className={cn(
                                  'flex-1 shrink min-w-[60px]',
                                  (item.separatorThickness ?? 1) >= 4
                                    ? 'border-t-4'
                                    : (item.separatorThickness ?? 1) >= 2
                                      ? 'border-t-2'
                                      : 'border-t',
                                  SEPARATOR_COLORS.find((c) => c.id === (item.separatorColor || 'border'))?.class ??
                                    'border-border'
                                )}
                              />
                              <span className="text-xs text-muted-foreground shrink-0">Ayırıcı</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartEdit(item)}
                                title="Düzenle"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              {iconSrc ? (
                                <div
                                  className="h-8 w-8 rounded border bg-white shrink-0"
                                  style={{ backgroundImage: `url(${iconSrc})`, backgroundSize: 'contain', backgroundPosition: 'center' }}
                                />
                              ) : (
                                <div className="h-8 w-8 rounded border bg-muted shrink-0" />
                              )}
                              <span className="font-medium flex-1">{item.label}</span>
                              <span className="text-sm text-muted-foreground truncate max-w-[120px]" title={item.link}>
                                {item.link || '—'}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartEdit(item)}
                                title="Düzenle"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMenu(item.id)}
                            title="Sil"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      )
                    })}
                  </ul>

                  <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>
                          {editItem?.type === 'separator' ? 'Ayırıcı Düzenle' : 'Menü Düzenle'}
                        </DialogTitle>
                        <DialogDescription>
                          {editItem?.type === 'separator'
                            ? 'Renk ve kalınlık seçin'
                            : 'Etiket, link ve ikonu güncelleyin'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        {editItem?.type === 'separator' ? (
                          <>
                            <div className="space-y-2">
                              <Label>Renk</Label>
                              <select
                                value={editSeparatorColor}
                                onChange={(e) => setEditSeparatorColor(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                {SEPARATOR_COLORS.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Kalınlık</Label>
                              <select
                                value={editSeparatorThickness}
                                onChange={(e) => setEditSeparatorThickness(Number(e.target.value))}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                {SEPARATOR_THICKNESSES.map((t) => (
                                  <option key={t.id} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="pt-2">
                              <Label className="text-xs text-muted-foreground">Önizleme</Label>
                              <div
                                className={cn(
                                  'mt-2',
                                  editSeparatorThickness >= 4
                                    ? 'border-t-4'
                                    : editSeparatorThickness >= 2
                                      ? 'border-t-2'
                                      : 'border-t',
                                  SEPARATOR_COLORS.find((c) => c.id === editSeparatorColor)?.class ?? 'border-border'
                                )}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label>Modül</Label>
                              <select
                                value={editModuleId || (editLink ? 'custom' : '')}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setEditModuleId(v === 'custom' ? '' : v)
                                }}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                <option value="">Modül seçin...</option>
                                <option value="custom">custom</option>
                                {APP_MODULES.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.label} ({m.path})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Etiket</Label>
                              <Input
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                placeholder="Örn: Ürünler"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Link</Label>
                              <Input
                                value={editLink}
                                onChange={(e) => setEditLink(e.target.value)}
                                placeholder="Örn: /products"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>İkon</Label>
                              <ImageInput
                                value={editIconPath}
                                onChange={setEditIconPath}
                                size="sidebar"
                                folderStorageKey="ikonlar-klasor"
                                preserveFilename
                                placeholder="İkon yükle"
                              />
                            </div>
                          </>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditItem(null)}>
                          İptal
                        </Button>
                        <Button onClick={handleSaveEdit}>
                          Kaydet
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={addSeparatorOpen} onOpenChange={setAddSeparatorOpen}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Ayırıcı Ekle</DialogTitle>
                        <DialogDescription>
                          Renk ve kalınlık seçin
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Renk</Label>
                          <select
                            value={newSeparatorColor}
                            onChange={(e) => setNewSeparatorColor(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {SEPARATOR_COLORS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label>Kalınlık</Label>
                          <select
                            value={newSeparatorThickness}
                            onChange={(e) => setNewSeparatorThickness(Number(e.target.value))}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {SEPARATOR_THICKNESSES.map((t) => (
                              <option key={t.id} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="pt-2">
                          <Label className="text-xs text-muted-foreground">Önizleme</Label>
                          <div
                            className={cn(
                              'mt-2',
                              newSeparatorThickness >= 4
                                ? 'border-t-4'
                                : newSeparatorThickness >= 2
                                  ? 'border-t-2'
                                  : 'border-t',
                              SEPARATOR_COLORS.find((c) => c.id === newSeparatorColor)?.class ?? 'border-border'
                            )}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAddSeparatorOpen(false)}>
                          İptal
                        </Button>
                        <Button onClick={handleAddSeparator}>
                          Ekle
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
