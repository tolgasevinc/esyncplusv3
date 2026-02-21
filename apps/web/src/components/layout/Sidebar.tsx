import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { API_URL } from '@/lib/api'
import { getImageDisplayUrl } from '@/components/ImageInput'
import { getSidebarMenus, getSidebarHeader, SEPARATOR_COLORS } from '@/lib/sidebar-menus'
import { getModuleById } from '@/lib/app-modules'
import {
  Package,
  Moon,
  Sun,
  Bell,
  Settings,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Button, buttonVariants } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [menus, setMenus] = useState<ReturnType<typeof getSidebarMenus>>([])
  const [header, setHeader] = useState<ReturnType<typeof getSidebarHeader>>(getSidebarHeader())
  const location = useLocation()
  const { toggle, isDark } = useTheme()

  useEffect(() => {
    const load = () => {
      setMenus(getSidebarMenus())
      setHeader(getSidebarHeader())
    }
    load()
    window.addEventListener('esync-sidebar-menus-updated', load)
    window.addEventListener('storage', load)
    return () => {
      window.removeEventListener('esync-sidebar-menus-updated', load)
      window.removeEventListener('storage', load)
    }
  }, [])

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-border transition-all duration-300',
        collapsed ? 'w-[60px]' : 'w-64'
      )}
    >
      {/* Header - Sticky */}
        <header className={cn('sticky top-0 z-10 flex items-center justify-center p-4 bg-sidebar shrink-0 border-b border-gray-200 dark:border-gray-600 w-full')}>
        <Link to="/" className={cn('flex items-center gap-2 min-w-0', !collapsed && 'w-full justify-center')}>
          {header.logoPath ? (
            <div className="w-8 h-8 shrink-0 overflow-hidden flex items-center justify-center">
              <img
                src={getImageDisplayUrl(header.logoPath)}
                alt=""
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shrink-0">
              <Package className="w-5 h-5" />
            </div>
          )}
          {!collapsed && (
            <h1 className="font-bold text-lg text-foreground truncate">{header.title || 'eSync+'}</h1>
          )}
        </Link>
      </header>

      {/* Body - Scrollable */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-3">
          {menus.map((item) => {
            if (item.type === 'separator') {
              const colorClass = SEPARATOR_COLORS.find((c) => c.id === item.separatorColor)?.class ?? 'border-border'
              const thickness = item.separatorThickness ?? 1
              const thicknessClass = thickness >= 4 ? 'border-t-4' : thickness >= 2 ? 'border-t-2' : 'border-t'
              return (
                <div
                  key={item.id}
                  className={cn(thicknessClass, colorClass, 'my-2', collapsed && 'mx-2')}
                  role="separator"
                />
              )
            }
            const href =
              (item.moduleId ? getModuleById(item.moduleId)?.path : undefined) || item.link?.trim() || undefined
            const iconSrc = item.iconPath
              ? getImageDisplayUrl(item.iconPath)
              : item.iconDataUrl || ''
            const content = (
              <>
                {iconSrc ? (
                  <img
                    src={iconSrc}
                    alt=""
                    className="w-10 h-10 shrink-0 object-contain"
                  />
                ) : (
                  <Package className="w-10 h-10 shrink-0 opacity-50" />
                )}
                {!collapsed && <span>{item.label}</span>}
              </>
            )
            return href ? (
              <Link
                key={item.id}
                to={href}
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full justify-start gap-3',
                  collapsed && 'justify-center px-0',
                  location.pathname === href && 'bg-accent'
                )}
              >
                {content}
              </Link>
            ) : (
              <Button
                key={item.id}
                variant="ghost"
                className={cn(
                  'w-full justify-start gap-3',
                  collapsed && 'justify-center px-0'
                )}
              >
                {content}
              </Button>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <footer className={cn('shrink-0 p-3 space-y-3 border-t border-gray-200 dark:border-gray-600 w-full')}>
        {/* 5 Butonlar */}
        {collapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-full">
                <Settings className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-48">
              <DropdownMenuItem onClick={toggle}>
                {isDark ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                {isDark ? 'Açık Mod' : 'Koyu Mod'}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell className="w-4 h-4 mr-2" />
                Bildirimler
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/ayarlar">
                  <Settings className="w-4 h-4 mr-2" />
                  Ayarlar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/parametreler">
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Parametreler
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCollapsed(false)}>
                <ChevronRight className="w-4 h-4 mr-2" />
                Sidebar Aç
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center justify-between gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggle}>
                  {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isDark ? 'Açık moda geç' : 'Koyu moda geç'}</TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="icon">
              <Bell className="w-4 h-4" />
            </Button>
            <Link
              to="/ayarlar"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                location.pathname === '/ayarlar' && 'bg-accent'
              )}
            >
              <Settings className="w-4 h-4" />
            </Link>
            <Link
              to="/parametreler"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                location.pathname === '/parametreler' && 'bg-accent'
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(true)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* API bağlantısı - tüm işlemler (CRUD) bu adrese gider */}
        {!collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'px-2 py-1 rounded text-xs truncate',
                  API_URL.includes('localhost')
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground'
                )}
                title="Tüm API istekleri (okuma, yazma, silme) bu adrese gider"
              >
                {API_URL.includes('localhost') ? '⚠️ ' : ''}
                {API_URL.replace(/^https?:\/\//, '').split('/')[0]}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="font-medium">API: {API_URL}</p>
              <p className="text-xs mt-1 opacity-90">
                Tüm işlemler (ekleme, güncelleme, silme) bu sunucuya gider. D1 her zaman Cloudflare remote.
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Kullanıcı */}
        <div
          className={cn(
            'flex items-center gap-2',
            collapsed ? 'justify-center' : 'px-2'
          )}
        >
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src="" alt="Kullanıcı" />
            <AvatarFallback className="text-xs">TK</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Tolga Evinc</p>
              <p className="text-xs text-muted-foreground truncate">Admin</p>
            </div>
          )}
        </div>
      </footer>
    </aside>
  )
}
