import { describe, expect, it } from 'vitest'
import { availabilityOf, parseSteps } from './student/ProjectDetails'
import { discrepancyCsv } from './admin/Import'

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

describe('audit discrepancy CSV', () => {
  const rec = (o) => ({ source_section: 'small_components', source_page: 2, source_row: 3, source_serial: '3', original_name: '9V1A Adapter',
    qty_reported: null, qty_isd_lab: 2, qty_old_project: 0, qty_available_reported: 1, remarks: null, flags: ['quantity_mismatch'],
    review_notes: null, status: 'needs_review', item_name: null, ...o })
  it('lists only flagged rows, under a fixed header', () => {
    const lines = discrepancyCsv([rec(), rec({ source_row: 4, flags: [] })]).split('\n')
    expect(lines[0]).toBe('section,page,row,serial,original_name,qty_reported,qty_isd_lab,qty_old_project,qty_available_reported,remarks,flags,review_notes,status,linked_item')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('"small_components","2","3","3","9V1A Adapter","","2","0","1","","quantity_mismatch","","needs_review",""')
  })
  it('neutralises formulas in text taken from the audit document', () => {
    const csv = discrepancyCsv([rec({ original_name: '=HYPERLINK("http://x")', remarks: '@SUM(A1)', flags: ['unclear_name', 'damaged'] })])
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(csv).toContain(`"'@SUM(A1)"`)
    expect(csv).toContain('"unclear_name; damaged"')
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

describe('project availability status (mirrors _project_availability in SQL)', () => {
  it('derives the status from readiness, external parts and verification', () => {
    expect(availabilityOf({ n_required: 3, n_satisfied: 3 })).toBe('available')
    expect(availabilityOf({ n_required: 3, n_satisfied: 3 }, ['SIM card'])).toBe('requires_external')
    expect(availabilityOf({ n_required: 3, n_satisfied: 1 })).toBe('partially_available')
    expect(availabilityOf({ n_required: 3, n_satisfied: 0 })).toBe('temporarily_unavailable')
    expect(availabilityOf({ n_required: 3, n_satisfied: 3 }, [], 'Check the LiDAR driver')).toBe('requires_verification')
    expect(availabilityOf({ n_required: 0, n_satisfied: 0 }, ['Filament'])).toBe('requires_external')
  })
})
