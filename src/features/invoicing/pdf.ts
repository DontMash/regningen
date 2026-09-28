import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { BusinessProfileDraft } from './business-profile'
import type { InvoiceDraft } from './invoice'
import { calculateInvoiceTotals, parseEuroAmount } from './invoice'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const LEFT = 58
const RIGHT = 537
const INK = rgb(0.13, 0.19, 0.22)
const MUTED = rgb(0.37, 0.44, 0.47)
const RULE = rgb(0.72, 0.76, 0.78)

function wrapText(
  value: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  width: number,
): string[] {
  const lines: string[] = []
  let line = ''

  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate
      continue
    }

    if (line) lines.push(line)
    line = ''

    for (const character of word) {
      const next = line + character
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line)
        line = character
      } else {
        line = next
      }
    }
  }

  if (line) lines.push(line)
  return lines
}

function formattedEuro(cents: number) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  })
    .format(cents / 100)
    .replaceAll('\u00a0', ' ')
}

function germanDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year}`
}

export async function createInvoicePdf(
  profile: BusinessProfileDraft,
  invoice: InvoiceDraft,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Rechnung ${invoice.number}`)
  pdf.setAuthor(profile.businessName)
  pdf.setCreator('regningen')
  pdf.setCreationDate(new Date(`${invoice.date}T12:00:00`))

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const write = (
    text: string,
    x: number,
    y: number,
    size = 10,
    face = font,
    color = INK,
  ) => page.drawText(text, { x, y, size, font: face, color })
  const rightText = (text: string, y: number, size = 10, face = font) =>
    write(text, RIGHT - face.widthOfTextAtSize(text, size), y, size, face)
  const line = (y: number) =>
    page.drawLine({
      start: { x: LEFT, y },
      end: { x: RIGHT, y },
      thickness: 0.6,
      color: RULE,
    })
  const drawBlock = (
    values: string[],
    x: number,
    top: number,
    width: number,
  ) => {
    let y = top
    for (const value of values.filter(Boolean)) {
      const wrapped = wrapText(value, font, 9, width)
      for (const part of wrapped) {
        write(part, x, y, 9, font, MUTED)
        y -= 12
      }
    }
    return y
  }

  const businessNameLines = wrapText(
    profile.businessName,
    bold,
    16,
    RIGHT - LEFT,
  )
  if (businessNameLines.length > 2) {
    throw new Error('Der Unternehmensname ist zu lang für das PDF.')
  }
  businessNameLines.forEach((value, index) =>
    write(value, LEFT, 790 - index * 19, 16, bold),
  )
  const headingBottom = 790 - businessNameLines.length * 19
  if (profile.serviceDescription) {
    const serviceLines = wrapText(
      profile.serviceDescription,
      font,
      10,
      RIGHT - LEFT,
    )
    if (serviceLines.length > 1) {
      throw new Error('Die Leistungsbeschreibung ist zu lang für das PDF.')
    }
    write(serviceLines[0] ?? '', LEFT, headingBottom, 10, font, MUTED)
  }

  const addressTop = headingBottom - 43
  const recipientLines = drawBlock(
    [
      invoice.company,
      invoice.name,
      invoice.street,
      `${invoice.postalCode} ${invoice.town}`,
    ],
    LEFT,
    addressTop,
    220,
  )
  const issuerLines = drawBlock(
    [
      profile.ownerName,
      profile.street,
      `${profile.postalCode} ${profile.town}`,
      profile.phone && `Tel.: ${profile.phone}`,
      profile.mobile && `Mobil: ${profile.mobile}`,
    ],
    338,
    addressTop,
    RIGHT - 338,
  )

  let y = Math.min(recipientLines, issuerLines) - 26
  if (y < 560) {
    throw new Error('Die Anschriften sind zu umfangreich für eine Seite.')
  }

  write('Rechnung', LEFT, y, 14, bold)
  y -= 24
  write(`Rechnungsnummer ${invoice.number}`, LEFT, y, 10)
  rightText(`Datum: ${germanDate(invoice.date)}`, y, 10)
  y -= 18
  if (invoice.subject.trim()) {
    const subjectLines = wrapText(
      invoice.subject.trim(),
      font,
      10,
      RIGHT - LEFT - 44,
    )
    if (subjectLines.length > 2) {
      throw new Error('Der Betreff ist zu lang für eine Seite.')
    }
    subjectLines.forEach((part, index) =>
      write(index === 0 ? `Betreff: ${part}` : part, LEFT, y - index * 12, 10),
    )
    y -= subjectLines.length * 12 + 7
  }

  write('Waren & Dienstleistungen', LEFT, y, 10, bold)
  rightText('Kosten', y, 10, bold)
  line(y - 8)
  y -= 27

  const completedItems = invoice.items.filter(
    (item) => item.description.trim() || item.amount.trim(),
  )
  const amounts = completedItems.map((item) => parseEuroAmount(item.amount))
  if (amounts.some((amount) => amount === null || amount <= 0)) {
    throw new Error(
      'Bitte alle Positionsbeschreibungen und Bruttopreise prüfen.',
    )
  }

  for (let index = 0; index < completedItems.length; index++) {
    const item = completedItems[index]
    const amount = amounts[index]
    if (amount === null) continue

    const descriptionLines = wrapText(item.description.trim(), font, 9, 350)
    if (descriptionLines.length > 2) {
      throw new Error('Eine Positionsbeschreibung ist zu lang für eine Seite.')
    }

    descriptionLines.forEach((part, lineIndex) =>
      write(part, LEFT, y - lineIndex * 11, 9),
    )
    rightText(formattedEuro(amount), y, 9)

    const rowHeight = Math.max(16, descriptionLines.length * 11 + 5)
    y -= rowHeight
    line(y + 9.5)
  }

  if (y < 285) {
    throw new Error(
      'Zu viele lange Positionen für eine Seite. Bitte Beschreibungen kürzen.',
    )
  }

  const totals = calculateInvoiceTotals(
    amounts.filter((amount): amount is number => amount !== null),
    invoice.rate,
  )
  const totalRows = [
    { label: 'Netto:', value: formattedEuro(totals.net), size: 9, face: font },
    {
      label: `${invoice.rate} % MwSt.:`,
      value: formattedEuro(totals.tax),
      size: 9,
      face: font,
    },
    {
      label: 'Brutto:',
      value: formattedEuro(totals.gross),
      size: 10,
      face: bold,
    },
  ]
  const labelWidth = Math.max(
    ...totalRows.map(({ label, size, face }) =>
      face.widthOfTextAtSize(label, size),
    ),
  )
  const valueWidth = Math.max(
    ...totalRows.map(({ value, size, face }) =>
      face.widthOfTextAtSize(value, size),
    ),
  )
  const totalLabelX = RIGHT - valueWidth - 12 - labelWidth
  for (const [index, { label, value, size, face }] of totalRows.entries()) {
    y -= index === 0 ? 15 : index === 1 ? 17 : 18
    write(label, totalLabelX, y, size, face)
    rightText(value, y, size, face)
  }

  if (y < 165) {
    throw new Error('Die Rechnungsdaten sind zu umfangreich für eine Seite.')
  }

  const bankDetails = [
    { label: 'IBAN:', value: profile.iban, y: 126 },
    ...(profile.vatId
      ? [{ label: 'USt-IdNr.:', value: profile.vatId, y: 110 }]
      : []),
    ...(profile.taxNumber
      ? [
          {
            label: 'Steuernummer:',
            value: profile.taxNumber,
            y: profile.vatId ? 94 : 110,
          },
        ]
      : []),
  ]
  const bankValueX =
    LEFT +
    Math.max(
      ...bankDetails.map(({ label }) => font.widthOfTextAtSize(label, 9)),
    ) +
    12
  for (const { label, value, y: rowY } of bankDetails) {
    write(label, LEFT, rowY, 9, font, MUTED)
    write(value, bankValueX, rowY, 9)
  }

  const signatureWidth = Math.max(
    140,
    font.widthOfTextAtSize(profile.ownerName, 9),
  )
  page.drawLine({
    start: { x: RIGHT - signatureWidth, y: 64 },
    end: { x: RIGHT, y: 64 },
    thickness: 0.6,
    color: RULE,
  })
  rightText(profile.ownerName, 43, 9, font)

  return pdf.save()
}
