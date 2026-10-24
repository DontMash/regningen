import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type {
  InvoiceDocument,
  InvoicePdfCapability,
} from './generation-contract'
import { InvoicePdfFailure } from './generation-contract'
import * as m from '@/paraglide/messages'
import { formatDate, formatEuro } from '@/lib/i18n'

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

export const invoicePdfCapability: InvoicePdfCapability = {
  async render(document) {
    try {
      return await renderInvoicePdf(document)
    } catch (error) {
      // pdf-lib's standard-font encoder exposes this specific format limitation
      // only as an Error message. Other errors are defects, not format failures.
      if (
        error instanceof Error &&
        error.message.includes('WinAnsi cannot encode')
      ) {
        throw new InvoicePdfFailure('characters', { cause: error })
      }
      throw error
    }
  },
}

async function renderInvoicePdf({
  profile,
  invoice: validated,
  totals,
  language: locale,
}: InvoiceDocument): Promise<Uint8Array> {
  const invoice = validated.draft
  const pdf = await PDFDocument.create()
  pdf.setTitle(m.pdf_title({ number: invoice.number }, { locale }))
  pdf.setLanguage(locale)
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
    throw new InvoicePdfFailure('business-name')
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
      throw new InvoicePdfFailure('service')
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
      profile.phone && m.pdf_phone({ phone: profile.phone }, { locale }),
      profile.mobile && m.pdf_mobile({ mobile: profile.mobile }, { locale }),
    ],
    338,
    addressTop,
    RIGHT - 338,
  )

  let y = Math.min(recipientLines, issuerLines) - 26
  if (y < 560) {
    throw new InvoicePdfFailure('addresses')
  }

  write(m.pdf_heading({}, { locale }), LEFT, y, 14, bold)
  y -= 24
  write(m.pdf_number({ number: invoice.number }, { locale }), LEFT, y, 10)
  rightText(
    m.pdf_date({ date: formatDate(invoice.date, locale) }, { locale }),
    y,
    10,
  )
  y -= 18
  if (invoice.subject.trim()) {
    const subjectLines = wrapText(
      invoice.subject.trim(),
      font,
      10,
      RIGHT - LEFT - 44,
    )
    if (subjectLines.length > 2) {
      throw new InvoicePdfFailure('subject')
    }
    subjectLines.forEach((part, index) =>
      write(
        index === 0 ? m.pdf_subject({ subject: part }, { locale }) : part,
        LEFT,
        y - index * 12,
        10,
      ),
    )
    y -= subjectLines.length * 12 + 7
  }

  write(m.pdf_positions({}, { locale }), LEFT, y, 10, bold)
  rightText(m.pdf_cost({}, { locale }), y, 10, bold)
  line(y - 8)
  y -= 27

  for (const item of validated.positions) {
    const amount = item.grossAmount

    const descriptionLines = wrapText(item.description.trim(), font, 9, 350)
    if (descriptionLines.length > 2) {
      throw new InvoicePdfFailure('description')
    }

    descriptionLines.forEach((part, lineIndex) =>
      write(part, LEFT, y - lineIndex * 11, 9),
    )
    rightText(formatEuro(amount, locale), y, 9)

    const rowHeight = Math.max(16, descriptionLines.length * 11 + 5)
    y -= rowHeight
    line(y + 9.5)
  }

  if (y < 285) {
    throw new InvoicePdfFailure('positions')
  }

  const totalRows = [
    {
      label: m.pdf_net({}, { locale }),
      value: formatEuro(totals.net, locale),
      size: 9,
      face: font,
    },
    {
      label: m.pdf_tax({ rate: invoice.rate }, { locale }),
      value: formatEuro(totals.tax, locale),
      size: 9,
      face: font,
    },
    {
      label: m.pdf_gross({}, { locale }),
      value: formatEuro(totals.gross, locale),
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
    throw new InvoicePdfFailure('invoice')
  }

  const bankDetails = [
    { label: m.pdf_iban({}, { locale }), value: profile.iban, y: 126 },
    ...(profile.vatId
      ? [{ label: m.pdf_vat_id({}, { locale }), value: profile.vatId, y: 110 }]
      : []),
    ...(profile.taxNumber
      ? [
          {
            label: m.pdf_tax_number({}, { locale }),
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
