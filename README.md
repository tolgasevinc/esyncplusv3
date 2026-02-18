# Project V3

Cloudflare üzerinde çalışan Hono (API) + Vite (React) full-stack monorepo projesi.

## Yapı

```
project-v3/
├── apps/
│   ├── api/          # Hono - Cloudflare Workers
│   └── web/          # Vite + React + Tailwind + Shadcn - Cloudflare Pages
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Kurulum

```bash
# pnpm ile (önerilen - pnpm-workspace.yaml kullanır)
pnpm install

# veya npm ile (workspaces destekler)
npm install
```

> **Not:** pnpm kullanıyorsanız `pnpm run dev`, `pnpm run dev:api` gibi komutları kullanabilirsiniz.

## Geliştirme

```bash
# Her iki uygulamayı aynı anda çalıştır
npm run dev

# Sadece API (http://localhost:8787)
npm run dev:api

# Sadece Web (http://localhost:5173)
npm run dev:web
```

## Deploy

```bash
# API - Cloudflare Workers
npm run deploy:api

# Web - Cloudflare Pages
npm run deploy:web
```

## R2 Storage Kurulumu

Döküman, resim ve video depolama için R2 bucket oluşturun:

```bash
cd apps/api
npx wrangler r2 bucket create esync-storage
```

Migration'ı çalıştırın (storage_folders tablosu):

```bash
npx wrangler d1 migrations apply esync-db --remote
```

## Teknolojiler

- **API**: Hono, Cloudflare Workers, D1, R2, Wrangler
- **Web**: Vite, React, TypeScript, Tailwind CSS, Shadcn UI
