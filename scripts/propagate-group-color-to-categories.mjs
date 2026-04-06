#!/usr/bin/env node
/**
 * Ürün grubunda tanımlı rengi, o gruba bağlı ana ve alt kategorilere yazar (D1 / product_categories).
 *
 * Kullanım (repo kökü esyncplusv3 varsayılan):
 *   node scripts/propagate-group-color-to-categories.mjs              # uzak D1 (--remote)
 *   node scripts/propagate-group-color-to-categories.mjs --local      # yerel D1
 *   node scripts/propagate-group-color-to-categories.mjs --dry-run    # sadece önizleme SELECT
 *
 * Gereksinim: apps/api altında wrangler (npx wrangler).
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoScriptsDir = __dirname
const apiDir = path.join(repoScriptsDir, '..', 'apps', 'api')

const args = process.argv.slice(2)
const useLocal = args.includes('--local')
const dryRun = args.includes('--dry-run')

const sqlFile = path.join(
  repoScriptsDir,
  'sql',
  dryRun ? 'propagate-group-colors-to-categories-preview.sql' : 'propagate-group-colors-to-categories.sql'
)

const remoteFlag = useLocal ? '--local' : '--remote'
const wranglerArgs = ['wrangler', 'd1', 'execute', 'esync-db', remoteFlag, '--file', sqlFile]

console.log(`D1: esync-db (${useLocal ? 'local' : 'remote'})`)
console.log(dryRun ? 'Önizleme (UPDATE yok).' : 'UPDATE çalıştırılıyor…')
console.log(`SQL: ${sqlFile}\n`)

const result = spawnSync('npx', wranglerArgs, {
  cwd: apiDir,
  stdio: 'inherit',
  shell: true,
})

process.exit(result.status ?? 1)
