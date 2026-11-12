/** Builds a minimal valid one-page PDF (ASCII text only) for synthetic sample reports. */
export function makeTinyPdf(title: string, lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const body = [
    'BT',
    '/F2 16 Tf',
    '56 780 Td',
    `(${esc(title)}) Tj`,
    '/F1 11 Tf',
    '0 -28 Td',
    '16 TL',
    ...lines.map((l) => `(${esc(l)}) Tj T*`),
    'ET',
  ].join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
  ]

  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefAt = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
