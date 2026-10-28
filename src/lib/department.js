// Department selection: a fixed "CTech" option or "Other" with a typed name.
// The profile stores one text value ("CTech" or the typed name); the database
// normalises and validates it again (2-100 characters). Pure functions (tested).

export const CTECH = 'CTech'
export const OTHER = 'other'
export const DEPARTMENT_OPTIONS = [
  { value: CTECH, label: 'CTech' },
  { value: OTHER, label: 'Other' },
]

/** Stored value -> form state. */
export function splitDepartment(value) {
  const v = (value || '').trim()
  if (!v) return { choice: '', other: '' }
  if (v.toLowerCase() === 'ctech') return { choice: CTECH, other: '' }
  return { choice: OTHER, other: v }
}

/** Form state -> stored value ('' when incomplete). */
export function joinDepartment({ choice, other }) {
  if (choice === CTECH) return CTECH
  if (choice === OTHER) return (other || '').trim().replace(/\s+/g, ' ')
  return ''
}

/** Error message for the form, or '' when valid. */
export function departmentError({ choice, other }) {
  if (!choice) return 'Choose your department'
  if (choice === OTHER) {
    const v = (other || '').trim()
    if (!v) return 'Enter your department name'
    if (v.length < 2) return 'Department name is too short'
    if (v.length > 100) return 'Keep the department name under 100 characters'
  }
  return ''
}
