import type { Court, CourtStatus, CourtType } from '@/types/venue'

import { locationSeed } from './locations'

interface CourtSpec {
  locationId: string
  count: number
  type: CourtType
  /** Pesos per hour, day / night. */
  rate: [number, number]
  surface?: string
  /** Court numbers (1-based) that are currently under maintenance. */
  maintenance?: number[]
  features?: string[]
}

const specs: CourtSpec[] = [
  {
    locationId: 'loc_rp_it',
    count: 4,
    type: 'indoor',
    rate: [450, 600],
    surface: 'Cushioned acrylic',
    features: ['LED lighting', 'Spectator seating'],
  },
  {
    locationId: 'loc_rp_banilad',
    count: 4,
    type: 'covered',
    rate: [350, 480],
    maintenance: [4],
    features: ['Roofed', 'Night lights'],
  },
  {
    locationId: 'loc_rp_mandaue',
    count: 2,
    type: 'outdoor',
    rate: [250, 350],
    features: ['Night lights'],
  },
  {
    locationId: 'loc_dd_makati',
    count: 3,
    type: 'outdoor',
    rate: [500, 700],
    features: ['City view', 'Night lights'],
  },
  {
    locationId: 'loc_dd_ortigas',
    count: 3,
    type: 'indoor',
    rate: [550, 750],
    features: ['Air-conditioned', 'Ball machine'],
  },
  {
    locationId: 'loc_kl_lanang',
    count: 4,
    type: 'outdoor',
    rate: [200, 300],
    features: ['Night lights'],
  },
  {
    locationId: 'loc_bh_mandurriao',
    count: 6,
    type: 'indoor',
    rate: [400, 520],
    features: ['Pro lighting', 'Wooden sports floor'],
  },
  {
    locationId: 'loc_pr_bgc',
    count: 5,
    type: 'indoor',
    rate: [800, 1100],
    surface: 'Pro cushion',
    features: ['Air-conditioned', 'Broadcast camera', 'Seating'],
  },
  {
    locationId: 'loc_pr_alabang',
    count: 4,
    type: 'covered',
    rate: [600, 850],
    features: ['Roofed', 'Night lights'],
  },
  {
    locationId: 'loc_pr_qc',
    count: 3,
    type: 'indoor',
    rate: [650, 900],
    maintenance: [3],
    features: ['Air-conditioned'],
  },
  {
    locationId: 'loc_pr_pasay',
    count: 2,
    type: 'outdoor',
    rate: [500, 700],
    features: ['Bay view'],
  },
  {
    locationId: 'loc_ts_clark',
    count: 2,
    type: 'covered',
    rate: [300, 400],
    features: ['Night lights'],
  },
  {
    locationId: 'loc_cp_panglao',
    count: 3,
    type: 'outdoor',
    rate: [300, 450],
    features: ['Beachfront'],
  },
]

/** When night rates start at each demo business (same as the database seed). */
const nightStartFor: Record<string, number> = { tn_dink: 18, tn_kitchen: 16 }

function build(): Court[] {
  const courts: Court[] = []
  for (const spec of specs) {
    const location = locationSeed.find((l) => l.id === spec.locationId)!
    for (let n = 1; n <= spec.count; n++) {
      let status: CourtStatus = spec.maintenance?.includes(n) ? 'maintenance' : 'active'
      if (location.status === 'inactive') status = 'inactive'
      courts.push({
        id: `crt_${location.id.slice(4)}_${n}`,
        tenantId: location.tenantId,
        locationId: location.id,
        name: `Court ${n}`,
        type: spec.type,
        surface:
          spec.surface ?? (spec.type === 'indoor' ? 'Acrylic hard court' : 'Textured acrylic'),
        dayRate: spec.rate[0] * 100,
        nightRate: spec.rate[1] * 100,
        nightStartHour: nightStartFor[location.tenantId] ?? 17,
        status,
        features: spec.features ?? [],
      })
    }
  }
  return courts
}

export const courtSeed: Court[] = build()
