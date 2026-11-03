import type { Persona } from '@/types/session'

import { db, respond } from './mockDb'

/**
 * Mock sign-in. With Supabase Auth this becomes `signInWithPassword` /
 * magic links; the persona is then built from the auth user plus their
 * `memberships` row (tenant + role) or a `platform_admins` row.
 */
export const platformAdmin: Persona = {
  kind: 'platform_admin',
  name: 'Alex Rivera',
  email: 'alex@sideline.app',
}

export interface DemoPersona {
  persona: Persona
  tenantName: string | null
  tenantSlug: string | null
}

export async function listDemoPersonas(): Promise<DemoPersona[]> {
  const staff = db.staff
    .filter((s) => s.status === 'active')
    .map((s) => {
      const tenant = db.tenants.find((t) => t.id === s.tenantId)!
      return {
        persona: {
          kind: 'staff',
          name: s.name,
          email: s.email,
          tenantId: s.tenantId,
          role: s.role,
        } satisfies Persona,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      }
    })
  return respond([{ persona: platformAdmin, tenantName: null, tenantSlug: null }, ...staff], 60)
}

/** Who signed in, and the business to open for staff. */
export interface AuthResult {
  persona: Persona
  tenantSlug: string | null
}

/** Mock sign-in: any password works; the email picks the persona. */
export async function signIn(email: string, _password: string): Promise<AuthResult> {
  const persona = await signInWithEmail(email)
  if (!persona) throw new Error('No active account with that email. Pick a demo account instead.')
  const slug =
    persona.kind === 'staff'
      ? (db.tenants.find((t) => t.id === persona.tenantId)?.slug ?? null)
      : null
  return { persona, tenantSlug: slug }
}

/** Mock sessions live in the session store (localStorage), so nothing to restore here. */
export async function restoreSession(): Promise<AuthResult | null> {
  return null
}

export async function signOut(): Promise<void> {}

export function onSignedOut(_callback: () => void): void {}

/** Shortest password the app accepts (Supabase's own minimum is lower). */
export const PASSWORD_MIN_LENGTH = 8

export function passwordProblem(password: string): string {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  return ''
}

/** Mock: pretends to email a reset link. */
export async function requestPasswordReset(_email: string): Promise<void> {
  await respond(null)
}

/** Mock: there is always a "recovery session" so the reset page can be tried. */
export async function hasRecoverySession(): Promise<boolean> {
  return respond(true)
}

/** Sets a new password for the signed-in (or recovering) user. Mock: no-op. */
export async function updatePassword(password: string): Promise<void> {
  const problem = passwordProblem(password)
  if (problem) throw new Error(problem)
  await respond(null)
}

/** Signed-in users: checks the current password, then sets the new one. */
export async function changePassword(_email: string, current: string, next: string): Promise<void> {
  if (!current) throw new Error('Enter your current password.')
  await updatePassword(next)
}

export async function signInWithEmail(email: string): Promise<Persona | null> {
  const normalized = email.trim().toLowerCase()
  if (normalized === platformAdmin.email) return respond(platformAdmin)
  const member = db.staff.find((s) => s.email.toLowerCase() === normalized && s.status === 'active')
  if (!member) return respond(null)
  return respond({
    kind: 'staff',
    name: member.name,
    email: member.email,
    tenantId: member.tenantId,
    role: member.role,
  })
}
