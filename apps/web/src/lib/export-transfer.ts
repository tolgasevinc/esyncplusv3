/** Veri aktarım dışa aktarım - API'den veri çekip dosya üretir ve indirir */

import * as XLSX from 'xlsx'
import { API_URL } from '@/lib/api'
import type { TransferConfig, TransferColumn } from '@/pages/VeriAktarimPage'

/** API'den veri çeker */
export async function fetchExportData(dataSource: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${API_URL}/api/export/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataSource }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `HTTP ${res.status}`)
  }
  const json = await res.json()
  const data = json?.data ?? []
  return Array.isArray(data) ? data : []
}

/** Ham veriyi sütunlara göre satırlara dönüştürür */
export function buildRows(
  data: Record<string, unknown>[],
  columns: TransferColumn[],
  withHeader: boolean
): string[][] {
  const rows: string[][] = []
  if (withHeader && columns.length > 0) {
    rows.push(columns.map((c) => c.header || c.field || ''))
  }
  for (const row of data) {
    const values = columns.map((col) => {
      const val = col.field ? row[col.field] : ''
      if (val == null) return ''
      if (typeof val === 'object') return JSON.stringify(val)
      return String(val)
    })
    rows.push(values)
  }
  return rows
}

/** CSV içeriği üretir */
function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '')
          if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
            return `"${s.replace(/"/g, '""')}"`
          }
          return s
        })
        .join(',')
    )
    .join('\n')
}

/** TXT içeriği üretir (tab ile ayrılmış) */
function toTxt(rows: string[][]): string {
  return rows.map((row) => row.join('\t')).join('\n')
}

/** XML içeriği üretir */
function toXml(rows: string[][], columns: TransferColumn[], withHeader: boolean): string {
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n'
  const footer = '</root>'
  if (rows.length === 0) return header + footer
  const tagNames = columns.map((c, i) =>
    (c.header || c.field || `col${i}`).replace(/[^a-zA-Z0-9_-]/g, '_') || `col${i}`
  )
  const dataRows = withHeader && rows.length > 1 ? rows.slice(1) : rows
  const body = dataRows
    .map((row) => {
      const cells = row
        .map((val, i) => {
          const tag = tagNames[i] || `col${i}`
          const escaped = String(val ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
          return `  <${tag}>${escaped}</${tag}>`
        })
        .join('\n')
      return ' <row>\n' + cells + '\n </row>'
    })
    .join('\n')
  return header + body + '\n' + footer
}

/** Blob oluşturur ve indirir */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Config'e göre dosya üretir ve indirir */
export async function runExport(config: TransferConfig): Promise<void> {
  const { dataSource, outputFormat, columns, withHeader, name } = config
  if (!columns?.length) throw new Error('En az bir sütun gerekli')

  const data = await fetchExportData(dataSource)
  const rows = buildRows(data, columns, withHeader ?? false)

  const baseName =
    name?.trim() ||
    `export-${dataSource}-${new Date().toISOString().slice(0, 10)}`

  if (outputFormat === 'xlsx' || outputFormat === 'xls') {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Veri')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    downloadBlob(blob, `${baseName}.xlsx`)
    return
  }

  let content: string
  let mime: string
  let ext: string

  if (outputFormat === 'csv') {
    content = toCsv(rows)
    mime = 'text/csv;charset=utf-8'
    ext = 'csv'
  } else if (outputFormat === 'txt') {
    content = toTxt(rows)
    mime = 'text/plain;charset=utf-8'
    ext = 'txt'
  } else if (outputFormat === 'xml') {
    content = toXml(rows, columns, withHeader ?? false)
    mime = 'application/xml;charset=utf-8'
    ext = 'xml'
  } else {
    content = toCsv(rows)
    mime = 'text/csv;charset=utf-8'
    ext = 'csv'
  }

  const blob = new Blob(['\uFEFF' + content], { type: mime })
  downloadBlob(blob, `${baseName}.${ext}`)
}
