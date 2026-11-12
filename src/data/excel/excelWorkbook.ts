/**
 * Excel (.xlsx) read/write using ExcelJS, loaded on demand so it doesn't weigh
 * down the initial bundle. Works in the browser and in Node (for the script that
 * generates the sample files in /data).
 */
import type { Workbook, Worksheet } from 'exceljs'
import type { Cell } from '@/data/schema/rowCodec'

async function loadExcel() {
  const mod = await import('exceljs')
  return (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod
}

export interface SheetData {
  name: string
  columns: Array<{ key: string; header?: string; width?: number }>
  rows: Array<Record<string, Cell>>
}

function styleHeader(ws: Worksheet) {
  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5AA8' } }
  header.alignment = { vertical: 'middle' }
  header.height = 20
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

export async function buildWorkbook(sheets: SheetData[], meta: { title?: string } = {}): Promise<Workbook> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ClinicDesk'
  wb.title = meta.title ?? 'ClinicDesk export'
  wb.created = new Date()
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31))
    ws.columns = sheet.columns.map((col) => ({
      header: col.header ?? col.key,
      key: col.key,
      width: col.width ?? Math.min(48, Math.max(12, (col.header ?? col.key).length + 4)),
    }))
    // Store everything as plain values (dates stay ISO text) so round-trips are lossless.
    for (const row of sheet.rows) ws.addRow(row)
    styleHeader(ws)
    if (sheet.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } }
  }
  return wb
}

export async function workbookToBlob(wb: Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function cellValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: Array<{ text: string }>; hyperlink?: string }
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if (o.result !== undefined) return o.result
    if (o.text !== undefined) return o.text
    return null
  }
  return v
}

/** Reads every sheet into arrays of objects keyed by the header row. */
export async function readWorkbook(data: ArrayBuffer): Promise<Record<string, Array<Record<string, unknown>>>> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data)
  const out: Record<string, Array<Record<string, unknown>>> = {}
  wb.eachSheet((ws) => {
    const headers: string[] = []
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col] = String(cellValue(cell.value) ?? '').trim()
    })
    const rows: Array<Record<string, unknown>> = []
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return
      const obj: Record<string, unknown> = {}
      let any = false
      headers.forEach((h, col) => {
        if (!h) return
        const v = cellValue(row.getCell(col).value)
        if (v !== null && v !== '') any = true
        obj[h] = v
      })
      if (any) rows.push(obj)
    })
    out[ws.name] = rows
  })
  return out
}
