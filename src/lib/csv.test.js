import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'

describe('CSV export', () => {
  it('quotes values and neutralises formula injection', () => {
    const csv = toCsv([{ name: 'Arduino, Uno', note: '=HYPERLINK("x")', n: 3 }])
    expect(csv.split('\n')[0]).toBe('name,note,n')
    expect(csv).toContain('"Arduino, Uno"')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
  it('guards every formula trigger, but not numbers', () => {
    for (const s of ['=1+1', '+1', '-1', '@A1', '\tx', '\rx']) expect(csvCell(s)).toBe(`"'${s}"`)
    expect(csvCell(-3)).toBe('"-3"')
    expect(csvCell('Arduino -5V')).toBe('"Arduino -5V"')
  })
  it('handles empty values and explicit columns', () => {
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
    expect(toCsv([])).toBe('')
    expect(toCsv([], ['a', 'b'])).toBe('a,b')
    expect(toCsv([{ a: 1, b: 'x', extra: 'ignored' }], ['a', 'b'])).toBe('a,b\n"1","x"')
  })
})
