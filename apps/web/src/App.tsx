import { useState } from 'react';
import { Button } from '@/components/ui/button';

function App() {
  const [mesaj, setMesaj] = useState('Vite + React + Tailwind + Shadcn');

  async function veriGetir() {
    setMesaj('Veritabanına bağlanılıyor...');
    try {
      const response = await fetch('');
      const data = await response.json();
      // Veritabanındaki ilk kullanıcının adını ekrana yazalım
      setMesaj(data[0]?.name || 'Veritabanı boş!');
    } catch (hata) {
      setMesaj('Hata: API bağlantısı kurulamadı.');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <h1 className="text-4xl font-bold text-foreground">Hello World!</h1>
      <p className="text-muted-foreground">{mesaj}</p>
      <Button onClick={veriGetir}>Merhaba</Button>
    </div>
  );
}

export default App;
