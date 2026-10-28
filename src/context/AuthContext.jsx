import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getProfile } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { isStaff, isSuperAdmin } from '../lib/roles'

const AuthContext = createContext(null)

const redirect = (path) => `${window.location.origin}${path}`

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(null)
  const [recovery, setRecovery] = useState(false)

  const userId = session?.user?.id ?? null

  const loadProfile = useCallback(async (id) => {
    if (!id) {
      setProfile(null)
      return null
    }
    try {
      // The profile row is created by a database trigger at sign-up; retry briefly in case
      // the first request races it.
      let p = await getProfile(id)
      for (let i = 0; !p && i < 3; i++) {
        await new Promise((r) => setTimeout(r, 400))
        p = await getProfile(id)
      }
      setProfile(p)
      setProfileError(p ? null : new Error('Your profile could not be found. Contact the lab administrator.'))
      return p
    } catch (e) {
      setProfileError(e)
      return null
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return undefined
    }
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session?.user?.id)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
      // Avoid awaiting Supabase calls inside the callback (can deadlock the auth lock).
      setTimeout(() => {
        if (active) loadProfile(s?.user?.id)
      }, 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const value = useMemo(() => {
    const user = session?.user ?? null
    return {
      session,
      user,
      profile,
      profileError,
      loading,
      recovery,
      isVerified: Boolean(user?.email_confirmed_at || user?.confirmed_at),
      // Staff = Admin or Super Admin. The database enforces the same split.
      isAdmin: isStaff(profile),
      isSuperAdmin: isSuperAdmin(profile),
      isActive: profile?.status === 'active',

      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw new Error(friendlyError(error))
        const p = await loadProfile(data.user.id)
        return p
      },

      async signUp({ email, password, fullName, srmId, department }) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: redirect('/auth/callback'),
            // Only descriptive fields. The database ignores anything else (roles are never taken from here).
            data: { full_name: fullName.trim(), srm_id: srmId?.trim() || null, department: department || null },
          },
        })
        if (error) throw new Error(friendlyError(error))
        // With email confirmation on, Supabase returns a user with no identities when the
        // address is already registered (to avoid leaking which emails exist).
        return { needsVerification: !data.session, user: data.user }
      },

      async resendVerification(email) {
        const { error } = await supabase.auth.resend({
          type: 'signup', email: email.trim(), options: { emailRedirectTo: redirect('/auth/callback') },
        })
        if (error) throw new Error(friendlyError(error))
      },

      async signOut() {
        await supabase.auth.signOut()
        setProfile(null)
        setSession(null)
        setRecovery(false)
      },

      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: redirect('/reset-password'),
        })
        if (error) throw new Error(friendlyError(error))
      },

      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw new Error(friendlyError(error))
        setRecovery(false)
      },

      refreshProfile: () => loadProfile(userId),
      setProfile,
    }
  }, [session, profile, profileError, loading, recovery, loadProfile, userId])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
