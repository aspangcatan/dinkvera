import { usingSupabase } from '@/config/env'

import * as mock from './mock/authService'
import * as remote from './supabase/authService'

export type { AuthResult, DemoPersona } from './mock/authService'
export { PASSWORD_MIN_LENGTH, passwordProblem } from './mock/authService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<
  typeof mock,
  | 'signIn'
  | 'restoreSession'
  | 'signOut'
  | 'onSignedOut'
  | 'listDemoPersonas'
  | 'requestPasswordReset'
  | 'hasRecoverySession'
  | 'updatePassword'
  | 'changePassword'
>
const api: Api = usingSupabase ? remote : mock

export const signIn = api.signIn
export const restoreSession = api.restoreSession
export const signOut = api.signOut
export const onSignedOut = api.onSignedOut
export const listDemoPersonas = api.listDemoPersonas
export const requestPasswordReset = api.requestPasswordReset
export const hasRecoverySession = api.hasRecoverySession
export const updatePassword = api.updatePassword
export const changePassword = api.changePassword
