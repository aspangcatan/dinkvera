import { describe, expect, it } from 'vitest'

import { tenantSeed } from '@/mocks/tenants'
import { bookingBasics, cleanPolicies, parsePolicyBody } from '@/utils/policies'

describe('rules & policies', () => {
  it('splits a body into paragraphs and bullet lists', () => {
    expect(parsePolicyBody('Intro line\ncontinues.\n\n- One\n- Two\n\nAfter.')).toEqual([
      { kind: 'p', text: 'Intro line continues.' },
      { kind: 'ul', items: ['One', 'Two'] },
      { kind: 'p', text: 'After.' },
    ])
  })

  it('describes the booking rules in words', () => {
    const rules = tenantSeed[0]!.bookingRules
    const lines = bookingBasics({ ...rules, cancellationWindowHours: 1, requirePrepayment: false })
    expect(lines[0]).toBe('Free cancellation up to 1 hour before your start time.')
    expect(lines[1]).toMatch(/pay at the venue/)
  })

  it('trims, drops empty sections and catches missing titles', () => {
    expect(
      cleanPolicies([
        { title: ' Rules ', body: ' x ' },
        { title: '', body: '' },
      ]),
    ).toEqual({ policies: [{ title: 'Rules', body: 'x' }] })
    expect(cleanPolicies([{ title: '', body: 'orphan' }]).error).toMatch(/title/)
  })
})
