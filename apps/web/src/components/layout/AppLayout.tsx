import { Sidebar } from './Sidebar'
import { API_URL } from '@/lib/api'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {import.meta.env.DEV && (
        <div
          className="fixed bottom-2 right-2 z-[9999] max-w-[min(100vw-1rem,24rem)] truncate rounded-md border border-amber-600/50 bg-amber-500/95 px-2 py-1 font-mono text-[10px] font-semibold text-amber-950 shadow-md"
          title="Bu şerit yalnızca Vite dev sunucusunda görünür. Production’da yoktur — tarayıcıda localhost kullandığını doğrula."
        >
          LOCAL · API: {API_URL.replace(/^https?:\/\//, '')}
        </div>
      )}
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden theme-body-bg">
        {children}
      </main>
    </div>
  )
}
