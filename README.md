# Project V3 - Full-stack Monorepo

Hono (Backend) ve Vite + React (Frontend) ile Cloudflare üzerinde çalışan monorepo projesi.

## Proje Yapısı

```
project-v3/
├── apps/
│   ├── api/          # Hono - Cloudflare Workers
│   └── web/          # Vite + React + Tailwind + Shadcn - Cloudflare Pages
├── package.json
└── pnpm-workspace.yaml
```

## Kurulum

```bash
pnpm install
```

## Geliştirme

Tüm uygulamaları aynı anda çalıştır:
```bash
pnpm dev
```

Sadece API (http://localhost:8787):
```bash
pnpm dev:api
```

Sadece Web (http://localhost:5173):
```bash
pnpm dev:web
```

## Build

```bash
pnpm build
```

## Deploy

Cloudflare hesabınızla deploy etmek için:

```bash
# API (Workers)
cd apps/api && pnpm deploy

# Web (Pages)
cd apps/web && pnpm deploy
```

## API Endpoints

- `GET /` - Hello World metni
- `GET /api/hello` - JSON response
