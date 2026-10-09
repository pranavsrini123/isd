// Client-side validation. This is for fast feedback only: the database repeats
// every check (domains, quantities, dates, limits) and is the real authority.

export const PASSWORD_MIN = 8

export function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase()
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

/** allowed: array of domains; empty array or null = no restriction. */
export function isAllowedDomain(email, allowed) {
  if (!allowed || allowed.length === 0) return true
  const d = emailDomain(email)
  return allowed.some((a) => a.toLowerCase() === d)
}

export function passwordProblems(pw) {
  const problems = []
  if (!pw || pw.length < PASSWORD_MIN) problems.push(`At least ${PASSWORD_MIN} characters`)
  if (pw && !/[A-Za-z]/.test(pw)) problems.push('At least one letter')
  if (pw && !/\d/.test(pw)) problems.push('At least one number')
  return problems
}

export function isValidSrmId(id) {
  return !id || /^[A-Za-z0-9]{6,20}$/.test(id.trim())
}

export function validateSignup({ fullName, email, srmId, password, confirm }, allowedDomains) {
  const errors = {}
  if (!fullName || fullName.trim().length < 2) errors.fullName = 'Enter your full name'
  if (!isValidEmail(email)) errors.email = 'Enter a valid email address'
  else if (!isAllowedDomain(email, allowedDomains))
    errors.email = `Use your institutional email (${allowedDomains.map((d) => '@' + d).join(', ')})`
  if (!isValidSrmId(srmId)) errors.srmId = '6–20 letters or digits'
  const pw = passwordProblems(password)
  if (pw.length) errors.password = pw.join(' · ')
  if (password !== confirm) errors.confirm = 'Passwords do not match'
  return errors
}

/**
 * Validates a borrow request form.
 * lines: [{ item_id, name, qty, available_qty }]
 */
export function validateRequest({ purpose, neededFrom, neededUntil, lines }, { today, maxLoanDays, maxItems }) {
  const errors = {}
  if (!purpose || purpose.trim().length < 3) errors.purpose = 'Describe what you will build (at least 3 characters)'
  if (!neededFrom) errors.neededFrom = 'Choose a start date'
  if (!neededUntil) errors.neededUntil = 'Choose a return date'
  if (neededFrom && today && neededFrom < today) errors.neededFrom = 'The start date cannot be in the past'
  if (neededFrom && neededUntil && neededUntil < neededFrom) errors.neededUntil = 'Return date must be on or after the start date'
  if (neededFrom && neededUntil && maxLoanDays) {
    const days = Math.round((new Date(neededUntil) - new Date(neededFrom)) / 86400000)
    if (days > maxLoanDays) errors.neededUntil = `Loans are limited to ${maxLoanDays} days`
  }
  const active = (lines || []).filter((l) => l.qty > 0)
  if (active.length === 0) errors.lines = 'Add at least one component'
  else if (maxItems && active.length > maxItems) errors.lines = `At most ${maxItems} different components per request`
  const lineErrors = {}
  for (const l of lines || []) {
    if (!Number.isInteger(l.qty) || l.qty < 0) lineErrors[l.item_id] = 'Whole numbers only'
    else if (l.qty > l.available_qty) lineErrors[l.item_id] = `Only ${l.available_qty} available`
  }
  if (Object.keys(lineErrors).length) errors.lineErrors = lineErrors
  return errors
}

/** Return verification: good + damaged + missing must equal the quantity issued. */
export function validateReturn({ good, damaged, missing }, issued) {
  const vals = [good, damaged, missing]
  if (vals.some((v) => !Number.isInteger(v) || v < 0)) return 'Quantities must be whole numbers, zero or more'
  if (good + damaged + missing !== issued) return `Counts must add up to ${issued} issued`
  return null
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0
}
