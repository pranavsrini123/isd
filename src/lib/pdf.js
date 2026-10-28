// A small PDF writer with no dependencies: text in the standard Helvetica fonts,
// lines and rectangles, any number of A4 pages. Enough for printable letters,
// and it produces a real PDF (version 1.4) that any viewer or printer opens.
// Text is encoded as WinAnsi (Latin-1 plus common typographic punctuation).

export const A4 = { width: 595.28, height: 841.89 } // points (1/72 inch)

// Advance widths (1/1000 em) for characters 32..126.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
const HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]
const FONTS = { regular: { key: 'F1', base: 'Helvetica', widths: HELV }, bold: { key: 'F2', base: 'Helvetica-Bold', widths: HELV_BOLD } }

// Unicode -> WinAnsi code for the punctuation people actually type.
const WIN_ANSI = {
  0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94,
  0x2022: 0x95, 0x2026: 0x85, 0x20ac: 0x80, 0x2122: 0x99, 0x00d7: 0xd7,
}
const EXTRA_WIDTH = { 0x96: 556, 0x97: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x85: 1000, 0x80: 556, 0x99: 1000 }

/** Maps a string to WinAnsi byte codes; characters with no equivalent become '?'. */
export function toWinAnsi(str) {
  const out = []
  for (const ch of String(str ?? '').normalize('NFC')) {
    const cp = ch.codePointAt(0)
    if (cp === 0x09) out.push(0x20)
    else if (cp >= 0x20 && cp <= 0x7e) out.push(cp)
    else if (WIN_ANSI[cp]) out.push(WIN_ANSI[cp])
    else if (cp >= 0xa0 && cp <= 0xff) out.push(cp)
    else if (cp === 0x0a || cp === 0x0d) out.push(0x20)
    else out.push(0x3f)
  }
  return out
}

function charWidth(code, widths) {
  if (code >= 32 && code <= 126) return widths[code - 32]
  return EXTRA_WIDTH[code] || 556
}

/** Width of a string in points. */
export function textWidth(str, size, font = 'regular') {
  const widths = FONTS[font].widths
  return (toWinAnsi(str).reduce((s, c) => s + charWidth(c, widths), 0) * size) / 1000
}

/** Splits text into lines no wider than maxWidth (breaks long words if it must). */
export function wrapText(str, maxWidth, size, font = 'regular') {
  const lines = []
  for (const para of String(str ?? '').split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) { lines.push(''); continue }
    let line = ''
    for (let word of words) {
      // A single word wider than the line is cut into pieces.
      while (textWidth(word, size, font) > maxWidth) {
        let cut = word.length - 1
        while (cut > 1 && textWidth(word.slice(0, cut), size, font) > maxWidth) cut--
        if (line) { lines.push(line); line = '' }
        lines.push(word.slice(0, cut))
        word = word.slice(cut)
      }
      const next = line ? `${line} ${word}` : word
      if (textWidth(next, size, font) <= maxWidth) line = next
      else { lines.push(line); line = word }
    }
    lines.push(line)
  }
  return lines
}

const num = (n) => (Math.round(n * 100) / 100).toString()
const rgb = (c) => (c || [0, 0, 0]).map((v) => num(v)).join(' ')
function pdfString(codes) {
  let s = '('
  for (const c of codes) {
    if (c === 0x28 || c === 0x29 || c === 0x5c) s += '\\' + String.fromCharCode(c)
    else if (c < 0x20 || c > 0x7e) s += '\\' + c.toString(8).padStart(3, '0')
    else s += String.fromCharCode(c)
  }
  return s + ')'
}

/**
 * Builds a document page by page. Coordinates are in points from the TOP-left
 * corner (y grows downwards), which is easier for letters; they are flipped to
 * PDF's bottom-left origin internally.
 */
export class PdfDocument {
  constructor({ title = '', author = '', subject = '' } = {}) {
    this.info = { title, author, subject }
    this.pages = []
    this.addPage()
  }

  addPage() {
    this.ops = []
    this.pages.push(this.ops)
    return this
  }

  get pageCount() { return this.pages.length }

  text(x, y, str, { size = 10, font = 'regular', color = [0, 0, 0], align = 'left' } = {}) {
    const w = textWidth(str, size, font)
    const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    this.ops.push(`BT /${FONTS[font].key} ${num(size)} Tf ${rgb(color)} rg ${num(left)} ${num(A4.height - y)} Td ${pdfString(toWinAnsi(str))} Tj ET`)
    return w
  }

  /** Wrapped paragraph; returns the y just below it. */
  paragraph(x, y, str, maxWidth, { size = 10, font = 'regular', color = [0, 0, 0], leading = size * 1.45 } = {}) {
    let yy = y
    for (const line of wrapText(str, maxWidth, size, font)) {
      if (line) this.text(x, yy, line, { size, font, color })
      yy += leading
    }
    return yy
  }

  line(x1, y1, x2, y2, { width = 0.75, color = [0, 0, 0], dash = null } = {}) {
    this.ops.push(`q ${num(width)} w ${rgb(color)} RG ${dash ? `[${dash.join(' ')}] 0 d ` : ''}${num(x1)} ${num(A4.height - y1)} m ${num(x2)} ${num(A4.height - y2)} l S Q`)
  }

  rect(x, y, w, h, { fill = null, stroke = null, width = 0.75 } = {}) {
    const box = `${num(x)} ${num(A4.height - y - h)} ${num(w)} ${num(h)} re`
    if (fill && stroke) this.ops.push(`q ${rgb(fill)} rg ${rgb(stroke)} RG ${num(width)} w ${box} B Q`)
    else if (fill) this.ops.push(`q ${rgb(fill)} rg ${box} f Q`)
    else this.ops.push(`q ${rgb(stroke)} RG ${num(width)} w ${box} S Q`)
  }

  /** The finished file as bytes. */
  toBytes(now = new Date()) {
    const objects = [] // index i holds object number i + 1
    const add = (body) => { objects.push(body); return objects.length }
    const catalog = add(null)
    const pagesObj = add(null)
    const f1 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS.regular.base} /Encoding /WinAnsiEncoding >>`)
    const f2 = add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS.bold.base} /Encoding /WinAnsiEncoding >>`)
    const kids = []
    for (const ops of this.pages) {
      const content = ops.join('\n')
      const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
      kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${num(A4.width)} ${num(A4.height)}] `
        + `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`))
    }
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`
    objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
    const p2 = (n) => String(n).padStart(2, '0')
    const date = `D:${now.getUTCFullYear()}${p2(now.getUTCMonth() + 1)}${p2(now.getUTCDate())}${p2(now.getUTCHours())}${p2(now.getUTCMinutes())}${p2(now.getUTCSeconds())}Z`
    const info = add(`<< /Title ${pdfString(toWinAnsi(this.info.title))} /Author ${pdfString(toWinAnsi(this.info.author))} `
      + `/Subject ${pdfString(toWinAnsi(this.info.subject))} /Producer (INVENTRA) /CreationDate (${date}) >>`)

    // Every byte written is < 0x80 (strings use octal escapes), so length = byte count.
    let out = '%PDF-1.4\n%âãÏÓ\n'
    const offsets = []
    objects.forEach((body, i) => {
      offsets.push(out.length)
      out += `${i + 1} 0 obj\n${body}\nendobj\n`
    })
    const xref = out.length
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    const bytes = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
    return bytes
  }
}
