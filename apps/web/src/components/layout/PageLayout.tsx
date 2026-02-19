import { Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ReactNode } from 'react'

interface PageLayoutProps {
  title: string
  description?: string
  backTo?: string
  onRefresh?: () => void
  showRefresh?: boolean
  /** Kart/Liste sayfaları: header sağ tarafı (arama, filtre, yeni, refresh, reset) */
  headerActions?: ReactNode
  /** Kart/Liste sayfaları: footer içeriği (sayfalama, kayıt sayıları) */
  footerContent?: ReactNode
  children: ReactNode
}

export function PageLayout({
  title,
  description,
  backTo,
  onRefresh,
  showRefresh = false,
  headerActions,
  footerContent,
  children,
}: PageLayoutProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sabit Header */}
      <header className="shrink-0 flex items-start justify-between gap-4 p-4 border-b bg-background">
        <div className="flex items-center gap-4 min-w-0">
          {backTo && (
            <Link to={backTo}>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerActions}
          {showRefresh && onRefresh && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onRefresh}>
                  <RefreshCw className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Yenile</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto p-4">
        {children}
      </div>

      {/* Sabit Footer */}
      <footer className="shrink-0 border-t bg-background px-4 py-2 flex items-center justify-between gap-4">
        {footerContent ? (
          <>
            <div className="flex-1 min-w-0">{footerContent}</div>
            <div className="text-xs text-muted-foreground shrink-0">
              © {new Date().getFullYear()} eSync+
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} eSync+
          </div>
        )}
      </footer>
    </div>
  )
}
