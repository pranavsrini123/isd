import { describe, expect, it } from 'vitest'
import { friendlyError, unwrap } from './errors'

describe('error messages', () => {
  it('maps auth errors to plain language', () => {
    expect(friendlyError({ message: 'Invalid login credentials' })).toBe('Incorrect email or password.')
    expect(friendlyError({ message: 'Email not confirmed' })).toMatch(/verify your email/)
    expect(friendlyError({ message: 'Database error saving new user' })).toMatch(/institutional/)
  })
  it('passes through sentences raised by our SQL functions', () => {
    expect(friendlyError({ code: 'P0001', message: 'Only 1 of "NRF24L01" available (you asked for 5)' })).toMatch(/^Only 1/)
  })
  it('hides raw permission errors', () => {
    expect(friendlyError({ code: '42501', message: 'permission denied for table borrowings' })).toBe('You do not have permission to do that.')
  })
  it('unwrap throws with a friendly message and keeps the code', () => {
    expect(() => unwrap({ data: null, error: { code: '42501', message: 'permission denied for table x' } })).toThrow('You do not have permission')
    expect(unwrap({ data: [1], error: null })).toEqual([1])
    expect(unwrap({ data: [1], error: null, count: 4 })).toEqual({ data: [1], count: 4 })
  })
})
