import { Button } from "@/components/ui/button";

function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground">
      <h1 className="text-4xl font-bold mb-4">Hello World</h1>
      <p className="text-muted-foreground mb-6">
        Vite + React + Tailwind + Shadcn on Cloudflare Pages
      </p>
      <Button>Merhaba Dünya</Button>
    </div>
  );
}

export default App;
