# eSync+ Project V3 - GitHub ve Cloudflare Deploy Dokümantasyonu

Bu dokümanda **Web** ve **API** uygulamalarının GitHub'a yüklenmesi ve Cloudflare'e deploy edilmesi adım adım anlatılmaktadır.

---

## Ön Gereksinimler

- **Node.js** ≥ 18
- **pnpm** (veya npm)
- **Git**
- **Cloudflare hesabı** (ücretsiz plan yeterli)
- **GitHub hesabı**

---

## 1. GitHub'a Yükleme

### 1.1 İlk Kurulum (Yeni Repo)

```bash
# Proje kök dizininde
cd /path/to/project-v3

# Git init (henüz yoksa)
git init

# Remote ekle
git remote add origin https://github.com/KULLANICI_ADI/REPO_ADI.git

# .gitignore kontrolü (node_modules, .env, dist vb. hariç tutulmalı)
```

### 1.2 Web ve API Ayrı Ayrı Yükleme

Monorepo yapısında **tek repo** kullanılır; web ve api `apps/` altındadır. Tüm proje birlikte push edilir:

```bash
git add .
git commit -m "feat: web ve api güncellemesi"
git push origin main
```

### 1.3 Sadece Belirli Uygulamayı Güncellemek

Değişiklikler `apps/web` veya `apps/api` içindeyse yine tüm repo push edilir. CI/CD ile otomatik deploy isterseniz `.github/workflows/` altında workflow tanımlanabilir.

---

## 2. Cloudflare'e Yükleme

### 2.1 Cloudflare Hesap Hazırlığı

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. **API Tokens**: [Profil → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - **Create Token** → **Edit Cloudflare Workers** şablonu
   - İzinler: **Account** - Workers Scripts (Edit), **D1** (Edit), **R2** (Edit)
   - Token'ı kopyalayıp `apps/api/.env` içine `CLOUDFLARE_API_TOKEN=...` olarak ekleyin

3. **Account ID**: Dashboard sağ üstten alın

### 2.2 D1 Veritabanı (API için)

D1 zaten `wrangler.toml` içinde tanımlı:

- **database_name**: `esync-db`
- **database_id**: `084b0070-ef9c-40f2-a34e-2a78356adb94`

İlk kez veya yeni migration varsa:

```bash
cd apps/api
npx wrangler d1 migrations apply esync-db --remote
```

### 2.3 R2 Storage (API için)

```bash
cd apps/api
npx wrangler r2 bucket create esyncplus-storage
```

`wrangler.toml` içinde `STORAGE` binding zaten tanımlı.

---

## 3. API Deploy (Cloudflare Workers)

### 3.1 Ortam Değişkenleri

`apps/api/.env`:

```
VITE_API_URL=https://project-v3-api.KULLANICI.workers.dev
CLOUDFLARE_API_TOKEN=your-token
```

### 3.2 Deploy Komutu

```bash
# Proje kökünden
npm run deploy:api

# veya doğrudan api dizininden
cd apps/api
npx wrangler deploy
```

### 3.3 Deploy Sonrası

- API URL: `https://project-v3-api.KULLANICI.workers.dev`
- Bu URL'yi web uygulamasının `VITE_API_URL` değişkeninde kullanın

---

## 4. Web Deploy (Cloudflare Pages)

### 4.1 Ortam Değişkenleri

`apps/web/.env` (build sırasında kullanılır):

```
# Canlı API adresi (deploy için)
VITE_API_URL=https://project-v3-api.KULLANICI.workers.dev

# Opsiyonel - Proje adı değiştiyse
# CLOUDFLARE_PAGES_PROJECT_NAME=yeni-proje-adi
```

### 4.2 Deploy Komutu

```bash
# Proje kökünden
npm run deploy:web

# veya doğrudan web dizininden
cd apps/web
npm run build
npx wrangler pages deploy dist --project-name=esyncplusv3
```

### 4.3 Proje Adı Özelleştirme

Cloudflare Pages'te farklı proje adı kullanıyorsanız:

```bash
CLOUDFLARE_PAGES_PROJECT_NAME=yeni-proje-adi npm run deploy:web
```

### 4.4 Özel Domain

Cloudflare Pages → Proje → **Custom domains** üzerinden özel domain eklenebilir.

- **Canlı adres:** https://www.e-syncplus.com
- Deploy sonrası terminal `.pages.dev` URL gösterebilir; özel domain ayrıca yapılandırılmıştır.

---

## 5. Sıralı Deploy (Önerilen)

API önce deploy edilmeli (web, API URL'ye bağımlı):

```bash
# 1. API deploy
npm run deploy:api

# 2. Web deploy (VITE_API_URL doğru olmalı)
npm run deploy:web
```

---

## 6. Yerel Geliştirme vs Deploy

| Ortam | Web URL | API URL | D1 |
|-------|---------|---------|-----|
| Yerel (`npm run dev`) | `http://localhost:5173` | `http://localhost:8787` | Cloudflare D1 (remote, `--remote` ile) |
| Deploy | https://www.e-syncplus.com | `https://project-v3-api.xxx.workers.dev` | Cloudflare D1 (remote) |

Yerel DB yok; her zaman Cloudflare D1 kullanılır.

---

## 7. Sık Karşılaşılan Hatalar

| Hata | Çözüm |
|------|--------|
| `10001` / Auth hatası | `CLOUDFLARE_API_TOKEN` doğru ve gerekli izinlere sahip mi kontrol edin |
| `484` / 404 API | `VITE_API_URL` trailing slash içermemeli; `lib/api.ts` normalize ediyor |
| D1 boş / veri yok | `npx wrangler d1 migrations apply esync-db --remote` çalıştırın |
| R2 bucket yok | `npx wrangler r2 bucket create esyncplus-storage` çalıştırın |
