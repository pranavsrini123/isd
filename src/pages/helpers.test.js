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

// ------------------------------------------------------------------ 0012 features
import { normaliseRequestFilter, requestFilterCounts, requestFilterOptions } from './student/MyRequests'
import { validateEnquiry } from './student/Enquiries'
import { canDownloadLetter, validateTakeaway } from './student/Takeaway'
import { enquiryLogCsv } from './admin/Enquiries'
import { requestTabsFor } from './admin/Requests'
import { takeawayTabsFor } from './admin/Takeaway'

describe('My requests status dropdown', () => {
  const reqs = [{ status: 'pending' }, { status: 'pending' }, { status: 'issued' }, { status: 'cancelled' }, { status: 'returned' }]
  it('counts every status, with cancelled only under All', () => {
    expect(requestFilterCounts(reqs, 1)).toEqual({ all: 5, pending: 2, approved: 0, issued: 1, returned: 1, rejected: 0, borrowed: 1 })
  })
  it('lists all seven filters with their counts', () => {
    const opts = requestFilterOptions(requestFilterCounts(reqs, 1))
    expect(opts.map((o) => o.value)).toEqual(['all', 'pending', 'approved', 'issued', 'returned', 'rejected', 'borrowed'])
    expect(opts.map((o) => o.label)).toEqual(['All (5)', 'Pending (2)', 'Approved (0)', 'Issued (1)', 'Returned (1)', 'Rejected (0)', 'On loan (1)'])
    expect(requestFilterOptions(null)[1].label).toBe('Pending') // while loading
  })
  it('falls back to All for unknown values in the URL', () => {
    expect(normaliseRequestFilter('borrowed')).toBe('borrowed')
    expect(normaliseRequestFilter('cancelled')).toBe('all')
    expect(normaliseRequestFilter(undefined)).toBe('all')
  })
})

describe('enquiry form', () => {
  const ok = { name: 'Ananya', registrationNumber: 'RA2311003010001', dept: { choice: 'CTech', other: '' }, description: 'Is a Jetson Nano free?' }
  it('accepts a complete enquiry', () => expect(validateEnquiry(ok)).toEqual({}))
  it('flags missing fields', () => {
    const e = validateEnquiry({ name: '', registrationNumber: '12', dept: { choice: 'other', other: '' }, description: 'short' })
    expect(Object.keys(e).sort()).toEqual(['department', 'description', 'name', 'registrationNumber'])
  })
})

describe('take-away form', () => {
  const today = '2026-10-29'
  const ok = { name: 'Ananya', registrationNumber: 'RA2311003010001', dept: { choice: 'CTech', other: '' },
    purpose: 'Field test on the campus track', takeawayDate: today, expectedReturnDate: '', lines: [{ item_id: 'a', qty: 2, max: 5 }] }
  it('accepts a complete request', () => expect(validateTakeaway(ok, today)).toEqual({}))
  it('checks dates, components and quantities', () => {
    expect(validateTakeaway({ ...ok, takeawayDate: '2026-10-28' }, today).takeawayDate).toMatch(/past/)
    expect(validateTakeaway({ ...ok, expectedReturnDate: '2026-10-28' }, today).expectedReturnDate).toMatch(/on or after/)
    expect(validateTakeaway({ ...ok, lines: [] }, today).lines).toMatch(/at least one/)
    expect(validateTakeaway({ ...ok, lines: [{ item_id: 'a', qty: 9, max: 5 }] }, today).lines).toMatch(/quantities/)
  })
  it('offers the letter only after approval', () => {
    expect(['pending', 'approved', 'rejected', 'cancelled', 'submitted'].filter((status) => canDownloadLetter({ status })))
      .toEqual(['approved', 'submitted'])
  })
})

describe('enquiry log CSV', () => {
  const row = {
    enquiry_code: 'ENQ-1001', student_name: '=cmd|"/c calc"!A1', registration_number: 'RA2311003010001', email: 'a@srmist.edu.in',
    department: 'CTech', description: 'Need, "quoted" text\nover two lines', created_at: '2026-10-28T09:15:00Z', updated_at: '2026-10-28T10:00:00Z',
    status: 'resolved', resolution_note: '+1 free from Monday', handled_by_name: 'Lab Admin',
    history: [{ from: null, to: 'open', at: '2026-10-28T09:15:00Z', by: 'Ananya' }, { from: 'open', to: 'resolved', at: '2026-10-28T10:00:00Z', by: 'Lab Admin', note: 'done' }],
  }
  it('has the required columns', () => {
    expect(enquiryLogCsv([row]).split('\n')[0]).toBe('Enquiry ID,Student name,Registration number,Email ID,Department,Enquiry description,Submitted at,Current status,Resolution note,Last handled by,Last updated,Status history')
  })
  it('neutralises formulas and keeps quotes and history', () => {
    const csv = enquiryLogCsv([row])
    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`)
    expect(csv).toContain(`"'+1 free from Monday"`)
    expect(csv).toContain('"Need, ""quoted"" text\nover two lines"')
    expect(csv).toContain('2026-10-28 14:45 IST')
    expect(csv).toContain('Open -> Resolved (Lab Admin) - done')
  })
  it('writes just the header when there is nothing to export', () => {
    expect(enquiryLogCsv([]).split('\n')).toHaveLength(1)
  })
})

describe('staff screens by role', () => {
  it('only super admins get the pending queues', () => {
    expect(requestTabsFor(true)).toContain('pending')
    expect(requestTabsFor(false)).not.toContain('pending')
    expect(takeawayTabsFor(true)[0]).toBe('pending')
    expect(takeawayTabsFor(false)).not.toContain('pending')
  })
})
