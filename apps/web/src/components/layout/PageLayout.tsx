import { Link } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
  /** Başlık + açıklama satırının hemen altında tam genişlik araç çubuğu */
  headerToolbar?: ReactNode
  /** Kart/Liste sayfaları: footer sol içeriği (sayfalama, kayıt sayıları) */
  footerContent?: ReactNode
  /** Ayarlar/form sayfaları: footer sağ tarafı (kaydet vb. butonlar) */
  footerActions?: ReactNode
  /** İçerik alanı ref (Sığdır hesaplaması için) */
  contentRef?: React.RefObject<HTMLDivElement>
  /** İçerik alanı overflow - hidden: tablo gibi iç scroll için */
  contentOverflow?: 'auto' | 'hidden'
  /** false: footer'da © eSync+ gösterilmez */
  showFooterBranding?: boolean
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
  headerToolbar,
  footerContent,
  footerActions,
  contentRef,
  contentOverflow = 'auto',
  showFooterBranding = true,
  children,
}: PageLayoutProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sabit Header */}
      <header className="shrink-0 border-b theme-page-bg">
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-4 px-4 pt-4',
            headerToolbar ? 'pb-2' : 'pb-4'
          )}
        >
          <div className="flex min-w-0 items-center gap-4">
            {logo && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
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
              <h1 className="truncate text-2xl font-bold text-foreground">{title}</h1>
              {description && (
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          <div className="flex min-w-0 max-w-full shrink-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 sm:ml-auto sm:pb-0">
            {headerActions}
            {showRefresh && onRefresh && !headerToolbar && (
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
        </div>
        {headerToolbar ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3">
            {headerToolbar}
          </div>
        ) : null}
      </header>

      {/* Content */}
      <div ref={contentRef} className={`flex-1 min-h-0 flex flex-col p-4 theme-page-bg ${contentOverflow === 'hidden' ? 'overflow-hidden' : 'overflow-auto'}`}>
        {children}
      </div>

      {/* Sabit Footer - sol: sayfalama/kayıt sayıları, sağ: kaydet vb. butonlar */}
      <footer className="shrink-0 border-t theme-footer-bg px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">{footerContent}</div>
        <div className="flex items-center gap-2 shrink-0">
          {footerActions}
          {showFooterBranding && (
            <span className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} eSync+
            </span>
          )}
        </div>
      </footer>
    </div>
  )
}
