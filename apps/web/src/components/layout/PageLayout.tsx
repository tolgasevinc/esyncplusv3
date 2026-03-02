import { Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ReactNode } from 'react'

interface PageLayoutProps {
  title: string
  description?: string
  /** Header sol tarafında logo (img veya icon) */
  logo?: ReactNode
  backTo?: string
  onRefresh?: () => void
  showRefresh?: boolean
  /** Kart/Liste sayfaları: header sağ tarafı (arama, filtre, yeni, refresh, reset) */
  headerActions?: ReactNode
  /** Kart/Liste sayfaları: footer sol içeriği (sayfalama, kayıt sayıları) */
  footerContent?: ReactNode
  /** Ayarlar/form sayfaları: footer sağ tarafı (kaydet vb. butonlar) */
  footerActions?: ReactNode
  /** İçerik alanı ref (Sığdır hesaplaması için) */
  contentRef?: React.RefObject<HTMLDivElement>
  children: ReactNode
}

export function PageLayout({
  title,
  description,
  logo,
  backTo,
  onRefresh,
  showRefresh = false,
  headerActions,
  footerContent,
  footerActions,
  contentRef,
  children,
}: PageLayoutProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sabit Header */}
      <header className="shrink-0 flex items-start justify-between gap-4 p-4 border-b theme-page-bg">
        <div className="flex items-center gap-4 min-w-0">
          {logo && (
            <div className="shrink-0 w-9 h-9 flex items-center justify-center overflow-hidden rounded-lg bg-muted">
              {logo}
            </div>
          )}
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
      <div ref={contentRef} className="flex-1 overflow-auto p-4 theme-page-bg">
        {children}
      </div>

      {/* Sabit Footer - sol: sayfalama/kayıt sayıları, sağ: kaydet vb. butonlar */}
      <footer className="shrink-0 border-t theme-footer-bg px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">{footerContent}</div>
        <div className="flex items-center gap-2 shrink-0">
          {footerActions}
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} eSync+
          </span>
        </div>
      </footer>
    </div>
  )
}
