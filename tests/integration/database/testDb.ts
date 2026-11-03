import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')
const SEED_FILE = join(process.cwd(), 'supabase', 'seed', 'demo_seed.sql')

/**
 * Disposable Postgres (PGlite) with every migration applied, plus minimal
 * stand-ins for what Supabase provides: an `auth` schema whose uid() reads
 * a session setting, and the anon / authenticated roles. Same approach as
 * match-pickleball's database tests.
 */
export async function createTestDb(options: { seed?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist } })

  await db.exec(`
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      email_confirmed_at timestamptz default now()
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.user_id', true), '')::uuid
    $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;

    -- Minimal stand-in for Supabase Storage (buckets + objects with RLS).
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets (id),
      name text,
      owner uuid
    );
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `)

  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }
  if (options.seed) await db.exec(readFileSync(SEED_FILE, 'utf8'))
  return db
}

/** Runs the following queries as the API's anon role (signed out). */
export async function asAnon(db: PGlite): Promise<void> {
  await db.exec(`reset role; select set_config('test.user_id', '', false); set role anon;`)
}

/** Runs the following queries as a signed-in user (RLS applies). */
export async function asUser(db: PGlite, userId: string): Promise<void> {
  await db.exec('reset role')
  await db.query(`select set_config('test.user_id', $1, false)`, [userId])
  await db.exec('set role authenticated')
}

/** Back to the superuser (no RLS), like the SQL Editor. */
export async function asService(db: PGlite): Promise<void> {
  await db.exec(`reset role; select set_config('test.user_id', '', false);`)
}

/** Creates an auth user (links any staff invite with that email). */
export async function createUser(db: PGlite, email: string): Promise<string> {
  await asService(db)
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  )
  return rows[0]!.id
}

export async function scalar<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<Record<string, T>>(sql, params)
  const row = rows[0]
  return (row ? Object.values(row)[0] : undefined) as T
}
