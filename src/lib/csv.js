// CSV export helpers shared by the admin screens. Pure functions (tested).

/**
 * One CSV cell, always quoted. Text starting with = + - @ (or a tab / carriage
 * return) is prefixed with ' so spreadsheets show it instead of running it as a
 * formula. Numbers are left alone: they cannot be formulas.
 */
export function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v)
  const safe = typeof v === 'string' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

/** Header line plus one line per row. `cols` defaults to the first row's keys. */
export function toCsv(rows, cols = rows?.length ? Object.keys(rows[0]) : []) {
  if (!rows?.length && !cols.length) return ''
  return [cols.join(','), ...(rows || []).map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n')
}
