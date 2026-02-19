import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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

const menuGroups = [
  [
    { label: 'Products', icon: Package },
    { label: 'Customers', icon: Users },
    { label: 'Suppliers', icon: Truck },
  ],
  [{ label: 'Offers', icon: Tag }],
  [
    { label: 'Paraşüt', icon: Umbrella },
    { label: 'Dia', icon: Database },
  ],
  [
    { label: 'OKM', icon: ShoppingCart },
    { label: 'Opencart', icon: Store },
    { label: 'Shopify', icon: Store },
  ],
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { toggle, isDark } = useTheme()

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-card border-r border-border transition-all duration-300',
        collapsed ? 'w-[60px]' : 'w-64'
      )}
    >
      {/* Header - Sticky */}
      <header className={cn('sticky top-0 z-10 flex items-center gap-2 p-4 bg-card shrink-0 border-b-2 border-orange-500', SIDEBAR_SEPARATOR)}>
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
              {group.map((item) => (
                <Button
                  key={item.label}
                  variant="ghost"
                  className={cn(
                    'w-full justify-start gap-3',
                    collapsed && 'justify-center px-0'
                  )}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Button>
              ))}
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
