import { defineStore } from 'pinia'

import { usingSupabase } from '@/config/env'
import {
  onSignedOut,
  restoreSession,
  signIn,
  signOut,
  type AuthResult,
} from '@/services/authService'
import type { Persona } from '@/types/session'

const STORAGE_KEY = 'sideline.persona'

function readStored(): Persona | null {
  if (usingSupabase) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Persona) : null
  } catch {
    return null
  }
}

function store(persona: Persona | null): void {
  if (usingSupabase) return
  try {
    if (persona) localStorage.setItem(STORAGE_KEY, JSON.stringify(persona))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode: the mock session just won't survive a reload.
  }
}

/**
 * Who is signed in. With Supabase this is the real Supabase Auth session
 * (persona from my_memberships()); in mock mode it's a demo persona kept
 * in localStorage. Route guards are a UX convenience — RLS is the real
 * boundary, as in match-pickleball.
 */
export const useSessionStore = defineStore('session', {
  state: () => ({
    persona: readStored(),
    initialized: !usingSupabase,
  }),
  getters: {
    isAuthenticated: (state) => state.persona !== null,
    isPlatformAdmin: (state) => state.persona?.kind === 'platform_admin',
  },
  actions: {
    /** Restores an existing Supabase session once per page load. */
    async initialize(): Promise<void> {
      if (this.initialized) return
      try {
        const restored = await restoreSession()
        this.persona = restored?.persona ?? null
        onSignedOut(() => {
          this.persona = null
        })
      } finally {
        this.initialized = true
      }
    },

    /** Email + password sign-in (any password in mock mode). */
    async signInWithPassword(email: string, password: string): Promise<AuthResult> {
      const result = await signIn(email, password)
      this.persona = result.persona
      store(result.persona)
      return result
    },

    /** Mock mode only: one-click demo personas. */
    signIn(persona: Persona): void {
      this.persona = persona
      store(persona)
    },

    async signOut(): Promise<void> {
      await signOut()
      this.persona = null
      store(null)
    },
  },
})
