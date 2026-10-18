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

import { REQUEST_TABS, requestActions } from './student/MyRequests'

describe('My requests: tabs and status → action mapping', () => {
  const keys = (r, o) => requestActions(r, o).map((a) => a.key)
  it('has no Cancelled tab', () => {
    expect(REQUEST_TABS).toEqual(['all', 'pending', 'approved', 'issued', 'returned', 'rejected'])
    expect(REQUEST_TABS).not.toContain('cancelled')
  })
  it('pending and approved → Cancel request', () => {
    expect(keys({ status: 'pending' })).toEqual(['cancel'])
    expect(keys({ status: 'approved' })).toEqual(['cancel'])
  })
  it('issued → Return and Extend, both enabled on an open loan', () => {
    const a = requestActions({ status: 'issued' })
    expect(a.map((x) => x.key)).toEqual(['return', 'extend'])
    expect(a.every((x) => !x.disabled)).toBe(true)
  })
  it('issued with a return already requested → both shown but disabled with a reason', () => {
    const a = requestActions({ status: 'issued' }, { returnRequested: true })
    expect(a.map((x) => [x.key, x.disabled])).toEqual([['return', true], ['extend', true]])
    expect(a[0].reason).toMatch(/Return requested/)
  })
  it('issued with an extension waiting → Extend disabled, Return still available', () => {
    const a = requestActions({ status: 'issued' }, { pendingExtension: { requested_due_date: '2026-11-02' } })
    expect(a.find((x) => x.key === 'return').disabled).toBe(false)
    expect(a.find((x) => x.key === 'extend').disabled).toBe(true)
  })
  it('rejected → Request again; returned and cancelled → nothing', () => {
    expect(keys({ status: 'rejected' })).toEqual(['again'])
    expect(keys({ status: 'returned' })).toEqual([])
    expect(keys({ status: 'cancelled' })).toEqual([])
  })
})
