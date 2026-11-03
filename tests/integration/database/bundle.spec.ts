import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * supabase/apply/schema.sql is what gets pasted into the SQL Editor, so
 * it must contain every migration and run on an empty database.
 */
describe('supabase/apply/schema.sql', () => {
  const bundle = readFileSync(join(process.cwd(), 'supabase', 'apply', 'schema.sql'), 'utf8')

  it('is up to date with the migrations (run `npm run db:bundle`)', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations')
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      expect(bundle, file).toContain(readFileSync(join(dir, file), 'utf8').trim())
    }
  })

  it('runs on an empty database', async () => {
    const db = new PGlite({ extensions: { btree_gist } })
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key default gen_random_uuid(), email text,
        email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create role anon nologin;
      create role authenticated nologin;
      create schema storage;
      create table storage.buckets (id text primary key, name text not null, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets (id), name text, owner uuid);
    `)
    await db.exec(bundle)
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.plans')
    expect(rows[0]!.n).toBe(3)
  })
})
