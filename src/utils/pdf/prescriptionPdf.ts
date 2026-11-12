/**
 * Builds a printable A4 prescription PDF with jsPDF (loaded on demand).
 * Uses the snapshot frozen at issue time, so the PDF of an old version shows
 * exactly what was issued. jsPDF's built-in fonts cover Latin text only;
 * use the browser "Print" option for names in other scripts.
 */
import type { PrescriptionWithItems } from '@/domain/types'
import { formatDate, formatDateTime } from '@/utils/dates'

const BLUE: [number, number, number] = [30, 90, 168]
const INK: [number, number, number] = [19, 40, 59]
const MUTED: [number, number, number] = [100, 118, 138]
const LINE: [number, number, number] = [221, 229, 236]

function latin(s: string): string {
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/°/g, ' deg ').replace(/[^\x20-\x7e\n]/g, '')
}

export async function buildPrescriptionPdf(rx: PrescriptionWithItems, opts: { signatureDataUrl?: string | null } = {}): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const s = rx.snapshot
  const W = doc.internal.pageSize.getWidth()
  const M = 16
  let y = 18

  // Letterhead
  doc.setFillColor(...BLUE)
  doc.rect(0, 0, W, 4, 'F')
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(latin(s.clinicName || 'Clinic'), M, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  const addr = doc.splitTextToSize(latin([s.clinicAddress, s.contactNumber].filter(Boolean).join('  |  ')), 95)
  doc.text(addr, M, y + 5.5)

  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(latin(s.doctorName), W - M, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  doc.text(latin([s.qualifications, s.specialization].filter(Boolean).join(', ')), W - M, y + 5.5, { align: 'right' })
  if (s.registrationNumber) doc.text(latin(`Reg. No. ${s.registrationNumber}`), W - M, y + 10.5, { align: 'right' })

  y = Math.max(y + 16, y + 5.5 + addr.length * 4.2 + 4)
  doc.setDrawColor(...LINE)
  doc.line(M, y, W - M, y)

  // Patient block
  y += 7
  const col2 = W / 2 + 4
  const label = (t: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text(t, x, yy)
  }
  const value = (t: string, x: number, yy: number, bold = false) => {
    doc.setFontSize(10.5)
    doc.setTextColor(...INK)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(latin(t), x, yy)
    doc.setFont('helvetica', 'normal')
  }
  label('Patient', M, y)
  label('Date', col2, y)
  value(`${s.patientName}`, M, y + 5, true)
  value(formatDate(rx.prescriptionDate), col2, y + 5)
  y += 11
  label('Age / Gender', M, y)
  label('Prescription', col2, y)
  value(`${s.patientAge} / ${s.patientGender}`, M, y + 5)
  value(`${rx.rxNumber}${rx.version > 1 ? `  (version ${rx.version})` : ''}`, col2, y + 5)
  y += 11
  label('Patient ID / Mobile', M, y)
  label('Diagnosis', col2, y)
  value(`${rx.patientId}  /  ${s.patientMobile}`, M, y + 5)
  const dx = doc.splitTextToSize(latin(rx.diagnosis || '-'), W - M - col2)
  doc.setFontSize(10.5)
  doc.setTextColor(...INK)
  doc.text(dx, col2, y + 5)
  y += 6 + Math.max(1, dx.length) * 4.6

  if (s.patientAllergies && !/^none/i.test(s.patientAllergies.trim())) {
    doc.setFillColor(252, 239, 238)
    doc.roundedRect(M, y, W - 2 * M, 8, 1.5, 1.5, 'F')
    doc.setTextColor(156, 50, 44)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(latin(`Allergies: ${s.patientAllergies}`), M + 3, y + 5.3)
    doc.setFont('helvetica', 'normal')
    y += 12
  } else {
    y += 3
  }

  // Rx mark
  doc.setFont('times', 'bolditalic')
  doc.setFontSize(22)
  doc.setTextColor(...BLUE)
  doc.text('Rx', M, y + 6)
  y += 10

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['#', 'Medicine', 'Dosage', 'Frequency', 'Timing', 'Duration', 'Qty']],
    body: rx.items.map((i, idx) => [
      String(idx + 1),
      latin(`${i.medicineName}${i.strength ? ' ' + i.strength : ''} (${i.dosageForm})${i.genericName && i.genericName !== i.medicineName ? `\n${i.genericName}` : ''}${i.instructions ? `\nNote: ${i.instructions}` : ''}`),
      latin(i.dosage),
      latin(i.frequency),
      latin(i.timing),
      latin(i.duration),
      latin(i.quantity || '-'),
    ]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9.5, textColor: INK, cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 }, lineColor: LINE, valign: 'top' },
    headStyles: { fontStyle: 'bold', textColor: MUTED, fontSize: 8.5, lineWidth: { bottom: 0.3 } },
    bodyStyles: { lineWidth: { bottom: 0.2 } },
    columnStyles: { 0: { cellWidth: 7 }, 1: { cellWidth: 62 } },
  })
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8

  const ensure = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      y = 20
    }
  }

  if (rx.instructions) {
    ensure(20)
    label('Advice', M, y)
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    const lines = doc.splitTextToSize(latin(rx.instructions), W - 2 * M)
    doc.text(lines, M, y + 5)
    y += 7 + lines.length * 4.4
  }
  if (rx.followUpDate) {
    ensure(12)
    label('Follow-up', M, y)
    value(formatDate(rx.followUpDate, 'EEEE, d MMMM yyyy'), M, y + 5, true)
    y += 12
  }

  // Signature
  ensure(34)
  const sigY = Math.max(y + 6, doc.internal.pageSize.getHeight() - 52)
  if (opts.signatureDataUrl) {
    try {
      const fmt = opts.signatureDataUrl.startsWith('data:image/png') ? 'PNG' : opts.signatureDataUrl.startsWith('data:image/webp') ? 'WEBP' : 'JPEG'
      doc.addImage(opts.signatureDataUrl, fmt, W - M - 50, sigY, 50, 16, undefined, 'FAST')
    } catch {
      /* unreadable signature image: leave the line blank */
    }
  }
  doc.setDrawColor(...MUTED)
  doc.line(W - M - 60, sigY + 18, W - M, sigY + 18)
  doc.setFontSize(9.5)
  doc.setTextColor(...INK)
  doc.text(latin(s.doctorName), W - M, sigY + 23, { align: 'right' })
  if (s.registrationNumber) {
    doc.setTextColor(...MUTED)
    doc.setFontSize(8.5)
    doc.text(latin(`Reg. No. ${s.registrationNumber}`), W - M, sigY + 27.5, { align: 'right' })
  }

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    const H = doc.internal.pageSize.getHeight()
    doc.setDrawColor(...LINE)
    doc.line(M, H - 14, W - M, H - 14)
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    const status = rx.status === 'Issued' ? '' : `  |  ${rx.status.toUpperCase()}: not valid for dispensing`
    doc.text(latin(`${rx.rxNumber} v${rx.version}  |  Issued ${formatDateTime(rx.issuedAt)}${status}`), M, H - 9)
    doc.text(`Page ${p} of ${pages}`, W - M, H - 9, { align: 'right' })
    if (rx.status !== 'Issued') {
      doc.setTextColor(194, 65, 58)
      doc.setFontSize(48)
      doc.setFont('helvetica', 'bold')
      doc.text(rx.status.toUpperCase(), W / 2, H / 2, { align: 'center', angle: 30 })
      doc.setFont('helvetica', 'normal')
    }
  }

  return doc.output('blob')
}
