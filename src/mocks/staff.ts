import type { StaffMember } from '@/types/staff'

const now = new Date()
function hoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString()
}

/** One full-access account per business (Rally Point has a second one). */
export const staffSeed: StaffMember[] = [
  {
    id: 'stf_rp_1',
    tenantId: 'tn_rally',
    name: 'Bea Villanueva',
    email: 'bea@rallypoint.ph',
    phone: '+63 917 555 0142',
    role: 'owner',
    status: 'active',
    lastActiveAt: hoursAgo(1),
  },
  {
    id: 'stf_rp_2',
    tenantId: 'tn_rally',
    name: 'Karl Uy',
    email: 'karl@rallypoint.ph',
    phone: '+63 917 555 0201',
    role: 'owner',
    status: 'active',
    lastActiveAt: hoursAgo(3),
  },
  {
    id: 'stf_dd_1',
    tenantId: 'tn_dink',
    name: 'Paolo Mercado',
    email: 'paolo@dinkdrive.ph',
    phone: '+63 918 555 0198',
    role: 'owner',
    status: 'active',
    lastActiveAt: hoursAgo(5),
  },
  {
    id: 'stf_kl_1',
    tenantId: 'tn_kitchen',
    name: 'Marivic Dela Cruz',
    email: 'marivic@kitchenline.club',
    phone: '+63 927 555 0110',
    role: 'owner',
    status: 'active',
    lastActiveAt: hoursAgo(12),
  },
  {
    id: 'stf_bh_1',
    tenantId: 'tn_baseline',
    name: 'Jun Abellana',
    email: 'jun@baselinehub.ph',
    phone: '+63 939 555 0177',
    role: 'owner',
    status: 'active',
    lastActiveAt: hoursAgo(20),
  },
  {
    id: 'stf_pr_1',
    tenantId: 'tn_paddle',
    name: 'Andrea Lim',
    email: 'andrea@paddlerepublic.ph',
    phone: '+63 917 555 0303',
    role: 'owner',
    status: 'active',
    lastActiveAt: hoursAgo(6),
  },
  {
    id: 'stf_ts_1',
    tenantId: 'tn_thirdshot',
    name: 'Rico Santos',
    email: 'rico@thirdshot.ph',
    phone: '+63 920 555 0155',
    role: 'owner',
    status: 'active',
    lastActiveAt: hoursAgo(72),
  },
  {
    id: 'stf_cp_1',
    tenantId: 'tn_coast',
    name: 'Lianne Ocampo',
    email: 'lianne@coastlinepickle.ph',
    phone: '+63 905 555 0121',
    role: 'owner',
    status: 'active',
    lastActiveAt: hoursAgo(900),
  },
]
