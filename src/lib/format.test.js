import { describe, expect, it } from 'vitest'
import { AVAILABILITY, durationBucket, addDays, daysFromToday, formatDate, hoursLabel, initials, parseDate, readinessTone, relativeDue, stockStatus, toISODate } from './format'

describe('dates', () => {
  it('parses YYYY-MM-DD as a local calendar date (no UTC shift)', () => {
    const d = parseDate('2026-10-07')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 7])
  })
  it('round-trips ISO dates and adds days across month ends', () => {
    expect(toISODate(parseDate('2026-01-31'))).toBe('2026-01-31')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 14)).toBe('2027-01-14')
  })
  it('counts days from today', () => {
    const today = new Date(2026, 9, 10, 23, 30)
    expect(daysFromToday('2026-10-10', today)).toBe(0)
    expect(daysFromToday('2026-10-13', today)).toBe(3)
    expect(daysFromToday('2026-10-07', today)).toBe(-3)
  })
  it('describes due dates', () => {
    const today = new Date(2026, 9, 10)
    expect(relativeDue('2026-10-10', today)).toBe('Due today')
    expect(relativeDue('2026-10-11', today)).toBe('Due tomorrow')
    expect(relativeDue('2026-10-15', today)).toBe('Due in 5 days')
    expect(relativeDue('2026-10-09', today)).toBe('1 day overdue')
    expect(relativeDue('2026-10-01', today)).toBe('9 days overdue')
  })
  it('handles missing values', () => {
    expect(formatDate(null)).toBe('—')
    expect(relativeDue(undefined)).toBe('—')
  })
})

describe('stock and readiness helpers', () => {
  it('derives stock status like the database view', () => {
    expect(stockStatus(0, 2)).toBe('out_of_stock')
    expect(stockStatus(2, 2)).toBe('low_stock')
    expect(stockStatus(3, 2)).toBe('in_stock')
  })
  it('colours readiness: buildable is always ok, 80% not buildable is a warning', () => {
    expect(readinessTone(100, true)).toBe('ok')
    expect(readinessTone(80, false)).toBe('warn')
    expect(readinessTone(40, false)).toBe('bad')
  })
  it('formats hours and initials', () => {
    expect(hoursLabel(3, 5)).toBe('3–5 h')
    expect(hoursLabel(2, 2)).toBe('2 h')
    expect(hoursLabel(null, null)).toBe(null)
    expect(initials('Aarav Kumar Shah')).toBe('AS')
    expect(initials('')).toBe('?')
  })
})

describe('project catalogue helpers', () => {
  it('buckets durations by the upper estimate', () => {
    expect(durationBucket(2, 4)).toBe('short')
    expect(durationBucket(4, 8)).toBe('medium')
    expect(durationBucket(12, 24)).toBe('long')
    expect(durationBucket(16, 30)).toBe('xl')
    expect(durationBucket(null, null)).toBe(null)
    expect(durationBucket(5, null)).toBe('short')
  })
  it('labels every availability status', () => {
    for (const k of ['available', 'partially_available', 'requires_external', 'temporarily_unavailable', 'requires_verification']) {
      expect(AVAILABILITY[k].label).toBeTruthy()
    }
  })
})
