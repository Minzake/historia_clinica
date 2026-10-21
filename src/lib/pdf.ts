import type { jsPDF as PdfDocument } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import type { UserOptions } from 'jspdf-autotable'
import { ageAt, bmi, formatDate, recordStructureError } from './model'
import type { Clinic, RecordDraft } from './model'

export type PdfKind = 'complete' | 'initial' | 'evolutions' | 'blank-evolution'
const left = 12
const width = 186
const right = left + width

function text(doc: PdfDocument, value: string, x: number, y: number, size = 7, bold = false) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  doc.text(value, x, y)
}

function lines(doc: PdfDocument, value: string, cellWidth: number, size = 7): string[] {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(size)
  return doc.splitTextToSize(value || ' ', cellWidth) as string[]
}

function clinicHeader(doc: PdfDocument, clinic: Clinic) {
  let y = 10
  for (const [value, size, bold] of [
    [clinic.name || 'Consultorio de podología', 9, true],
    [[clinic.professional, clinic.license && `Matrícula: ${clinic.license}`].filter(Boolean).join(' · '), 7, false],
    [[clinic.address, clinic.phone, clinic.email].filter(Boolean).join(' · '), 6, false],
  ] as const) {
    if (!value) continue
    const wrapped = lines(doc, value.replace(/\s+/g, ' '), width, size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(wrapped, left, y)
    y += wrapped.length * size * 25.4 / 72 * 1.2 + 2
  }
  doc.line(left, y, right, y)
  return y + 7
}

export async function buildPdf(record: RecordDraft, clinic: Clinic, kind: PdfKind = 'complete') {
  if (recordStructureError(record)) throw new Error('INVALID_RECORD')
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  doc.setLineHeightFactor(1.2)
  doc.setDrawColor(30)
  doc.setTextColor(20)
  doc.setLineWidth(0.3)
  const { patient, clinical, evolutions } = record
  const initialPages = new Set<number>()
  const headerBottom = clinicHeader(doc, clinic)
  const tableTop = headerBottom + 5

  function initialHeader() {
    const number = doc.getCurrentPageInfo().pageNumber
    if (initialPages.has(number)) return
    initialPages.add(number)
    if (number !== 1) clinicHeader(doc, clinic)
    text(doc, `HISTORIA CLÍNICA${number > 1 ? ' · CONTINUACIÓN' : ''}`, left, headerBottom, 10, true)
  }

  function table(options: UserOptions) {
    autoTable(doc, {
      theme: 'grid', margin: { left, right: left, top: tableTop, bottom: 17 }, tableWidth: width,
      styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 1.2, textColor: 20, lineColor: 30, lineWidth: 0.25, overflow: 'linebreak' },
      headStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: 'bold' },
      didDrawPage: initialHeader,
      ...options,
    })
    return (doc as PdfDocument & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  }

  if (kind === 'initial' || kind === 'complete') {
    initialHeader()
    let y = table({ startY: tableTop, body: [
      [{ content: `Historia clínica N.º: ${patient.historyNumber}`, colSpan: 2 }, { content: `Fecha: ${formatDate(patient.date)}`, colSpan: 2 }],
      [{ content: `Apellido y nombre: ${patient.fullName}`, colSpan: 2 }, { content: `Domicilio: ${patient.address}`, colSpan: 2 }],
      [`Edad: ${patient.birthDate ? ageAt(patient.birthDate, patient.date) : patient.age}`, `Nacimiento: ${patient.birthDate ? formatDate(patient.birthDate) : ''}`, `Tel.: ${patient.phone}`, `Cel.: ${patient.mobile}`],
      [`Obra social: ${patient.insurance}`, { content: `Ocupación: ${patient.occupation}`, colSpan: 2 }, `DNI: ${patient.dni}`],
      [{ content: `Contacto de emergencia: ${patient.emergencyContact}`, colSpan: 3 }, `Tel.: ${patient.emergencyPhone}`],
    ], styles: { fontSize: 7, cellPadding: 1.8, minCellHeight: 8, lineColor: 30, lineWidth: 0.25 } })
    y = table({ startY: y + 3, head: [['ANTECEDENTES DE SALUD', 'Sí', 'No', 'Observaciones']],
      body: patient.antecedents.map((a) => [a.label, a.answer === 'yes' ? 'X' : '', a.answer === 'no' ? 'X' : '', a.notes]),
      columnStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 10 }, 2: { cellWidth: 10 } },
    })
    y = table({ startY: y + 3, head: [['VACUNAS', 'Sí', 'No', 'Observaciones']],
      body: patient.vaccines.map((a) => [a.label, a.answer === 'yes' ? 'X' : '', a.answer === 'no' ? 'X' : '', a.notes]),
      columnStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 10 }, 2: { cellWidth: 10 } },
    })
    const answer = (value: string) => value === 'yes' ? 'Sí' : value === 'no' ? 'No' : 'Sin responder'
    y = table({ startY: y + 3, body: [
      ['¿Está en tratamiento?', answer(patient.treatment), patient.treatmentNotes],
      ['Medicación que toma', { content: patient.medication, colSpan: 2 }],
      ['Deportes / frecuencia', { content: patient.sports, colSpan: 2 }],
      ['Alimentación', { content: patient.diet, colSpan: 2 }],
      ['Consumo de alcohol', { content: patient.alcohol, colSpan: 2 }],
      ['Tabaquismo', { content: patient.smoking, colSpan: 2 }],
      ['Tipo de calzado', { content: patient.footwear, colSpan: 2 }],
    ], columnStyles: { 0: { cellWidth: 56 }, 1: { cellWidth: 20 } } })
    table({ startY: y + 3, body: [
      [`Autorización para fotografías podológicas (seguimiento, docencia y estadísticas): ${answer(patient.photoConsent)}. La respuesta registrada no reemplaza el consentimiento firmado.`],
      ['Declaro que los datos consignados son correctos y completos, y que he sido informado de que forman parte del secreto profesional.'],
      ['Firma del paciente: __________________________     Aclaración: __________________________'],
    ] })
  }

  if (kind !== 'initial') {
    let sheet = 0
    let bodyY = 0
    let cursorY = 0
    const bottom = 275
    const dateWidth = 22
    const procedureWidth = 121
    const signatureWidth = width - dateWidth - procedureWidth
    const lineHeight = 3.2
    const observationLines = lines(doc, clinical.usual.replace(/\n{3,}/g, '\n\n'), width - 6)
    const observationChunkSize = 20
    const observationPages = Math.ceil(observationLines.length / observationChunkSize)
    function evolutionPage() {
      if (kind === 'complete' || sheet > 0) doc.addPage()
      sheet += 1
      const titleY = sheet === 1 && kind !== 'complete' ? headerBottom : clinicHeader(doc, clinic)
      text(doc, 'Ficha de evolución', left, titleY, 11, true)
      text(doc, `Hoja: ${sheet}`, right - 18, titleY, 8, true)
      const nameLines = lines(doc, `Paciente: ${patient.fullName.replace(/\s+/g, ' ')}`, 130, 8)
      const numberLines = lines(doc, `N.º de historia: ${patient.historyNumber.replace(/\s+/g, ' ')}`, 50, 7)
      doc.setFontSize(8)
      doc.text(nameLines, left, titleY + 7)
      doc.setFontSize(7)
      doc.text(numberLines, right - 50, titleY + 7)
      const summaryY = titleY + 10 + Math.max(nameLines.length * 3.4, numberLines.length * 3)
      const observationChunk = observationPages === 1 ? observationLines : sheet <= observationPages
        ? observationLines.slice((sheet - 1) * observationChunkSize, sheet * observationChunkSize)
        : [`Ver observaciones completas en las hojas 1 a ${observationPages}.`]
      const observationHeight = Math.max(11, observationChunk.length * 3 + 7)
      const summaryHeight = observationHeight + 18
      doc.rect(left, summaryY, width, summaryHeight)
      text(doc, sheet > 1 && sheet <= observationPages ? 'Observaciones / valores habituales (continuación):' : 'Observaciones / valores habituales:', left + 2, summaryY + 4, 7, true)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.text(observationChunk, left + 2, summaryY + 8)
      const valuesY = summaryY + observationHeight + 3
      text(doc, `T.A.: ${clinical.pressure}`, left + 2, valuesY)
      text(doc, `Peso: ${clinical.weight}${clinical.weight ? ' kg' : ''}`, left + 121, valuesY)
      text(doc, `Glucemia: ${clinical.glucose}`, left + 2, valuesY + 6)
      text(doc, `Talla: ${clinical.height}${clinical.height ? ' cm' : ''}    IMC: ${bmi(clinical.weight, clinical.height)}`, left + 121, valuesY + 6)
      const tableY = summaryY + summaryHeight + 7
      bodyY = tableY + 7
      cursorY = bodyY
      doc.rect(left, tableY, width, bottom - tableY)
      doc.line(left + dateWidth, tableY, left + dateWidth, bottom)
      doc.line(left + dateWidth + procedureWidth, tableY, left + dateWidth + procedureWidth, bottom)
      doc.line(left, bodyY, right, bodyY)
      text(doc, 'Fecha', left + 2, tableY + 4.5, 8, true)
      text(doc, 'Procedimiento', left + dateWidth + 2, tableY + 4.5, 8, true)
      text(doc, 'Firma del paciente', right - signatureWidth + 2, tableY + 4.5, 7, true)
      doc.rect(left, bottom, width, 8)
      const referral = lines(doc, `Me contactó por: ${patient.referredBy.replace(/\s+/g, ' ')}`, width - 4, 6)
      doc.setFontSize(6)
      doc.text(referral, left + 2, bottom + 3)
    }

    evolutionPage()
    if (kind !== 'blank-evolution') {
      for (const evolution of evolutions) {
        const content = lines(doc, evolution.procedure, procedureWidth - 5, 7.5)
        let offset = 0
        while (offset < content.length) {
          if (bottom - cursorY < 19) evolutionPage()
          const capacity = Math.max(1, Math.floor((bottom - cursorY - 8) / lineHeight))
          const chunk = content.slice(offset, offset + capacity)
          const height = Math.max(18, chunk.length * lineHeight + 8)
          text(doc, offset === 0 ? formatDate(evolution.date) : 'Continúa', left + 2, cursorY + 5, 6.5)
          doc.setFontSize(7.5)
          doc.text(chunk, left + dateWidth + 2, cursorY + 5)
          cursorY += height
          if (cursorY < bottom) doc.line(left, cursorY, right, cursorY)
          offset += chunk.length
          if (offset < content.length) evolutionPage()
        }
      }
    }
    // Extremely long multiline observations must also be preserved, even without procedures.
    while (sheet < observationPages) evolutionPage()
  }

  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page)
    text(doc, 'Documento confidencial · Uso exclusivo del consultorio y del paciente.', left, 290, 6)
    text(doc, `${page} / ${doc.getNumberOfPages()}`, right - 12, 290, 6)
  }
  return doc
}

export async function downloadPdf(record: RecordDraft, clinic: Clinic, kind: PdfKind) {
  const doc = await buildPdf(record, clinic, kind)
  const prefix = { complete: 'historia-completa', initial: 'historia-inicial', evolutions: 'evoluciones', 'blank-evolution': 'planilla-evolucion' }[kind]
  // Do not expose names / DNI in file names.
  const number = record.patient.historyNumber.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)
  doc.save(`${prefix}${number ? `-${number}` : ''}.pdf`)
}
