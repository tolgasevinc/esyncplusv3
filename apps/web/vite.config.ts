import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    // Build zamanı index.html'e timestamp ekle - cache busting
    {
      name: 'html-build-time',
      transformIndexHtml(html) {
        const ts = new Date().toISOString()
        return html.replace('</head>', `  <meta name="build-time" content="${ts}" />\n</head>`)
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // xslt-processor: workspace'te root node_modules'a hoist ediliyor
      'xslt-processor': path.resolve(__dirname, '../../node_modules/xslt-processor/index.mjs'),
    },
  },
  // .env dosyasının apps/web'den yüklendiğinden emin ol (monorepo'da cwd root olabilir)
  envDir: __dirname,
})
