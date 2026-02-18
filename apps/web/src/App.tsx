import { Button } from '@/components/ui/button'

function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <h1 className="text-4xl font-bold text-foreground">Hello World!</h1>
      <p className="text-muted-foreground">Vite + React + Tailwind + Shadcn</p>
      <Button>Merhaba</Button>
    </div>
  )
}

export default App
