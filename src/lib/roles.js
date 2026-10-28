// Role helpers for shaping the UI. The database enforces the real rules
// (is_admin() / is_super_admin(), RLS and the workflow functions); these only
// decide what to show. Pure functions (tested).

export const ROLE_LABELS = { student: 'Student', admin: 'Admin', super_admin: 'Super Admin' }

/** Active lab staff: Admin or Super Admin. */
export function isStaff(profile) {
  return !!profile && (profile.role === 'admin' || profile.role === 'super_admin') && profile.status === 'active'
}

/** Active Super Admin: approves borrow and take-away requests, manages roles. */
export function isSuperAdmin(profile) {
  return !!profile && profile.role === 'super_admin' && profile.status === 'active'
}

/** Where a signed-in user lands. */
export function homePath(profile) {
  return profile && (profile.role === 'admin' || profile.role === 'super_admin') ? '/admin' : '/student'
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Student'
}
