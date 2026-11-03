import type { Customer } from '@/types/booking'
import { addDays, todayISO } from '@/utils/dates'
import { createRandom, hashString } from '@/utils/random'

const FIRST = [
  'Andrea',
  'Miguel',
  'Carla',
  'Joshua',
  'Patricia',
  'Gabriel',
  'Nicole',
  'Rafael',
  'Kristine',
  'Mark',
  'Bianca',
  'Paolo',
  'Janine',
  'Carlo',
  'Camille',
  'Enzo',
  'Trisha',
  'Luis',
  'Angela',
  'Vincent',
  'Sofia',
  'Daniel',
  'Isabel',
  'Ramon',
  'Hannah',
  'Jerome',
  'Mika',
  'Adrian',
  'Lea',
  'Francis',
  'Denise',
  'Kevin',
  'Ella',
  'Marco',
  'Reina',
  'Tomas',
  'Yvonne',
  'Jasper',
]

const LAST = [
  'Reyes',
  'Santos',
  'Cruz',
  'Bautista',
  'Garcia',
  'Mendoza',
  'Torres',
  'Flores',
  'Ramos',
  'Aquino',
  'Castillo',
  'Navarro',
  'Lim',
  'Tan',
  'Uy',
  'Go',
  'Sy',
  'Villanueva',
  'Gonzales',
  'Domingo',
  'Pascual',
  'Salazar',
  'Fernandez',
  'Ocampo',
  'Valdez',
  'Chua',
  'Mercado',
  'Rivera',
]

const TAGS = ['Regular', 'League', 'Clinic', 'Member', 'Corporate', 'New']

/** How many customers each tenant has in the mock dataset. */
const counts: Record<string, number> = {
  tn_rally: 64,
  tn_dink: 48,
  tn_kitchen: 32,
  tn_baseline: 18,
  tn_paddle: 84,
  tn_thirdshot: 16,
  tn_coast: 12,
}

function build(): Customer[] {
  const customers: Customer[] = []
  const today = todayISO()
  for (const [tenantId, count] of Object.entries(counts)) {
    const rand = createRandom(hashString(tenantId))
    for (let i = 0; i < count; i++) {
      const first = rand.pick(FIRST)
      const last = rand.pick(LAST)
      const tags: string[] = []
      if (rand.chance(0.35)) tags.push(rand.pick(TAGS))
      customers.push({
        id: `cus_${tenantId.slice(3)}_${String(i + 1).padStart(3, '0')}`,
        tenantId,
        name: `${first} ${last}`,
        email: `${first}.${last}${rand.int(1, 99)}@mail.ph`.toLowerCase(),
        phone: `+63 9${rand.int(10, 99)} ${rand.int(100, 999)} ${rand.int(1000, 9999)}`,
        createdAt: addDays(today, -rand.int(3, 360)),
        tags,
      })
    }
  }
  return customers
}

export const customerSeed: Customer[] = build()
