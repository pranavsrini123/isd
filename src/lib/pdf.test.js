import { describe, expect, it } from 'vitest'
import { PdfDocument, textWidth, toWinAnsi, wrapText } from './pdf'
import { buildTakeawayLetter, isLetterAllowed, letterDate, letterFileName } from './takeawayLetter'

const ascii = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('')

const letter = {
  request_code: 'TKA-1001', status: 'approved', student_name: 'Ananya Raman', registration_number: 'RA2311003010001',
  email: 'ananya.r@srmist.edu.in', department: 'CTech', purpose: 'Field test of the line-following robot on the campus track.',
  takeaway_date: '2026-10-30', expected_return_date: '2026-11-03', additional_info: null,
  submitted_at: '2026-10-28T09:15:00Z', approved_by: 'Lab Super Admin', approved_at: '2026-10-28T11:42:00Z', approval_note: null,
  items: [{ name: 'Arduino Uno R3', brand_model: null, qty: 1 }, { name: 'L298N Motor Driver', brand_model: null, qty: 2 }],
}

describe('pdf writer', () => {
  it('writes a structurally valid PDF', () => {
    const doc = new PdfDocument({ title: 'Test' })
    doc.text(50, 50, 'Hello (world) \\ back')
    doc.addPage()
    doc.line(10, 10, 100, 10)
    const out = ascii(doc.toBytes(new Date('2026-10-29T00:00:00Z')))
    expect(out.startsWith('%PDF-1.4')).toBe(true)
    expect(out.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(out).toContain('/Count 2')
    expect(out).toContain('(Hello \\(world\\) \\\\ back) Tj') // parentheses and backslashes escaped
    // every xref offset points at the start of its object
    const xref = Number(/startxref\n(\d+)/.exec(out)[1])
    const table = out.slice(xref).split('\n').slice(3).filter((l) => / n $/.test(l))
    table.forEach((l, i) => expect(out.slice(Number(l.slice(0, 10)), Number(l.slice(0, 10)) + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)))
  })
  it('maps typographic punctuation to WinAnsi and unknown characters to ?', () => {
    expect(toWinAnsi('a–b “c” ’')).toEqual([97, 0x96, 98, 32, 0x93, 99, 0x94, 32, 0x92])
    expect(toWinAnsi('மு')).toEqual([63, 63])
  })
  it('wraps text to the width', () => {
    const lines = wrapText('one two three four five six seven eight nine ten', 60, 10)
    expect(lines.length).toBeGreaterThan(1)
    lines.forEach((l) => expect(textWidth(l, 10)).toBeLessThanOrEqual(60))
    expect(wrapText('a\n\nb', 100, 10)).toEqual(['a', '', 'b'])
  })
})

describe('take-away permission letter', () => {
  it('refuses requests that are not approved', () => {
    for (const status of ['pending', 'rejected', 'cancelled']) {
      expect(isLetterAllowed({ ...letter, status })).toBe(false)
      expect(() => buildTakeawayLetter({ ...letter, status })).toThrow(/after Super Admin approval/)
    }
    expect(() => buildTakeawayLetter({ ...letter, approved_by: null })).toThrow()
    expect(isLetterAllowed({ ...letter, status: 'submitted' })).toBe(true)
  })
  it('contains the request details and both signature sections', () => {
    const out = ascii(buildTakeawayLetter(letter, { now: new Date('2026-10-29T06:30:00Z') }))
    for (const s of ['TKA-1001', 'Ananya Raman', 'RA2311003010001', 'ananya.r@srmist.edu.in', 'CTech', 'Arduino Uno R3',
      'L298N Motor Driver', '30 Oct 2026', '3 Nov 2026', 'Lab Super Admin', 'Chairperson', 'Associate Chairperson',
      'Signature:', 'Name:', 'Date:', 'Permission to take laboratory components']) {
      expect(out).toContain(s)
    }
    expect(out).toContain('/MediaBox [0 0 595.28 841.89]') // A4
  })
  it('keeps a long component list readable over several pages', () => {
    const many = { ...letter, items: Array.from({ length: 40 }, (_, i) => ({ name: `Component ${i + 1}`, qty: 1 })) }
    const out = ascii(buildTakeawayLetter(many))
    expect(Number(/\/Count (\d+)/.exec(out)[1])).toBeGreaterThan(1)
    expect(out).toContain('Component 40')
  })
  it('formats dates and file names', () => {
    expect(letterDate('2026-11-03')).toBe('3 Nov 2026')
    expect(letterDate('2026-10-28T20:00:00Z')).toBe('29 Oct 2026') // 01:30 IST next day
    expect(letterFileName(letter)).toBe('TKA-1001-permission-letter.pdf')
  })
})
