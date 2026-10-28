import { describe, expect, it } from 'vitest'
import { homePath, isStaff, isSuperAdmin, roleLabel } from './roles'
import { departmentError, joinDepartment, splitDepartment } from './department'

describe('roles', () => {
  const p = (role, status = 'active') => ({ role, status })
  it('treats admins and super admins as staff', () => {
    expect(isStaff(p('admin'))).toBe(true)
    expect(isStaff(p('super_admin'))).toBe(true)
    expect(isStaff(p('student'))).toBe(false)
    expect(isStaff(null)).toBe(false)
  })
  it('only active super admins are super admins', () => {
    expect(isSuperAdmin(p('super_admin'))).toBe(true)
    expect(isSuperAdmin(p('admin'))).toBe(false)
    expect(isSuperAdmin(p('super_admin', 'suspended'))).toBe(false)
  })
  it('a suspended admin is not staff', () => {
    expect(isStaff(p('admin', 'suspended'))).toBe(false)
  })
  it('sends staff to the admin console and students to the student portal', () => {
    expect(homePath(p('super_admin'))).toBe('/admin')
    expect(homePath(p('admin'))).toBe('/admin')
    expect(homePath(p('student'))).toBe('/student')
    expect(homePath(null)).toBe('/student')
  })
  it('labels roles', () => {
    expect(roleLabel('super_admin')).toBe('Super Admin')
    expect(roleLabel('admin')).toBe('Admin')
    expect(roleLabel('student')).toBe('Student')
  })
})

describe('department', () => {
  it('requires a choice', () => {
    expect(departmentError({ choice: '', other: '' })).toBe('Choose your department')
  })
  it('accepts CTech with no extra field', () => {
    expect(departmentError({ choice: 'CTech', other: '' })).toBe('')
    expect(joinDepartment({ choice: 'CTech', other: 'ignored' })).toBe('CTech')
  })
  it('requires a name when Other is chosen', () => {
    expect(departmentError({ choice: 'other', other: '  ' })).toBe('Enter your department name')
    expect(departmentError({ choice: 'other', other: 'E' })).toBe('Department name is too short')
    expect(departmentError({ choice: 'other', other: 'x'.repeat(101) })).toMatch(/under 100/)
    expect(departmentError({ choice: 'other', other: 'Mechanical' })).toBe('')
  })
  it('stores the typed name, tidied', () => {
    expect(joinDepartment({ choice: 'other', other: '  Electronics   and Communication ' })).toBe('Electronics and Communication')
    expect(joinDepartment({ choice: '', other: 'x' })).toBe('')
  })
  it('turns a stored value back into form state', () => {
    expect(splitDepartment('CTech')).toEqual({ choice: 'CTech', other: '' })
    expect(splitDepartment('ctech')).toEqual({ choice: 'CTech', other: '' })
    expect(splitDepartment('Mechanical')).toEqual({ choice: 'other', other: 'Mechanical' })
    expect(splitDepartment(null)).toEqual({ choice: '', other: '' })
  })
})
