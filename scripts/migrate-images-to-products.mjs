#!/usr/bin/env node
/**
 * images/ klasöründeki PNG dosyalarını images/products/ altına taşır.
 * API'nin çalışıyor olması gerekir (npm run dev -w api veya deploy edilmiş).
 *
 * Kullanım: node scripts/migrate-images-to-products.mjs [API_URL]
 * Örnek:   node scripts/migrate-images-to-products.mjs
 *          node scripts/migrate-images-to-products.mjs http://localhost:8787
 */

const API_URL = (process.argv[2] || process.env.VITE_API_URL || 'https://api.e-syncplus.com').replace(/\/+$/, '');

async function main() {
  console.log(`API: ${API_URL}`);
  console.log('images/*.png → images/products/ taşınıyor...\n');

  const res = await fetch(`${API_URL}/storage/migrate-images-to-products`, {
    method: 'POST',
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('API geçersiz yanıt döndü (muhtemelen HTML hata sayfası):');
    console.error(text.slice(0, 300));
    process.exit(1);
  }

  if (!res.ok) {
    console.error('Hata:', data.error || res.statusText);
    process.exit(1);
  }

  console.log(`Taşınan: ${data.moved} dosya`);
  if (data.movedKeys?.length) {
    data.movedKeys.forEach((k) => console.log('  ', k));
  }
  if (data.errors?.length) {
    console.log('\nHatalar:');
    data.errors.forEach((e) => console.log('  ', e.key, '-', e.error));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
