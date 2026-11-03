/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sideline's own Supabase project URL, e.g. https://xxxx.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Browser-safe publishable (anon) key of that project. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Force the in-memory prototype data: `mock`. */
  readonly VITE_DATA_SOURCE?: 'mock' | 'supabase'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
