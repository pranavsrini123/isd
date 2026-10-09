import { describe, expect, it } from 'vitest'
import { emailDomain, isAllowedDomain, passwordProblems, validateRequest, validateReturn, validateSignup } from './validation'

describe('sign-up validation', () => {
  const ok = { fullName: 'Demo Student', email: 'demo@srmist.edu.in', srmId: 'RA2311003010001', password: 'Student123', confirm: 'Student123' }
  it('accepts a valid SRM sign-up', () => expect(validateSignup(ok, ['srmist.edu.in'])).toEqual({}))
  it('rejects other domains (case-insensitive match on the domain)', () => {
    expect(validateSignup({ ...ok, email: 'x@gmail.com' }, ['srmist.edu.in']).email).toMatch(/institutional/)
    expect(isAllowedDomain('X@SRMIST.EDU.IN', ['srmist.edu.in'])).toBe(true)
    expect(isAllowedDomain('x@evil-srmist.edu.in', ['srmist.edu.in'])).toBe(false)
    expect(isAllowedDomain('x@srmist.edu.in.evil.com', ['srmist.edu.in'])).toBe(false)
  })
  it('treats an empty allow-list as no restriction', () => expect(isAllowedDomain('x@gmail.com', [])).toBe(true))
  it('checks password strength and confirmation', () => {
    expect(passwordProblems('short1')).toContain('At least 8 characters')
    expect(passwordProblems('longpassword')).toContain('At least one number')
    expect(validateSignup({ ...ok, confirm: 'nope' }, []).confirm).toBeTruthy()
  })
  it('validates register numbers', () => expect(validateSignup({ ...ok, srmId: 'ab' }, []).srmId).toBeTruthy())
  it('extracts domains', () => expect(emailDomain('a.b@Srmist.edu.in ')).toBe('srmist.edu.in'))
})

describe('request validation', () => {
  const ctx = { today: '2026-10-10', maxLoanDays: 14, maxItems: 20 }
  const base = { purpose: 'Weather station', neededFrom: '2026-10-10', neededUntil: '2026-10-17', lines: [{ item_id: 'a', qty: 2, available_qty: 5 }] }
  it('accepts a valid request', () => expect(validateRequest(base, ctx)).toEqual({}))
  it('rejects quantities above availability and non-integers', () => {
    expect(validateRequest({ ...base, lines: [{ item_id: 'a', qty: 6, available_qty: 5 }] }, ctx).lineErrors.a).toMatch(/Only 5/)
    expect(validateRequest({ ...base, lines: [{ item_id: 'a', qty: 1.5, available_qty: 5 }] }, ctx).lineErrors.a).toBeTruthy()
  })
  it('rejects past, reversed and over-long dates', () => {
    expect(validateRequest({ ...base, neededFrom: '2026-10-01' }, ctx).neededFrom).toMatch(/past/)
    expect(validateRequest({ ...base, neededUntil: '2026-10-09' }, ctx).neededUntil).toBeTruthy()
    expect(validateRequest({ ...base, neededUntil: '2026-11-30' }, ctx).neededUntil).toMatch(/14 days/)
  })
  it('requires at least one line and a purpose', () => {
    expect(validateRequest({ ...base, lines: [] }, ctx).lines).toBeTruthy()
    expect(validateRequest({ ...base, purpose: ' ' }, ctx).purpose).toBeTruthy()
  })
})

describe('return validation', () => {
  it('requires good + damaged + missing = issued', () => {
    expect(validateReturn({ good: 3, damaged: 1, missing: 0 }, 4)).toBe(null)
    expect(validateReturn({ good: 3, damaged: 0, missing: 0 }, 4)).toMatch(/add up to 4/)
    expect(validateReturn({ good: 5, damaged: -1, missing: 0 }, 4)).toMatch(/zero or more/)
  })
})
