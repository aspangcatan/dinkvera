import type { BookingRules, TenantPolicy } from '@/types/tenant'

/** Same limits as the database (valid_policies). */
export const POLICY_MAX_SECTIONS = 10
export const POLICY_TITLE_MAX = 80
export const POLICY_BODY_MAX = 4000

/** A starting point owners can edit, offered when they have no policies yet. */
export const policyTemplate: TenantPolicy[] = [
  {
    title: 'House rules',
    body: [
      '- Non-marking court shoes only.',
      '- Arrive 10 minutes early. Your time starts and ends as booked so the next group can start on time.',
      '- Drinks in closed bottles only; no food on court.',
      '- Please leave the court clean and return any rented paddles and balls.',
    ].join('\n'),
  },
  {
    title: 'Cancellations & rescheduling',
    body: [
      'Need to move your booking? Message us before the free cancellation window ends and we will find you another slot.',
      '',
      'Late cancellations and no-shows are not refunded. If we have to close a court for weather or maintenance, we will move your booking or refund it in full.',
    ].join('\n'),
  },
  {
    title: 'Safety',
    body: [
      'Play at your own risk and warm up before you start.',
      '',
      'Children under 12 must be with an adult at all times.',
    ].join('\n'),
  },
]

/** The booking rules every business has, in words, shown above its own policies. */
export function bookingBasics(rules: BookingRules): string[] {
  const hours = (h: number) => `${h} hour${h === 1 ? '' : 's'}`
  const length = (m: number) => (m < 60 ? `${m} minutes` : hours(m / 60))
  return [
    rules.cancellationWindowHours > 0
      ? `Free cancellation up to ${hours(rules.cancellationWindowHours)} before your start time.`
      : 'Bookings cannot be cancelled for free once made.',
    rules.requirePrepayment
      ? `Online bookings are held for ${rules.holdMinutes} minutes and confirmed once your payment is approved.`
      : 'You can book online now and pay at the venue.',
    `Book between ${length(rules.minDurationMinutes)} and ${length(rules.maxDurationMinutes)} at a time, up to ${rules.advanceBookingDays} days ahead.`,
  ]
}

export type PolicyBlock = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }

/**
 * Turns a plain-text policy body into paragraphs and bullet lists
 * (lines starting with "- " or "• "). Rendered as text, never HTML.
 */
export function parsePolicyBody(body: string): PolicyBlock[] {
  const blocks: PolicyBlock[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim()
    const bullet = /^[-•*]\s+(.*)$/.exec(line)
    if (bullet) {
      flush()
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'ul') last.items.push(bullet[1]!)
      else blocks.push({ kind: 'ul', items: [bullet[1]!] })
    } else if (!line) {
      flush()
    } else {
      para.push(line)
    }
  }
  flush()
  return blocks
}

/** Trims sections and drops empty ones before saving; returns an error message if invalid. */
export function cleanPolicies(list: TenantPolicy[]): { policies: TenantPolicy[]; error?: string } {
  const policies = list
    .map((p) => ({ title: p.title.trim(), body: p.body.trim() }))
    .filter((p) => p.title || p.body)
  if (policies.some((p) => !p.title)) return { policies, error: 'Give every section a title' }
  if (policies.some((p) => p.title.length > POLICY_TITLE_MAX)) {
    return { policies, error: `Keep titles under ${POLICY_TITLE_MAX} characters` }
  }
  if (policies.some((p) => p.body.length > POLICY_BODY_MAX)) {
    return { policies, error: `Keep each section under ${POLICY_BODY_MAX} characters` }
  }
  if (policies.length > POLICY_MAX_SECTIONS) {
    return { policies, error: `You can have up to ${POLICY_MAX_SECTIONS} sections` }
  }
  return { policies }
}
