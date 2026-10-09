// Turns Supabase / Postgres errors into short messages a student or admin can act on.
// Messages raised by our own SQL functions are already written for people, so they
// pass through unchanged; low-level codes are translated.
const CODE_MESSAGES = {
  '42501': 'You do not have permission to do that.',
  '23505': 'That already exists.',
  '23514': null, // check violations from our triggers carry a readable message
  '23503': 'This record is still referenced elsewhere.',
  PGRST116: 'Not found.',
  PGRST301: 'Your session has expired. Please sign in again.',
}

const AUTH_MESSAGES = [
  [/invalid login credentials/i, 'Incorrect email or password.'],
  [/email not confirmed/i, 'Please verify your email first. Check your inbox for the link.'],
  [/user already registered/i, 'An account with this email already exists. Try signing in.'],
  [/password should be at least/i, 'Password must be at least 8 characters.'],
  [/rate limit|too many requests/i, 'Too many attempts. Please wait a minute and try again.'],
  [/institutional email/i, 'Use your SRM institutional email address to register.'],
  [/database error saving new user/i, 'Use your SRM institutional email address to register.'],
  [/failed to fetch|networkerror|load failed/i, 'Cannot reach the server. Check your connection.'],
]

export function friendlyError(err) {
  if (!err) return 'Something went wrong.'
  const message = typeof err === 'string' ? err : err.message || err.error_description || ''
  for (const [re, text] of AUTH_MESSAGES) if (re.test(message)) return text
  const code = err.code
  if (code && CODE_MESSAGES[code] && !looksHumanWritten(message)) return CODE_MESSAGES[code]
  if (code === '42501' && /permission denied|row-level security/i.test(message)) return CODE_MESSAGES['42501']
  return message || 'Something went wrong.'
}

// Our SQL raises sentences ("Only 2 of ... available"); Postgres internals don't start with a capital letter.
function looksHumanWritten(message) {
  return /^[A-Z"]/.test(message) && !/^(permission denied|new row violates)/i.test(message)
}

/** Throws a normalised Error if a Supabase response has an error. Returns data otherwise. */
export function unwrap({ data, error, count }) {
  if (error) {
    const e = new Error(friendlyError(error))
    e.code = error.code
    e.cause = error
    throw e
  }
  return count === undefined || count === null ? data : { data, count }
}
