import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/config/env'

let client: SupabaseClient | null = null

/**
 * The browser Supabase client (publishable key only — RLS and the
 * database functions are the security boundary). Created on first use so
 * mock mode never needs keys.
 */
export function supabase(): SupabaseClient {
  if (!client) {
    if (!env.supabaseUrl || !env.supabasePublishableKey) {
      throw new Error(
        'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).',
      )
    }
    client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}

let publicClient: SupabaseClient | null = null

/**
 * A client that is never signed in, for the public booking site's own
 * requests. The booking site shares the browser with the business dashboard,
 * so with the normal client an owner testing their own site would book as
 * staff and skip the player limits.
 */
export function publicSupabase(): SupabaseClient {
  if (!publicClient) {
    supabase() // same configuration check
    publicClient = createClient(env.supabaseUrl!, env.supabasePublishableKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'courtdesk-public',
      },
    })
  }
  return publicClient
}

/**
 * Turns a Supabase/PostgREST error into a plain Error with a message the
 * UI can show. Database functions raise readable messages already; a few
 * constraint errors get friendlier wording.
 */
export function toError(error: { message: string; code?: string; details?: string | null }): Error {
  if (error.code === '23505') {
    if (/staff_members/.test(error.message))
      return new Error('Someone with this email is already on the team.')
    if (/customers/.test(error.message))
      return new Error('A customer with this mobile number already exists.')
    if (/locations_tenant_slug/.test(error.message))
      return new Error('You already have a location with this name.')
    return new Error('That already exists.')
  }
  if (error.code === '23503') {
    return new Error(
      'This has booking history, so it can’t be deleted. Set it to inactive instead.',
    )
  }
  if (error.code === '42501') return new Error('You don’t have permission to do that.')
  return new Error(error.message)
}

type Result<T> = { data: T | null; error: { message: string; code?: string } | null }

/** Data of a query that must return something; throws on error or no data. */
export function unwrap<T>(result: Result<T>): T {
  if (result.error) throw toError(result.error)
  if (result.data === null) throw new Error('Not found')
  return result.data
}

/** Data of a query that may find nothing (`maybeSingle`). */
export function unwrapMaybe<T>(result: Result<T>): T | null {
  if (result.error) throw toError(result.error)
  return result.data
}

/** For calls that return nothing (void database functions, deletes). */
export function check(result: { error: { message: string; code?: string } | null }): void {
  if (result.error) throw toError(result.error)
}

/**
 * Reads past the API's 1,000-row page size by requesting consecutive
 * ranges (up to `max` rows). Used by lists that can be long, like a busy
 * business's 30 days of payments.
 */
export async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
  max = 10_000,
): Promise<T[]> {
  const size = 1000
  const rows: T[] = []
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw toError(error)
    rows.push(...(data ?? []))
    if (!data || data.length < size) break
  }
  return rows
}

/**
 * Readable message for a failed Storage upload. "Bucket not found" means
 * the storage migration hasn't been applied to this Supabase project yet.
 */
export function storageError(message: string, what: string): Error {
  if (/bucket not found/i.test(message)) {
    return new Error(`${what} aren't set up on this site yet. Please contact the venue.`)
  }
  if (/row-level security|unauthorized|403/i.test(message)) {
    return new Error(`${what}: you don't have permission to do that.`)
  }
  if (/exceeded the maximum allowed size|payload too large/i.test(message)) {
    return new Error('That file is too large.')
  }
  return new Error(message)
}
