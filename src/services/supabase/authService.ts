import { supabase, unwrap } from '@/lib/supabase/client'
import type { Persona } from '@/types/session'
import type { StaffRole } from '@/types/staff'

import { passwordProblem, type AuthResult, type DemoPersona } from '../mock/authService'

interface Memberships {
  isPlatformAdmin: boolean
  memberships: {
    tenantId: string
    tenantSlug: string
    tenantName: string
    role: StaffRole
    name: string
    email: string
  }[]
}

/**
 * Builds the persona from the signed-in Supabase user: platform admins
 * (platform_admins row) or staff of a business (active staff_members row).
 * Someone with a login but neither is signed out again.
 */
async function personaForCurrentUser(): Promise<AuthResult | null> {
  const { data } = await supabase().auth.getUser()
  const user = data.user
  if (!user) return null
  const me = unwrap(await supabase().rpc('my_memberships')) as Memberships
  const email = user.email ?? ''

  if (me.isPlatformAdmin) {
    const name =
      (user.user_metadata?.full_name as string | undefined) ?? email.split('@')[0] ?? 'Admin'
    return { persona: { kind: 'platform_admin', name, email }, tenantSlug: null }
  }
  const first = me.memberships[0]
  if (!first) return null
  const persona: Persona = {
    kind: 'staff',
    name: first.name,
    email: first.email,
    tenantId: first.tenantId,
    role: first.role,
  }
  return { persona, tenantSlug: first.tenantSlug }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password })
  if (error) {
    throw new Error(
      error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message,
    )
  }
  const result = await personaForCurrentUser()
  if (!result) {
    await supabase().auth.signOut()
    throw new Error('This account isn’t linked to a business yet. Ask Sideline to add you.')
  }
  return result
}

export async function restoreSession(): Promise<AuthResult | null> {
  const { data } = await supabase().auth.getSession()
  if (!data.session) return null
  return personaForCurrentUser()
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut()
}

/** Calls back when the session ends elsewhere (expired, other tab). */
export function onSignedOut(callback: () => void): void {
  supabase().auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') callback()
  })
}

/** Supabase's own wording, made friendlier for the screens that show it. */
function authMessage(message: string): string {
  if (/rate limit|only request this after/i.test(message)) {
    return 'Too many requests. Please wait a minute and try again.'
  }
  if (/same.*(old|previous)|different from the old/i.test(message)) {
    return 'Choose a password you haven’t used before.'
  }
  if (/weak|pwned|leaked/i.test(message)) {
    return 'That password is too easy to guess. Try a longer one.'
  }
  return message
}

/**
 * Emails a reset link that opens /reset-password. Always looks successful,
 * so the form can't be used to find out which emails have accounts.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error && /rate limit|only request this after/i.test(error.message)) {
    throw new Error(authMessage(error.message))
  }
}

/**
 * True once the reset link has signed the user in (supabase-js reads the
 * token from the link when the page loads).
 */
export async function hasRecoverySession(): Promise<boolean> {
  const { data } = await supabase().auth.getSession()
  if (data.session) return true
  // The link may still be processing: wait briefly for the auth event.
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.unsubscribe()
      resolve(false)
    }, 2500)
    const {
      data: { subscription: sub },
    } = supabase().auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
        clearTimeout(timer)
        sub.unsubscribe()
        resolve(true)
      }
    })
  })
}

export async function updatePassword(password: string): Promise<void> {
  const problem = passwordProblem(password)
  if (problem) throw new Error(problem)
  const { error } = await supabase().auth.updateUser({ password })
  if (error) throw new Error(authMessage(error.message))
}

export async function changePassword(email: string, current: string, next: string): Promise<void> {
  if (!current) throw new Error('Enter your current password.')
  const problem = passwordProblem(next)
  if (problem) throw new Error(problem)
  // Re-checking the current password keeps someone at an unlocked computer
  // from changing it.
  const { error } = await supabase().auth.signInWithPassword({ email, password: current })
  if (error) {
    throw new Error(
      error.message === 'Invalid login credentials'
        ? 'Your current password is wrong.'
        : authMessage(error.message),
    )
  }
  await updatePassword(next)
}

/** Real accounts only: there are no one-click demo personas. */
export async function listDemoPersonas(): Promise<DemoPersona[]> {
  return []
}
