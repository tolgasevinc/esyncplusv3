import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { API_URL } from '@/lib/api'
import { getImageDisplayUrl } from '@/components/ImageInput'
import {
  Package,
  Users,
  Truck,
  Tag,
  Umbrella,
  Database,
  ShoppingCart,
  Store,
  Moon,
  Sun,
  Bell,
  Settings,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  FileText,
  LucideIcon,
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

const SIDEBAR_SEPARATOR = 'border-orange-500 border-t-2'

const ICONS_BASE = 'images/icons/'

function labelToIconPath(label: string): string {
  const tr = label
    .toLowerCase()
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
  return `${ICONS_BASE}icon-${tr}.png`
}

function MenuIcon({ label, iconPath, fallback: FallbackIcon }: { label: string; iconPath?: string; fallback: LucideIcon }) {
  const [error, setError] = useState(false)
  const path = iconPath ?? labelToIconPath(label)
  const src = getImageDisplayUrl(path)

  if (error) {
    return <FallbackIcon className="w-5 h-5 shrink-0" />
  }

  return (
    <img
      src={src}
      alt=""
      className="w-5 h-5 shrink-0 object-contain"
      onError={() => setError(true)}
    />
  )
}

type MenuItem = { label: string; icon: LucideIcon; iconPath?: string }

const menuGroups: MenuItem[][] = [
  [
    { label: 'Products', icon: Package, iconPath: 'images/icons/1771574151333-tn563lke5gr.png' },
    { label: 'Customers', icon: Users, iconPath: 'images/icons/1771574150973-3ot1twxfpq3.png' },
    { label: 'Suppliers', icon: Truck, iconPath: 'images/icons/1771574279698-dwfyqplj5ek.png' },
    { label: 'E-Documents', icon: FileText, iconPath: 'images/icons/1771575433321-8yvk6plup8y.webp' },
  ],
  [{ label: 'Offers', icon: Tag, iconPath: 'images/icons/1771574279885-9xi1myoa9n.png' }],
  [
    { label: 'Paraşüt', icon: Umbrella, iconPath: 'images/icons/1771575433902-gwz671434kc.webp' },
    { label: 'Dia', icon: Database, iconPath: 'images/icons/1771575433720-0xigytccnxpl.webp' },
  ],
  [
    { label: 'OKM', icon: ShoppingCart, iconPath: 'images/icons/1771575434113-1d9nide42zr.webp' },
    { label: 'Opencart', icon: Store, iconPath: 'images/icons/1771575433530-d1y2j84npq8.webp' },
    { label: 'Shopify', icon: Store, iconPath: 'images/icons/1771575113808-6fvfoeof6ei.webp' },
  ],
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { toggle, isDark } = useTheme()

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-border transition-all duration-300',
        collapsed ? 'w-[60px]' : 'w-64'
      )}
    >
      {/* Header - Sticky */}
        <header className={cn('sticky top-0 z-10 flex items-center gap-2 p-4 bg-sidebar shrink-0 border-b-2 border-orange-500', SIDEBAR_SEPARATOR)}>
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shrink-0">
            <Package className="w-5 h-5" />
          </div>
          {!collapsed && (
            <h1 className="font-bold text-lg text-foreground truncate">eSync+</h1>
          )}
        </Link>
      </header>

      {/* Body - Scrollable */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-3">
          {menuGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {groupIndex > 0 && (
                <div className={cn('my-3', SIDEBAR_SEPARATOR)} />
              )}
              {group.map((item) => {
                const href = item.label === 'Products' ? '/products' : undefined
                const content = (
                  <>
                    <MenuIcon label={item.label} iconPath={item.iconPath} fallback={item.icon} />
                    {!collapsed && <span>{item.label}</span>}
                  </>
                )
                return href ? (
                  <Link
                    key={item.label}
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
                    key={item.label}
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
          ))}
        </div>
      </nav>

      {/* Footer */}
      <footer className={cn('shrink-0 p-3 space-y-3', SIDEBAR_SEPARATOR)}>
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
                Tüm işlemler (ekleme, güncelleme, silme) bu sunucuya gider. localhost = yerel D1, deploy URL = Cloudflare D1.
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
