import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

import { asAnon, asService, asUser, createTestDb, createUser, scalar } from './testDb'

/**
 * Database behaviour against the real migrations + demo seed: tenant
 * isolation (RLS), roles, the booking engine, payments and plan limits.
 */
let db: PGlite
const ids: Record<string, string> = {}

async function tenantId(slug: string): Promise<string> {
  await asService(db)
  return scalar<string>(db, 'select id from tenants where slug = $1', [slug])
}

/** A court of a tenant plus the first start hour N days from today with `hours` free hours. */
async function freeSlot(slug: string, daysAhead: number, offset = 0, hours = 1) {
  await asService(db)
  const { rows } = await db.query<{ court_id: string; date: string; hour: number }>(
    `select c.id as court_id, (local_today() + $2::int)::text as date, h as hour
       from courts c
       join locations l on l.id = c.location_id
       join tenants t on t.id = c.tenant_id
       cross join generate_series(l.open_hour, l.close_hour - $4::int) as h
      where t.slug = $1 and c.status = 'active' and l.status = 'active'
        and not exists (
          select 1 from bookings b
           where b.court_id = c.id and b.business_date = local_today() + $2::int
             and b.status in ('pending', 'confirmed', 'completed')
             and b.start_hour < h + $4::int and h < b.start_hour + b.duration_hours)
      order by c.name, h
      offset $3 limit 1`,
    [slug, daysAhead, offset, hours],
  )
  return {
    courtId: rows[0]!.court_id,
    date: rows[0]!.date,
    startHour: rows[0]!.hour,
    durationHours: 1,
  }
}

let phoneCounter = 0
const nextPhone = () =>
  `0917 ${String(3000000 + ++phoneCounter).replace(/(\d{3})(\d{4})/, '$1 $2')}`

async function book(
  tenant: string,
  slots: unknown[],
  extra: { phone?: string; source?: string; method?: string | null; pending?: boolean } = {},
) {
  const { rows } = await db.query<{
    r: { reference: string; total: number; bookingIds: string[] }
  }>(`select create_booking_group($1, $2::jsonb, 'Test Player', $3, '', '', $4, $5, $6) as r`, [
    tenant,
    JSON.stringify(slots),
    extra.phone ?? nextPhone(),
    extra.source ?? 'online',
    extra.method ?? null,
    extra.pending ?? true,
  ])
  return rows[0]!.r
}

beforeAll(async () => {
  db = await createTestDb({ seed: true })
  // Plan-change tests use Pro as an ordinary plan; "coming soon" has its own test.
  await asService(db)
  await db.query('update plans set coming_soon = false')
  ids.rally = await tenantId('rally-point')
  ids.dink = await tenantId('dink-and-drive')
  ids.kitchen = await tenantId('kitchen-line')
  ids.coast = await tenantId('coastline')
  // Logins for some demo business accounts (linked to their rows by email).
  ids.bea = await createUser(db, 'bea@rallypoint.ph') // Rally Point owner
  ids.karl = await createUser(db, 'karl@rallypoint.ph') // Rally Point's second account
  // Logins with no business account: they must see nothing private.
  ids.joy = await createUser(db, 'joy@rallypoint.ph')
  ids.aiza = await createUser(db, 'aiza@rallypoint.ph')
  ids.paolo = await createUser(db, 'paolo@dinkdrive.ph') // Dink & Drive owner
  ids.marivic = await createUser(db, 'marivic@kitchenline.club') // Kitchen Line owner
  ids.admin = await createUser(db, 'admin@sideline.app')
  await db.query('insert into platform_admins (user_id) values ($1)', [ids.admin])
})

describe('seed', () => {
  it('creates the 7 demo businesses with a realistic volume of data', async () => {
    await asService(db)
    expect(await scalar<number>(db, 'select count(*)::int from tenants')).toBe(7)
    expect(await scalar<number>(db, 'select count(*)::int from courts')).toBe(45)
    expect(await scalar<number>(db, 'select count(*)::int from bookings')).toBeGreaterThan(10000)
  })

  it('links a new login to the staff invite with the same email', async () => {
    await asService(db)
    const row = await db.query<{ user_id: string; status: string }>(
      "select user_id, status from staff_members where email = 'bea@rallypoint.ph'",
    )
    expect(row.rows[0]).toEqual({ user_id: ids.bea, status: 'active' })
  })
})

describe('tenant isolation (RLS)', () => {
  it('anon sees public venue data but no bookings, customers or payments', async () => {
    await asAnon(db)
    expect(await scalar<number>(db, 'select count(*)::int from courts')).toBe(45)
    // No grant at all for anon on private tables: refused outright.
    for (const table of [
      'bookings',
      'customers',
      'payments',
      'invoices',
      'staff_members',
      'booking_rows',
    ]) {
      await expect(db.query(`select * from ${table} limit 1`)).rejects.toThrow(/permission denied/)
    }
  })

  it("business accounts only see their own business's bookings and customers", async () => {
    await asUser(db, ids.bea!)
    expect(await scalar<number>(db, 'select count(distinct tenant_id)::int from bookings')).toBe(1)
    expect(await scalar<string>(db, 'select distinct tenant_id from customers')).toBe(ids.rally)
    expect(
      await scalar<number>(db, 'select count(*)::int from bookings where tenant_id = $1', [
        ids.dink,
      ]),
    ).toBe(0)
  })

  it('every business account has full access; logins without one see nothing', async () => {
    for (const user of [ids.bea!, ids.karl!]) {
      await asUser(db, user)
      expect(await scalar<number>(db, 'select count(*)::int from invoices')).toBeGreaterThan(0)
      expect(await scalar<number>(db, 'select count(*)::int from payments')).toBeGreaterThan(0)
    }
    await asUser(db, ids.joy!)
    expect(await scalar<number>(db, 'select count(*)::int from bookings')).toBe(0)
    expect(await scalar<number>(db, 'select count(*)::int from customers')).toBe(0)
  })

  it("can't edit another business, or change protected columns", async () => {
    await asUser(db, ids.bea!)
    const res = await db.query("update tenants set name = 'Hacked' where id = $1", [ids.dink])
    expect(res.affectedRows).toBe(0)
    await expect(
      db.query("update tenants set status = 'active' where id = $1", [ids.rally]),
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.query('insert into bookings (tenant_id) values ($1)', [ids.rally]),
    ).rejects.toThrow(/permission denied/)
  })

  it('the platform admin sees every business', async () => {
    await asUser(db, ids.admin!)
    expect(await scalar<number>(db, 'select count(distinct tenant_id)::int from bookings')).toBe(7)
    const overview = await scalar<{ tenants: { total: number }; rows: unknown[] }>(
      db,
      'select platform_overview()',
    )
    expect(overview.tenants.total).toBe(7)
    expect(overview.rows).toHaveLength(7)
  })
})

describe('booking engine', () => {
  it('books several dates under one reference; overlaps are refused', async () => {
    const a = await freeSlot('rally-point', 4)
    const b = await freeSlot('rally-point', 5)
    await asAnon(db)
    const group = await book(ids.rally!, [a, b], { method: 'gcash' })
    expect(group.bookingIds).toHaveLength(2)
    expect(group.reference).toMatch(/^RP-[0-9A-F]{6}$/)

    await asService(db)
    const rows = await db.query<{ status: string; group_id: string | null; reference: string }>(
      'select status, group_id, reference from bookings where id = any($1)',
      [group.bookingIds],
    )
    expect(new Set(rows.rows.map((r) => r.reference))).toEqual(new Set([group.reference]))
    expect(rows.rows.every((r) => r.status === 'pending' && r.group_id)).toBe(true)

    await asAnon(db)
    await expect(book(ids.rally!, [a])).rejects.toThrow(/overlaps another booking/)
    await expect(book(ids.rally!, [b, b])).rejects.toThrow(/overlap/)
  })

  it("online customers can't mark a booking as paid", async () => {
    const slot = await freeSlot('dink-and-drive', 3)
    await asAnon(db)
    const group = await book(ids.dink!, [slot], { method: 'card', pending: false })
    await asService(db)
    expect(
      await scalar<string>(db, 'select payment_status from bookings where id = $1', [
        group.bookingIds[0],
      ]),
    ).toBe('unpaid')
    expect(
      await scalar<string>(db, 'select status from payments where booking_id = $1', [
        group.bookingIds[0],
      ]),
    ).toBe('pending')
  })

  it('refuses walk-in bookings from anon, and any booking at a suspended business', async () => {
    const slot = await freeSlot('rally-point', 6)
    await asAnon(db)
    await expect(book(ids.rally!, [slot], { source: 'walk_in' })).rejects.toThrow(/permission/)
    await expect(book(ids.coast!, [slot])).rejects.toThrow(/not taking bookings/)
  })

  it('lookup needs the right phone number', async () => {
    const slot = await freeSlot('rally-point', 7)
    await asAnon(db)
    const group = await book(ids.rally!, [slot], { phone: '0917 888 7777' })
    const found = await scalar<unknown[]>(db, 'select lookup_booking($1, $2, $3)', [
      ids.rally,
      group.reference,
      '+63 917 888 7777',
    ])
    expect(found).toHaveLength(1)
    const wrong = await scalar<unknown[]>(db, 'select lookup_booking($1, $2, $3)', [
      ids.rally,
      group.reference,
      '0917 000 0000',
    ])
    expect(wrong).toHaveLength(0)
  })

  it('"collected" counts money on the day it is approved, not the play date', async () => {
    const slot = await freeSlot('kitchen-line', 9) // played next week
    await asAnon(db)
    const group = await book(ids.kitchen!, [slot], { method: 'gcash' })
    const collected = async () => {
      await asUser(db, ids.marivic!)
      return scalar<{ today: number; month: number }>(db, 'select tenant_collected($1)', [
        ids.kitchen,
      ])
    }
    const before = await collected()
    await asService(db)
    const paymentId = await scalar<string>(db, 'select id from payments where booking_id = $1', [
      group.bookingIds[0],
    ])
    const amount = await scalar<number>(db, 'select amount_centavos from payments where id = $1', [
      paymentId,
    ])
    await asUser(db, ids.marivic!)
    await db.query('select review_payment($1, true)', [paymentId])
    const after = await collected()
    expect(after.today - before.today).toBe(amount)
    expect(after.month - before.month).toBe(amount)
    // Other logins can't read a business's takings.
    await asUser(db, ids.aiza!)
    await expect(db.query('select tenant_collected($1)', [ids.kitchen])).rejects.toThrow(
      /permission/,
    )
  })

  it('approving one GCash proof confirms every date in the group', async () => {
    const a = await freeSlot('rally-point', 8)
    const b = await freeSlot('rally-point', 9)
    await asAnon(db)
    const group = await book(ids.rally!, [a, b], { method: 'gcash' })
    await asService(db)
    const paymentId = await scalar<string>(db, 'select id from payments where booking_id = $1', [
      group.bookingIds[0],
    ])

    await asUser(db, ids.aiza!) // no business account: can't review payments
    await expect(db.query('select review_payment($1, true)', [paymentId])).rejects.toThrow(
      /permission/,
    )

    await asUser(db, ids.karl!) // any of the business's accounts can
    await db.query('select review_payment($1, true)', [paymentId])
    const statuses = await db.query<{ status: string; payment_status: string }>(
      'select status, payment_status from bookings where id = any($1)',
      [group.bookingIds],
    )
    expect(statuses.rows).toEqual([
      { status: 'confirmed', payment_status: 'paid' },
      { status: 'confirmed', payment_status: 'paid' },
    ])
  })

  it('business accounts can book walk-ins, cancel with refund and reschedule', async () => {
    const slot = await freeSlot('rally-point', 10)
    await asUser(db, ids.karl!)
    const group = await book(ids.rally!, [slot], {
      source: 'walk_in',
      method: 'cash',
      pending: false,
    })
    const id = group.bookingIds[0]
    expect(
      await scalar<string>(db, 'select payment_status from bookings where id = $1', [id]),
    ).toBe('paid')

    const later = await freeSlot('rally-point', 11, 0, 2)
    await asUser(db, ids.karl!)
    await db.query('select reschedule_booking($1, $2, $3::date, $4, 2)', [
      id,
      later.courtId,
      later.date,
      later.startHour,
    ])
    await db.query('select cancel_booking($1, true)', [id])
    const row = await db.query<{ status: string; payment_status: string; duration_hours: number }>(
      'select status, payment_status, duration_hours from bookings where id = $1',
      [id],
    )
    expect(row.rows[0]).toEqual({
      status: 'cancelled',
      payment_status: 'refunded',
      duration_hours: 2,
    })
  })
})

describe('payment accounts and QR codes', () => {
  it('are public to read, but only the business’s accounts can change them', async () => {
    await asAnon(db)
    expect(
      await scalar<number>(db, 'select count(*)::int from payment_accounts where tenant_id = $1', [
        ids.rally,
      ]),
    ).toBe(3)
    await expect(
      db.query("update payment_accounts set account_number = 'x' where tenant_id = $1", [
        ids.rally,
      ]),
    ).rejects.toThrow(/permission denied/)

    await asUser(db, ids.joy!) // no business account
    const denied = await db.query(
      "update payment_accounts set account_number = 'x' where tenant_id = $1",
      [ids.rally],
    )
    expect(denied.affectedRows).toBe(0)

    await asUser(db, ids.bea!) // owner
    await db.query(
      `update payment_accounts set account_number = '0917 000 0000', qr_path = $1 || '/gcash.png'
        where tenant_id = $1 and method = 'gcash'`,
      [ids.rally],
    )
    // Another business's account and a QR outside the own folder are refused.
    const other = await db.query(
      "update payment_accounts set account_number = 'x' where tenant_id = $1",
      [ids.dink],
    )
    expect(other.affectedRows).toBe(0)
    await expect(
      db.query(
        `update payment_accounts set qr_path = $2 || '/hack.png' where tenant_id = $1 and method = 'gcash'`,
        [ids.rally, ids.dink],
      ),
    ).rejects.toThrow(/payment_accounts_qr_in_own_folder/)
  })

  it('lets a business upload QR images only into their own business folder', async () => {
    await asUser(db, ids.bea!)
    await db.query(
      "insert into storage.objects (bucket_id, name) values ('payment-qr', $1 || '/gcash-1.png')",
      [ids.rally],
    )
    await expect(
      db.query(
        "insert into storage.objects (bucket_id, name) values ('payment-qr', $1 || '/gcash-1.png')",
        [ids.dink],
      ),
    ).rejects.toThrow(/row-level security/)
    await asUser(db, ids.joy!)
    await expect(
      db.query(
        "insert into storage.objects (bucket_id, name) values ('payment-qr', $1 || '/x.png')",
        [ids.rally],
      ),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('payment proofs', () => {
  it('customer uploads a screenshot and attaches it with reference + phone; only the business can see it', async () => {
    const a = await freeSlot('rally-point', 12)
    const b = await freeSlot('rally-point', 13)
    await asAnon(db)
    const group = await book(ids.rally!, [a, b], { method: 'gcash', phone: '0917 222 9999' })
    const path = `${ids.rally}/${group.reference}/proof.png`

    // Upload into the booking's folder (anon may insert, never read back).
    await db.query("insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)", [
      path,
    ])
    expect(
      await scalar<number>(
        db,
        "select count(*)::int from storage.objects where bucket_id = 'payment-proofs'",
      ),
    ).toBe(0)
    // A folder that isn't a business, or a booking that doesn't exist, is refused.
    await expect(
      db.query(
        "insert into storage.objects (bucket_id, name) values ('payment-proofs', 'not-a-tenant/x.png')",
      ),
    ).rejects.toThrow(/row-level security/)
    await expect(
      db.query("insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)", [
        `${ids.rally}/RP-NOPE00/x.png`,
      ]),
    ).rejects.toThrow(/row-level security/)

    // Wrong phone: refused. Right phone: both dates' payments get the proof.
    await expect(
      db.query('select attach_payment_proof($1, $2, $3, $4)', [
        ids.rally,
        group.reference,
        '0917 000 0000',
        path,
      ]),
    ).rejects.toThrow(/No payment waiting/)
    await expect(
      db.query('select attach_payment_proof($1, $2, $3, $4)', [
        ids.rally,
        group.reference,
        '0917 222 9999',
        `${ids.rally}/${group.reference}/missing.png`,
      ]),
    ).rejects.toThrow(/Upload your payment screenshot/)
    const attached = await scalar<number>(db, 'select attach_payment_proof($1, $2, $3, $4, $5)', [
      ids.rally,
      group.reference,
      '0917 222 9999',
      path,
      'GC-123456',
    ])
    expect(attached).toBe(2)

    await asUser(db, ids.karl!) // any business account can see it
    const rows = await db.query<{ proof_path: string; transaction_reference: string }>(
      'select proof_path, transaction_reference from payment_rows where booking_id = any($1)',
      [group.bookingIds],
    )
    expect(rows.rows).toEqual([
      { proof_path: path, transaction_reference: 'GC-123456' },
      { proof_path: path, transaction_reference: 'GC-123456' },
    ])
    expect(
      await scalar<number>(db, 'select count(*)::int from storage.objects where name = $1', [path]),
    ).toBe(1)

    await asUser(db, ids.aiza!) // no business account
    expect(
      await scalar<number>(db, 'select count(*)::int from storage.objects where name = $1', [path]),
    ).toBe(0)
    await asUser(db, ids.paolo!) // another business
    expect(
      await scalar<number>(db, 'select count(*)::int from storage.objects where name = $1', [path]),
    ).toBe(0)
  })
})

describe('homepage banner (branding)', () => {
  it('owner can switch to a carousel of up to 3 photos in their own folder', async () => {
    await asUser(db, ids.bea!)
    await db.query(
      "insert into storage.objects (bucket_id, name) values ('branding', $1 || '/hero-1.jpg')",
      [ids.rally],
    )
    await db.query(
      `update tenants set hero_style = 'carousel',
         hero_images = array[$1 || '/hero-1.jpg', $1 || '/hero-2.jpg', $1 || '/hero-3.jpg'] where id = $1`,
      [ids.rally],
    )
    expect(
      await scalar<string>(db, 'select hero_style from tenants where id = $1', [ids.rally]),
    ).toBe('carousel')
    await expect(
      db.query(
        `update tenants set hero_images = array[$1 || '/1', $1 || '/2', $1 || '/3', $1 || '/4'] where id = $1`,
        [ids.rally],
      ),
    ).rejects.toThrow(/tenants_hero_images_max/)
    await expect(
      db.query(`update tenants set hero_images = array[$2 || '/x.jpg'] where id = $1`, [
        ids.rally,
        ids.dink,
      ]),
    ).rejects.toThrow(/tenants_hero_images_in_own_folder/)
    // Another business's folder, and a login with no business account, are refused.
    await expect(
      db.query(
        "insert into storage.objects (bucket_id, name) values ('branding', $1 || '/x.jpg')",
        [ids.dink],
      ),
    ).rejects.toThrow(/row-level security/)
    await asUser(db, ids.joy!)
    await expect(
      db.query(
        "insert into storage.objects (bucket_id, name) values ('branding', $1 || '/y.jpg')",
        [ids.rally],
      ),
    ).rejects.toThrow(/row-level security/)
    // Visitors load photos by public URL but can't list the bucket; the owner
    // can see their own files (Storage's remove() needs that).
    const listed = () =>
      scalar<number>(db, "select count(*)::int from storage.objects where bucket_id = 'branding'")
    await asAnon(db)
    expect(await listed()).toBe(0)
    await asUser(db, ids.bea!)
    expect(await listed()).toBe(1)
  })
})

describe('customer tags', () => {
  it("each business keeps its own private list; bad lists and others' lists are refused", async () => {
    await asUser(db, ids.bea!)
    await db.query(
      `insert into customer_tag_lists (tenant_id, tags) values ($1, array['VIP', 'Coach'])`,
      [ids.rally],
    )
    expect(
      await scalar<string[]>(db, 'select tags from customer_tag_lists where tenant_id = $1', [
        ids.rally,
      ]),
    ).toEqual(['VIP', 'Coach'])
    // The app saves with a plain update: an upsert (what PostgREST sends)
    // also rewrites tenant_id, which business accounts may not update.
    await expect(
      db.query(
        `insert into customer_tag_lists (tenant_id, tags) values ($1, array['VIP'])
         on conflict (tenant_id) do update set tenant_id = excluded.tenant_id, tags = excluded.tags`,
        [ids.rally],
      ),
    ).rejects.toThrow(/permission denied/)
    await db.query(`update customer_tag_lists set tags = array['VIP'] where tenant_id = $1`, [
      ids.rally,
    ])
    for (const bad of [['New'], ['VIP', 'vip'], [' VIP'], ['x'.repeat(25)], ['']]) {
      await expect(
        db.query('update customer_tag_lists set tags = $2 where tenant_id = $1', [ids.rally, bad]),
      ).rejects.toThrow(/customer_tag_lists_valid/)
    }
    await expect(
      db.query(`insert into customer_tag_lists (tenant_id, tags) values ($1, array['X'])`, [
        ids.dink,
      ]),
    ).rejects.toThrow(/row-level security/)

    // Not readable by the booking site, other businesses or logins without a business.
    const visible = () => scalar<number>(db, 'select count(*)::int from customer_tag_lists')
    await asUser(db, ids.paolo!)
    expect(await visible()).toBe(0)
    await asUser(db, ids.joy!)
    expect(await visible()).toBe(0)
    await asAnon(db)
    await expect(visible()).rejects.toThrow(/permission denied/)
  })
})

describe('day / night court rates', () => {
  it('prices each hour by the court’s own night start, including past midnight', async () => {
    await asService(db)
    // Third Shot (Clark) is open 8 AM – 1 AM; its courts are ₱300 day / ₱400 night from 5 PM.
    const courtId = await scalar<string>(
      db,
      "select c.id from courts c join locations l on l.id = c.location_id where l.slug = 'clark' limit 1",
    )
    const price = (start: number, hours: number) =>
      scalar<number>(db, 'select booking_price($1, local_today(), $2, $3)', [courtId, start, hours])

    expect(await price(10, 1)).toBe(30000) // day
    expect(await price(16, 2)).toBe(30000 + 40000) // 4–6 PM: one day hour, one night hour
    expect(await price(23, 2)).toBe(80000) // 11 PM – 1 AM: night, past midnight

    await db.query('update courts set night_start_hour = 20 where id = $1', [courtId])
    expect(await price(17, 1)).toBe(30000) // night now starts at 8 PM
  })
})

describe('plans, limits and business accounts', () => {
  it('prices plans at ₱999 / ₱1,799 / ₱3,999 a month, with day & night rates on every plan', async () => {
    await asService(db)
    const { rows } = await db.query<{
      id: string
      monthly: number
      annual: number
      features: string[]
    }>(
      `select id, monthly_price_centavos as monthly, annual_price_centavos as annual, features
         from plans where id in ('starter', 'growth', 'pro') order by monthly_price_centavos`,
    )
    expect(rows.map((r) => [r.id, r.monthly, r.annual])).toEqual([
      ['starter', 99900, 999000],
      ['growth', 179900, 1799000],
      ['pro', 399900, 3999000],
    ])
    // Listed once, on Starter; the others say "Everything in Starter/Growth".
    expect(rows[0]!.features).toContain('Day & night rates')
    expect(rows[1]!.features).not.toContain('Day & night rates')
    expect(rows[1]!.features).toContain('Everything in Starter')
  })

  it('blocks a 5th court on the Starter plan, then allows it after upgrading', async () => {
    await asService(db)
    const locationId = await scalar<string>(db, 'select id from locations where tenant_id = $1', [
      ids.kitchen,
    ])
    const insertCourt = () =>
      db.query(
        `insert into courts (tenant_id, location_id, name, day_rate_centavos, night_rate_centavos)
         values ($1, $2, 'Court 5', 20000, 30000)`,
        [ids.kitchen, locationId],
      )

    await asUser(db, ids.marivic!)
    await expect(insertCourt()).rejects.toThrow(/Starter plan includes 4 courts/)
    // The owner can only ask; the plan changes when Sideline approves.
    await expect(
      db.query("select change_plan($1, 'growth', 'monthly')", [ids.kitchen]),
    ).rejects.toThrow(/confirmed by Sideline/)
    // The demo seed already has Kitchen Line's request for Growth waiting.
    await expect(
      db.query("select request_plan_change($1, 'growth', 'monthly', 'Need a 5th court')", [
        ids.kitchen,
      ]),
    ).rejects.toThrow(/already have a plan change request/)
    const requestId = await scalar<string>(
      db,
      "select id from plan_requests where tenant_id = $1 and status = 'pending'",
      [ids.kitchen],
    )
    await expect(insertCourt()).rejects.toThrow(/Starter plan includes 4 courts/)
    await expect(db.query('select decide_plan_request($1, true)', [requestId])).rejects.toThrow(
      /permission/,
    )

    await asUser(db, ids.admin!)
    await db.query("select decide_plan_request($1, true, 'Paid via GCash')", [requestId])
    await asUser(db, ids.marivic!)
    expect(
      await scalar<string>(db, 'select status from plan_requests where id = $1', [requestId]),
    ).toBe('approved')
    await insertCourt()
    expect(
      await scalar<number>(db, 'select count(*)::int from courts where tenant_id = $1', [
        ids.kitchen,
      ]),
    ).toBe(5)
  })

  it("won't request a plan below current usage, or a hidden one", async () => {
    await asUser(db, ids.bea!) // Rally Point: 3 locations
    await expect(
      db.query("select request_plan_change($1, 'starter', 'monthly')", [ids.rally]),
    ).rejects.toThrow(/Can't switch/)
    await asService(db)
    await db.query("update plans set is_public = false where id = 'pro'")
    await asUser(db, ids.bea!)
    await expect(
      db.query("select request_plan_change($1, 'pro', 'monthly')", [ids.rally]),
    ).rejects.toThrow(/Contact Sideline/)
    await asService(db)
    await db.query("update plans set is_public = true where id = 'pro'")
    await asUser(db, ids.bea!)
    await expect(
      db.query("select request_plan_change($1, 'growth', 'monthly')", [ids.rally]),
    ).rejects.toThrow(/already on this plan/)
  })

  it("won't request a plan that's coming soon", async () => {
    await asService(db)
    await db.query("update plans set coming_soon = true where id = 'pro'")
    await asUser(db, ids.bea!) // Rally Point: Growth
    await expect(
      db.query("select request_plan_change($1, 'pro', 'monthly')", [ids.rally]),
    ).rejects.toThrow(/coming soon/)
    await asService(db)
    await db.query("update plans set coming_soon = false where id = 'pro'")
  })

  it('one pending request at a time; owners can cancel, admins can decline with a reason', async () => {
    await asUser(db, ids.bea!)
    const first = await scalar<string>(db, "select request_plan_change($1, 'pro', 'annual')", [
      ids.rally,
    ])
    await expect(
      db.query("select request_plan_change($1, 'pro', 'monthly')", [ids.rally]),
    ).rejects.toThrow(/already have a plan change request/)
    await db.query('select cancel_plan_request($1)', [first])
    // Another business can't see or cancel Rally Point's requests.
    const second = await scalar<string>(db, "select request_plan_change($1, 'pro', 'monthly')", [
      ids.rally,
    ])
    await asUser(db, ids.paolo!)
    expect(await scalar<number>(db, 'select count(*)::int from plan_requests')).toBe(0)
    await expect(db.query('select cancel_plan_request($1)', [second])).rejects.toThrow(/not found/)

    await asUser(db, ids.admin!)
    await db.query("select decide_plan_request($1, false, 'Payment not received yet')", [second])
    await expect(db.query('select decide_plan_request($1, true)', [second])).rejects.toThrow(
      /already handled/,
    )
    await asUser(db, ids.bea!)
    const rows = await db.query<{ status: string; decision_note: string }>(
      'select status, decision_note from plan_requests where tenant_id = $1 order by created_at',
      [ids.rally],
    )
    expect(rows.rows).toEqual([
      { status: 'cancelled', decision_note: '' },
      { status: 'declined', decision_note: 'Payment not received yet' },
    ])
    expect(
      await scalar<string>(db, 'select plan_id from subscriptions where tenant_id = $1', [
        ids.rally,
      ]),
    ).toBe('growth')
    // Direct writes are refused.
    await expect(
      db.query("update plan_requests set status = 'approved' where id = $1", [second]),
    ).rejects.toThrow(/permission denied/)
  })

  it('only the platform admin adds, disables or removes business accounts', async () => {
    await asUser(db, ids.bea!)
    await expect(
      db.query(
        `insert into staff_members (tenant_id, name, email) values ($1, 'Extra', 'extra@rallypoint.ph')`,
        [ids.rally],
      ),
    ).rejects.toThrow(/row-level security|Only Sideline/)
    const del = await db.query("delete from staff_members where email = 'karl@rallypoint.ph'")
    expect(del.affectedRows).toBe(0)
    const upd = await db.query(
      "update staff_members set status = 'disabled' where email = 'karl@rallypoint.ph'",
    )
    expect(upd.affectedRows).toBe(0)

    await asUser(db, ids.admin!)
    await db.query(
      `insert into staff_members (tenant_id, name, email) values ($1, 'Extra', 'extra@rallypoint.ph')`,
      [ids.rally],
    )
    const row = await db.query<{ role: string; status: string }>(
      "select role, status from staff_members where email = 'extra@rallypoint.ph'",
    )
    expect(row.rows[0]).toEqual({ role: 'owner', status: 'invited' })
    // Roles are gone: every account is a full-access account.
    await expect(
      db.query(
        `insert into staff_members (tenant_id, name, email, role) values ($1, 'Desk', 'desk@rallypoint.ph', 'front_desk')`,
        [ids.rally],
      ),
    ).rejects.toThrow(/staff_members_role_check/)
    await db.query(
      "update staff_members set status = 'disabled' where email = 'karl@rallypoint.ph'",
    )
    await asUser(db, ids.karl!)
    expect(await scalar<number>(db, 'select count(*)::int from bookings')).toBe(0)
    await asUser(db, ids.admin!)
    await db.query("update staff_members set status = 'active' where email = 'karl@rallypoint.ph'")
    await db.query("delete from staff_members where email = 'extra@rallypoint.ph'")
  })

  it('onboards a new business with a trial and an owner invite', async () => {
    await asUser(db, ids.admin!)
    const id = await scalar<string>(
      db,
      "select create_tenant('Smash Court PH', 'Ana Cruz', 'ana@smashcourt.ph', '', 'Cebu', 'starter', '#15803d')",
    )
    const row = await db.query<{ slug: string; status: string; monogram: string }>(
      'select slug, status, brand_monogram as monogram from tenants where id = $1',
      [id],
    )
    expect(row.rows[0]).toEqual({ slug: 'smash-court-ph', status: 'trialing', monogram: 'SC' })

    await asUser(db, ids.bea!)
    await expect(db.query("select create_tenant('Sneaky', 'X', 'x@x.ph')")).rejects.toThrow(
      /permission/,
    )
  })

  it('my_memberships tells the app who is signed in', async () => {
    await asUser(db, ids.bea!)
    const me = await scalar<{
      isPlatformAdmin: boolean
      memberships: { tenantSlug: string; role: string }[]
    }>(db, 'select my_memberships()')
    expect(me.isPlatformAdmin).toBe(false)
    expect(me.memberships).toEqual([
      expect.objectContaining({ tenantSlug: 'rally-point', role: 'owner' }),
    ])
  })

  it('reports and usage return the shapes the app expects', async () => {
    await asUser(db, ids.bea!)
    const analytics = await scalar<Record<string, unknown>>(
      db,
      'select tenant_analytics($1, local_today() - 29, local_today(), null)',
      [ids.rally],
    )
    expect(Object.keys(analytics).sort()).toEqual(
      [
        'byCourt',
        'byHour',
        'byLocation',
        'byMethod',
        'bySource',
        'current',
        'daily',
        'funnel',
        'previous',
      ].sort(),
    )
    expect((analytics.daily as unknown[]).length).toBe(30)
    const usage = await scalar<{ key: string }[]>(db, 'select tenant_usage($1)', [ids.rally])
    expect(usage.map((u) => u.key)).toEqual(['locations', 'courts', 'bookingsPerMonth'])

    await asUser(db, ids.paolo!)
    await expect(
      db.query('select tenant_analytics($1, local_today() - 6, local_today(), null)', [ids.rally]),
    ).rejects.toThrow(/permission/)
  })
})

describe('rules & policies', () => {
  const policies = JSON.stringify([
    { title: 'House rules', body: '- Non-marking shoes only\n- No food on court' },
    { title: 'Refunds', body: 'Cancel 24 hours ahead for a full refund.' },
  ])

  it('owner saves policies, everyone can read them, staff without settings cannot change them', async () => {
    await asUser(db, ids.bea!)
    await db.query('update tenants set policies = $2::jsonb where id = $1', [ids.rally, policies])
    await asAnon(db)
    expect(
      await scalar<string>(db, "select policies -> 0 ->> 'title' from tenants where id = $1", [
        ids.rally,
      ]),
    ).toBe('House rules')
    // No business account: the update matches no rows it may change.
    await asUser(db, ids.joy!)
    await db.query(`update tenants set policies = '[]'::jsonb where id = $1`, [ids.rally])
    expect(
      await scalar<number>(db, 'select jsonb_array_length(policies) from tenants where id = $1', [
        ids.rally,
      ]),
    ).toBe(2)
  })

  it('rejects malformed sections', async () => {
    await asUser(db, ids.bea!)
    const bad = [
      [{ title: '', body: 'x' }],
      [{ title: 'x'.repeat(81), body: '' }],
      [{ title: 'Rules', body: 'x'.repeat(4001) }],
      [{ title: 'Rules', body: 'ok', html: '<script>' }],
      Array.from({ length: 11 }, (_, i) => ({ title: `S${i}`, body: '' })),
      { title: 'not a list', body: '' },
    ]
    for (const p of bad) {
      await expect(
        db.query('update tenants set policies = $2::jsonb where id = $1', [
          ids.rally,
          JSON.stringify(p),
        ]),
      ).rejects.toThrow(/tenants_policies_valid/)
    }
  })
})

describe('abuse protection (public booking site)', () => {
  const asNetwork = (ip: string) =>
    db.query("select set_config('request.headers', $1, false)", [
      JSON.stringify({ 'x-forwarded-for': `${ip}, 10.0.0.1` }),
    ])
  const noNetwork = () => db.query("select set_config('request.headers', '', false)")

  it('one phone number can hold at most 3 unpaid upcoming bookings per business', async () => {
    const phone = '0917 444 5555'
    for (let i = 0; i < 3; i++) {
      const slot = await freeSlot('kitchen-line', 10, i)
      await asAnon(db)
      await book(ids.kitchen!, [slot], { phone, method: 'gcash' })
    }
    const fourth = await freeSlot('kitchen-line', 10, 3)
    await asAnon(db)
    await expect(book(ids.kitchen!, [fourth], { phone, method: 'gcash' })).rejects.toThrow(
      /already has 3 unpaid bookings/,
    )
    // Another business, and the venue itself, aren't affected.
    const elsewhere = await freeSlot('rally-point', 10, 5)
    await asAnon(db)
    await book(ids.rally!, [elsewhere], { phone, method: 'gcash' })
    await asUser(db, ids.marivic!)
    await book(ids.kitchen!, [fourth], { phone, source: 'phone', method: 'cash', pending: false })
  })

  it('each business sets how many unpaid bookings one phone may hold', async () => {
    await asService(db)
    await db.query('update booking_rules set max_unpaid_bookings = 1 where tenant_id = $1', [
      ids.kitchen,
    ])
    try {
      const phone = '0917 444 6666'
      await asAnon(db)
      await book(ids.kitchen!, [await freeSlot('kitchen-line', 11, 0)], { phone, method: 'gcash' })
      const second = await freeSlot('kitchen-line', 11, 1)
      await asAnon(db)
      await expect(book(ids.kitchen!, [second], { phone, method: 'gcash' })).rejects.toThrow(
        /already has 1 unpaid booking here/,
      )
    } finally {
      await asService(db)
      await db.query('update booking_rules set max_unpaid_bookings = 3 where tenant_id = $1', [
        ids.kitchen,
      ])
    }
  })

  it('limits the hours one phone can book on one court per day', async () => {
    await asService(db)
    const originalMax = await scalar<number>(
      db,
      'select max_duration_minutes from booking_rules where tenant_id = $1',
      [ids.dink],
    )
    await expect(
      db.query(
        'update booking_rules set max_duration_minutes = 180, max_court_hours_per_day = 2 where tenant_id = $1',
        [ids.dink],
      ),
    ).rejects.toThrow(/booking_rules_court_day_cap/)
    await db.query(
      'update booking_rules set max_duration_minutes = 120, max_court_hours_per_day = 3 where tenant_id = $1',
      [ids.dink],
    )
    try {
      const s = await freeSlot('dink-and-drive', 6, 0, 5)
      const early = { ...s, durationHours: 2 }
      const late = { ...s, startHour: s.startHour + 3, durationHours: 2 }
      const phone = '0917 444 7777'
      // Two picks in one booking: 4 hours on one court.
      await asAnon(db)
      await expect(book(ids.dink!, [early, late], { phone, method: 'gcash' })).rejects.toThrow(
        /up to 3 hours on .* per day/,
      )
      // Or one booking after another. The booking site's pre-check (Continue
      // on "Your details") gives the same answer before anything is booked.
      const precheck = (slots: unknown[]) =>
        db.query('select check_player_limits($1, $2::jsonb, $3)', [
          ids.dink,
          JSON.stringify(slots),
          phone,
        ])
      await precheck([early])
      await book(ids.dink!, [early], { phone, method: 'gcash' })
      await expect(precheck([late])).rejects.toThrow(/up to 3 hours on .* per day/)
      await expect(
        db.query('select assert_player_limits($1, $2::jsonb, $3)', [ids.dink, '[]', phone]),
      ).rejects.toThrow(/permission denied/)
      await expect(book(ids.dink!, [late], { phone, method: 'gcash' })).rejects.toThrow(
        /up to 3 hours on .* per day/,
      )
      // Another player, and the venue itself, aren't limited.
      await book(ids.dink!, [{ ...late, durationHours: 1 }], { method: 'gcash' })
      await asUser(db, ids.admin!)
      await book(ids.dink!, [{ ...late, startHour: late.startHour + 1, durationHours: 1 }], {
        phone,
        source: 'phone',
        method: 'cash',
        pending: false,
      })
    } finally {
      await asService(db)
      await db.query(
        'update booking_rules set max_court_hours_per_day = null, max_duration_minutes = $2 where tenant_id = $1',
        [ids.dink, originalMax],
      )
    }
  })

  it('one network can make at most 15 online bookings per business per hour', async () => {
    try {
      for (let i = 0; i < 15; i++) {
        const slot = await freeSlot('dink-and-drive', 20, i)
        await asAnon(db)
        await asNetwork('203.0.113.7')
        await book(ids.dink!, [slot], { method: 'gcash' })
      }
      const slot = await freeSlot('dink-and-drive', 20, 15)
      await asAnon(db)
      await asNetwork('203.0.113.7')
      await expect(book(ids.dink!, [slot], { method: 'gcash' })).rejects.toThrow(
        /Too many attempts/,
      )
      // A different network is fine.
      await asNetwork('198.51.100.9')
      await book(ids.dink!, [slot], { method: 'gcash' })
    } finally {
      await noNetwork()
    }
  })

  it('limits guessing on Find my booking', async () => {
    const slot = await freeSlot('rally-point', 11)
    await asAnon(db)
    const group = await book(ids.rally!, [slot], { phone: '0917 666 1212' })
    for (let i = 0; i < 10; i++) {
      await db.query('select lookup_booking($1, $2, $3)', [
        ids.rally,
        group.reference,
        `0917 000 ${String(1000 + i)}`,
      ])
    }
    await expect(
      db.query('select lookup_booking($1, $2, $3)', [ids.rally, group.reference, '0917 666 1212']),
    ).rejects.toThrow(/Too many attempts/)
  })

  it('allows at most 3 proof files per booking', async () => {
    const slot = await freeSlot('rally-point', 12, 4)
    await asAnon(db)
    const group = await book(ids.rally!, [slot], { method: 'gcash' })
    for (let i = 1; i <= 3; i++) {
      await db.query(
        "insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)",
        [`${ids.rally}/${group.reference}/${i}.png`],
      )
    }
    await expect(
      db.query("insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)", [
        `${ids.rally}/${group.reference}/4.png`,
      ]),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('invoice payments (manual, reviewed by Sideline)', () => {
  it('a business sends proof; only a platform admin can approve, which settles past_due', async () => {
    const rico = await createUser(db, 'rico@thirdshot.ph') // Third Shot owner (past_due)
    const third = await tenantId('third-shot')
    const invoice = await scalar<string>(
      db,
      "select id from invoices where tenant_id = $1 and status = 'overdue' order by issued_at desc limit 1",
      [third],
    )
    const path = `${third}/${invoice}/proof.png`

    // Owners can no longer mark their own invoice paid.
    await asUser(db, rico)
    await expect(db.query('select mark_invoice_paid($1)', [invoice])).rejects.toThrow(
      /Sideline confirms payments/,
    )
    // Proof must be uploaded into the invoice's own folder first.
    await expect(
      db.query("select submit_invoice_payment($1, 'gcash', $2)", [invoice, path]),
    ).rejects.toThrow(/Upload your proof/)
    await db.query("insert into storage.objects (bucket_id, name) values ('invoice-proofs', $1)", [
      path,
    ])
    await db.query("select submit_invoice_payment($1, 'gcash', $2, 'GC-778899')", [invoice, path])

    // Another business can't upload into it, see it, or review it.
    await asUser(db, ids.bea!)
    await expect(
      db.query("insert into storage.objects (bucket_id, name) values ('invoice-proofs', $1)", [
        `${third}/${invoice}/sneaky.png`,
      ]),
    ).rejects.toThrow(/row-level security/)
    expect(
      await scalar<number>(db, 'select count(*)::int from storage.objects where name = $1', [path]),
    ).toBe(0)
    await expect(db.query('select review_invoice_payment($1, true)', [invoice])).rejects.toThrow(
      /permission/,
    )

    // Admin declines (reason required), business resends, admin approves.
    await asUser(db, ids.admin!)
    expect(
      await scalar<number>(db, 'select count(*)::int from storage.objects where name = $1', [path]),
    ).toBe(1)
    await expect(db.query('select review_invoice_payment($1, false)', [invoice])).rejects.toThrow(
      /why/,
    )
    await db.query("select review_invoice_payment($1, false, 'Amount is short by ₱100')", [invoice])
    await asUser(db, rico)
    const declined = await db.query<{ proof_submitted_at: string | null; review_note: string }>(
      'select proof_submitted_at, review_note from invoices where id = $1',
      [invoice],
    )
    expect(declined.rows[0]).toEqual({
      proof_submitted_at: null,
      review_note: 'Amount is short by ₱100',
    })
    await db.query("select submit_invoice_payment($1, 'bank_transfer', $2)", [invoice, path])

    await asUser(db, ids.admin!)
    await db.query('select review_invoice_payment($1, true)', [invoice])
    await asService(db)
    expect(await scalar<string>(db, 'select status from invoices where id = $1', [invoice])).toBe(
      'paid',
    )
    expect(
      await scalar<string>(db, 'select status from subscriptions where tenant_id = $1', [third]),
    ).toBe('active')
    expect(await scalar<string>(db, 'select status from tenants where id = $1', [third])).toBe(
      'active',
    )
    // Paid invoices take no more uploads.
    await asUser(db, rico)
    await expect(
      db.query("insert into storage.objects (bucket_id, name) values ('invoice-proofs', $1)", [
        `${third}/${invoice}/again.png`,
      ]),
    ).rejects.toThrow(/row-level security/)
  })

  it("Sideline's payment details are readable by businesses and editable by admins only", async () => {
    await asUser(db, ids.admin!)
    await db.query(
      "insert into platform_payment_accounts (method, account_name, account_number) values ('gcash', 'Sideline', '0917 000 1111')",
    )
    await db.query(
      "insert into storage.objects (bucket_id, name) values ('payment-qr', 'sideline/gcash.png')",
    )
    await asUser(db, ids.bea!)
    expect(
      await scalar<string>(
        db,
        "select account_number from platform_payment_accounts where method = 'gcash'",
      ),
    ).toBe('0917 000 1111')
    await expect(
      db.query(
        "update platform_payment_accounts set account_number = '1' where method = 'gcash' returning 1",
      ),
    ).resolves.toMatchObject({ rows: [] })
    await expect(
      db.query(
        "insert into storage.objects (bucket_id, name) values ('payment-qr', 'sideline/fake.png')",
      ),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('trial requests (marketing site)', () => {
  const asNetwork = (ip: string) =>
    db.query("select set_config('request.headers', $1, false)", [
      JSON.stringify({ 'x-forwarded-for': ip }),
    ])

  it('remembers the plan asked for, keeping only plans on offer', async () => {
    const request = async (email: string, plan: string) => {
      await asAnon(db)
      return scalar<string>(
        db,
        "select submit_trial_request('Plan Club', 'Ben', $1, '', '', null, '', $2)",
        [email, plan],
      )
    }
    const growth = await request('growth@plan.ph', 'growth')
    const pro = await request('pro@plan.ph', 'pro') // "coming soon": not offered
    const made = await request('made@plan.ph', 'made-up')
    await asUser(db, ids.admin!)
    const planOf = (id: string) =>
      scalar<string | null>(db, 'select plan_id from trial_requests where id = $1', [id])
    expect(await planOf(growth)).toBe('growth')
    expect(await planOf(made)).toBeNull()
    // The plan tests turn "coming soon" off for Pro, so check what the table says.
    const proOffered = await scalar<boolean>(
      db,
      "select is_public and not coming_soon from plans where id = 'pro'",
    )
    expect(await planOf(pro)).toBe(proOffered ? 'pro' : null)
  })

  it('anyone can request a trial; only platform admins can see and handle requests', async () => {
    await asAnon(db)
    const id = await scalar<string>(
      db,
      "select submit_trial_request('Smash Club', 'Ana Cruz', 'Ana@Smash.ph', '0917 111 2222', 'Davao', 4, 'Hi!')",
    )
    await expect(
      db.query("select submit_trial_request('Smash Club', 'Ana', 'not-an-email')"),
    ).rejects.toThrow(/valid email/)
    await expect(db.query('select * from trial_requests')).rejects.toThrow(/permission/)

    await asUser(db, ids.bea!)
    expect(await scalar<number>(db, 'select count(*)::int from trial_requests')).toBe(0)
    await expect(
      db.query("select set_trial_request_status($1, 'contacted')", [id]),
    ).rejects.toThrow(/permission/)

    await asUser(db, ids.admin!)
    expect(await scalar<string>(db, 'select email from trial_requests where id = $1', [id])).toBe(
      'ana@smash.ph',
    )
    await db.query("select set_trial_request_status($1, 'converted')", [id])
    expect(await scalar<string>(db, 'select status from trial_requests where id = $1', [id])).toBe(
      'converted',
    )
  })

  it('is limited to 5 requests per network per hour', async () => {
    try {
      await asAnon(db)
      await asNetwork('203.0.113.50')
      for (let i = 0; i < 5; i++) {
        await db.query("select submit_trial_request('Club', 'Me', $1)", [`spam${i}@x.ph`])
      }
      await expect(
        db.query("select submit_trial_request('Club', 'Me', 'spam9@x.ph')"),
      ).rejects.toThrow(/Too many attempts/)
    } finally {
      await db.query("select set_config('request.headers', '', false)")
    }
  })
})

describe('online invoice payments (PayMongo)', () => {
  it('only the server can record a payment; amount must match; repeats are no-ops', async () => {
    const kitchen = ids.kitchen!
    await asService(db)
    const sub = await scalar<string>(db, 'select id from subscriptions where tenant_id = $1', [
      kitchen,
    ])
    const invoice = await scalar<string>(
      db,
      `insert into invoices (tenant_id, subscription_id, plan_id, amount_centavos, status, due_at)
       values ($1, $2, 'starter', 149000, 'overdue', local_today() - 1) returning id`,
      [kitchen, sub],
    )
    await db.query("update subscriptions set status = 'past_due' where id = $1", [sub])
    await db.query("update tenants set status = 'past_due' where id = $1", [kitchen])

    // Owners (and anyone signed in or out) can't call it through the API.
    await asUser(db, ids.marivic!)
    await expect(
      db.query("select record_invoice_online_payment($1, 'cs_1', 'pay_1', 149000)", [invoice]),
    ).rejects.toThrow(/permission denied/)
    await asAnon(db)
    await expect(
      db.query("select record_invoice_online_payment($1, 'cs_1', 'pay_1', 149000)", [invoice]),
    ).rejects.toThrow(/permission denied/)
    await asUser(db, ids.marivic!)
    await expect(db.query("select settle_invoice($1, 'x %s')", [invoice])).rejects.toThrow(
      /permission denied/,
    )

    // Saving the checkout id is server-only too; the server can save it on an unpaid invoice.
    await expect(db.query("select set_invoice_checkout($1, 'cs_1')", [invoice])).rejects.toThrow(
      /permission denied/,
    )
    await asService(db)
    await db.query("select set_invoice_checkout($1, 'cs_1')", [invoice])
    expect(
      await scalar<string>(db, 'select paymongo_checkout_id from invoices where id = $1', [
        invoice,
      ]),
    ).toBe('cs_1')

    // Server (service role ≈ superuser here): wrong amount refused, right amount settles.
    await asService(db)
    await expect(
      db.query("select record_invoice_online_payment($1, 'cs_1', 'pay_1', 100)", [invoice]),
    ).rejects.toThrow(/does not match/)
    await db.query("select record_invoice_online_payment($1, 'cs_1', 'pay_1', 149000)", [invoice])
    await db.query("select record_invoice_online_payment($1, 'cs_1', 'pay_1', 149000)", [invoice])
    const row = await db.query<{ status: string; paymongo_payment_id: string }>(
      'select status, paymongo_payment_id from invoices where id = $1',
      [invoice],
    )
    expect(row.rows[0]).toEqual({ status: 'paid', paymongo_payment_id: 'pay_1' })
    expect(await scalar<string>(db, 'select status from tenants where id = $1', [kitchen])).toBe(
      'active',
    )
    // A second, different payment for a paid invoice is logged for a refund, not applied.
    await db.query("select record_invoice_online_payment($1, 'cs_2', 'pay_2', 149000)", [invoice])
    expect(
      await scalar<string>(db, 'select paymongo_payment_id from invoices where id = $1', [invoice]),
    ).toBe('pay_1')
  })
})

describe('location map pin and amenities', () => {
  it('owners can set a pin; pins need both coordinates; amenities are limited', async () => {
    await asService(db)
    const loc = await scalar<string>(db, 'select id from locations where tenant_id = $1 limit 1', [
      ids.rally,
    ])
    await asUser(db, ids.bea!)
    await db.query(
      "update locations set latitude = 10.330712, longitude = 123.905734, amenities = array['Parking', 'Free drinking water'] where id = $1",
      [loc],
    )
    await asAnon(db) // the booking site can read the pin
    const row = await db.query<{ latitude: string; longitude: string }>(
      'select latitude, longitude from locations where id = $1',
      [loc],
    )
    expect(Number(row.rows[0]!.latitude)).toBeCloseTo(10.330712, 6)

    await asUser(db, ids.bea!)
    await expect(
      db.query('update locations set latitude = 10.5, longitude = null where id = $1', [loc]),
    ).rejects.toThrow(/locations_pin_complete/)
    await expect(
      db.query('update locations set latitude = 95, longitude = 120 where id = $1', [loc]),
    ).rejects.toThrow(/check/)
    await expect(
      db.query("update locations set amenities = array[repeat('x', 41)] where id = $1", [loc]),
    ).rejects.toThrow(/locations_amenities_valid/)
    await expect(
      db.query(
        "update locations set amenities = (select array_agg('A' || g) from generate_series(1, 21) g) where id = $1",
        [loc],
      ),
    ).rejects.toThrow(/locations_amenities_valid/)
  })
})

describe('billing automation', () => {
  const subOf = (slug: string) =>
    scalar<string>(
      db,
      'select s.id from subscriptions s join tenants t on t.id = s.tenant_id where t.slug = $1',
      [slug],
    )
  const run = () => db.query('select run_billing_cycle() as r')

  it('only platform admins (or the scheduler) can run it', async () => {
    await asUser(db, ids.bea!)
    await expect(run()).rejects.toThrow(/permission/)
    await asUser(db, ids.admin!)
    await run()
  })

  it('renews ended periods once, ends trials with a first invoice, and cancels when set to', async () => {
    await asService(db)
    const kitchen = await subOf('kitchen-line')
    const baseline = await subOf('baseline-hub')
    const dink = await subOf('dink-and-drive')
    await db.query(
      `update subscriptions set status = 'active', cancel_at_period_end = false,
         current_period_start = local_today() - 31, current_period_end = local_today() - 1
       where id = $1`,
      [kitchen],
    )
    await db.query(
      `update subscriptions set status = 'trialing', cancel_at_period_end = false,
         trial_ends_at = local_today() - 1 where id = $1`,
      [baseline],
    )
    await db.query(
      `update subscriptions set status = 'active', cancel_at_period_end = true,
         current_period_end = local_today() where id = $1`,
      [dink],
    )
    await run()
    await run() // a second run must not issue anything twice

    const renewal = await db.query<{ n: number; due: string; status: string }>(
      `select count(*)::int as n, max(due_at)::text as due, max(status) as status
         from invoices where subscription_id = $1 and period_start = local_today() - 1`,
      [kitchen],
    )
    expect(renewal.rows[0]!.n).toBe(1)
    expect(renewal.rows[0]!.status).toBe('open')
    expect(
      await scalar<boolean>(
        db,
        "select current_period_end = (local_today() - 1 + interval '1 month')::date from subscriptions where id = $1",
        [kitchen],
      ),
    ).toBe(true)

    expect(
      await scalar<string>(db, 'select status from subscriptions where id = $1', [baseline]),
    ).toBe('active')
    expect(await scalar<string>(db, "select status from tenants where slug = 'baseline-hub'")).toBe(
      'active',
    )
    expect(
      await scalar<number>(
        db,
        'select count(*)::int from invoices where subscription_id = $1 and period_start = local_today() - 1',
        [baseline],
      ),
    ).toBe(1)

    expect(await scalar<string>(db, 'select status from subscriptions where id = $1', [dink])).toBe(
      'cancelled',
    )
  })

  it('marks open invoices past due as overdue and the business past due', async () => {
    await asService(db)
    const rally = await subOf('rally-point')
    const invoice = await scalar<string>(
      db,
      `insert into invoices (tenant_id, subscription_id, plan_id, amount_centavos, status, due_at)
       select tenant_id, id, plan_id, 399000, 'open', local_today() - 2 from subscriptions where id = $1
       returning id`,
      [rally],
    )
    await db.query("update subscriptions set status = 'active' where id = $1", [rally])
    await run()
    expect(await scalar<string>(db, 'select status from invoices where id = $1', [invoice])).toBe(
      'overdue',
    )
    expect(
      await scalar<string>(db, 'select status from subscriptions where id = $1', [rally]),
    ).toBe('past_due')
    expect(await scalar<string>(db, "select status from tenants where slug = 'rally-point'")).toBe(
      'past_due',
    )
  })

  it('approving a plan change issues the invoice for the new plan', async () => {
    await asService(db)
    const kitchen = await subOf('kitchen-line')
    await db.query(
      "update plan_requests set status = 'cancelled' where tenant_id = $1 and status = 'pending'",
      [ids.kitchen],
    )
    await db.query("update subscriptions set status = 'active' where id = $1", [kitchen])
    const target = await scalar<string>(
      db,
      "select case when plan_id = 'pro' then 'growth' else 'pro' end from subscriptions where id = $1",
      [kitchen],
    )
    await asUser(db, ids.marivic!)
    const req = await scalar<string>(
      db,
      "select request_plan_change($1, $2, 'monthly', 'Adding courts')",
      [ids.kitchen, target],
    )
    await asUser(db, ids.admin!)
    await db.query('select decide_plan_request($1, true)', [req])
    await asService(db)
    const inv = await db.query<{ plan_id: string; amount: number; status: string }>(
      `select plan_id, amount_centavos as amount, status from invoices
        where subscription_id = $1 and period_start = local_today() and status <> 'void'`,
      [kitchen],
    )
    expect(inv.rows).toHaveLength(1)
    expect(inv.rows[0]!.plan_id).toBe(target)
    expect(inv.rows[0]!.status).toBe('open')
    expect(inv.rows[0]!.amount).toBe(
      await scalar<number>(db, 'select monthly_price_centavos from plans where id = $1', [target]),
    )
  })
})

describe('platform settings', () => {
  it('only platform admins can read or change them', async () => {
    await asUser(db, ids.bea!)
    expect(await scalar<number>(db, 'select count(*)::int from platform_settings')).toBe(0)
    await db.query('update platform_settings set trial_days = 60')
    await asUser(db, ids.admin!)
    expect(await scalar<number>(db, 'select trial_days from platform_settings')).toBe(14)
    await expect(db.query('update platform_settings set trial_days = 0')).rejects.toThrow(/check/)
  })

  it('trial length and grace period drive new trials and invoice due dates', async () => {
    await asUser(db, ids.admin!)
    await db.query('update platform_settings set trial_days = 30, grace_days = 3')
    const id = await scalar<string>(
      db,
      "select create_tenant('Settings Test Club', 'Lea Diaz', 'lea@settings.ph')",
    )
    await asService(db)
    expect(
      await scalar<number>(
        db,
        'select trial_ends_at - local_today() from subscriptions where tenant_id = $1',
        [id],
      ),
    ).toBe(30)
    const sub = await scalar<string>(db, 'select id from subscriptions where tenant_id = $1', [id])
    const invoice = await scalar<string>(db, 'select issue_invoice($1, local_today())', [sub])
    expect(
      await scalar<number>(db, 'select due_at - local_today() from invoices where id = $1', [
        invoice,
      ]),
    ).toBe(3)
    await db.query('update platform_settings set trial_days = 14, grace_days = 7')
  })
})

describe('linking logins to business accounts', () => {
  it('only links a login once its email is confirmed', async () => {
    await asService(db)
    await db.query(
      `insert into staff_members (tenant_id, name, email) values ($1, 'Later', 'later@rallypoint.ph')`,
      [ids.rally],
    )
    // Someone signs up with that email but never confirms it.
    const user = await scalar<string>(
      db,
      "insert into auth.users (email, email_confirmed_at) values ('later@rallypoint.ph', null) returning id",
    )
    const linked = () =>
      scalar<string | null>(
        db,
        "select user_id from staff_members where email = 'later@rallypoint.ph'",
      )
    expect(await linked()).toBeNull()

    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [user])
    expect(await linked()).toBe(user)
    await db.query("delete from staff_members where email = 'later@rallypoint.ph'")
  })
})

describe('walk-ins setting', () => {
  it('refuses walk-in bookings while the business has walk-ins turned off', async () => {
    await asService(db)
    await db.query('update booking_rules set allow_walk_ins = false where tenant_id = $1', [
      ids.rally,
    ])
    const slot = await freeSlot('rally-point', 12)
    await asUser(db, ids.karl!)
    await expect(
      book(ids.rally!, [slot], { source: 'walk_in', method: 'cash', pending: false }),
    ).rejects.toThrow(/doesn't take walk-ins/)
    // Phone bookings still work.
    await book(ids.rally!, [slot], { source: 'phone', method: 'cash', pending: false })
    await asService(db)
    await db.query('update booking_rules set allow_walk_ins = true where tenant_id = $1', [
      ids.rally,
    ])
  })
})
