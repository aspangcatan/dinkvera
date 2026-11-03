/**
 * Which data layer the app runs on.
 *
 * - `supabase`: Sideline's own Supabase project (URL + publishable key in
 *   .env.local). Never match-pickleball's project.
 * - `mock`: the in-memory prototype data in src/mocks — used when no
 *   Supabase keys are set, when VITE_DATA_SOURCE=mock, and in tests.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const env = {
  supabaseUrl: url,
  supabasePublishableKey: publishableKey,
  dataSource:
    import.meta.env.VITE_DATA_SOURCE === 'mock' || !url || !publishableKey
      ? ('mock' as const)
      : ('supabase' as const),
}

export const usingSupabase = env.dataSource === 'supabase'
