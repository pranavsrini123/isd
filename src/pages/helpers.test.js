import { describe, expect, it } from 'vitest'
import { parseSteps } from './student/ProjectDetails'
import { toCsv } from './admin/Reports'

describe('build instructions parser', () => {
  it('splits paragraphs and numbered steps, with optional titles', () => {
    const steps = parseSteps('1. Assemble the chassis\nMount the motors.\n2. Wire the driver\nConnect IN1-IN4.')
    expect(steps).toEqual([
      { title: 'Assemble the chassis', body: 'Mount the motors.' },
      { title: 'Wire the driver', body: 'Connect IN1-IN4.' },
    ])
    expect(parseSteps('Do this.\n\nThen that.')).toEqual([{ title: null, body: 'Do this.' }, { title: null, body: 'Then that.' }])
    expect(parseSteps(null)).toEqual([])
  })
})

describe('CSV export', () => {
  it('quotes values and neutralises formula injection', () => {
    const csv = toCsv([{ name: 'Arduino, Uno', note: '=HYPERLINK("x")', n: 3 }])
    expect(csv.split('\n')[0]).toBe('name,note,n')
    expect(csv).toContain('"Arduino, Uno"')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})
