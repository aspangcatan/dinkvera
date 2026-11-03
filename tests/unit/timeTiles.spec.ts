import { describe, expect, it } from 'vitest'

import { buildHourTiles, selectTile, type HourTile } from '@/utils/timeTiles'

function tiles(taken: number[] = [], added: number[] = []): HourTile[] {
  return buildHourTiles({
    openHour: 8,
    closeHour: 14,
    taken,
    added,
    pastBefore: null,
    priceFor: () => 100,
  })
}

describe('buildHourTiles', () => {
  it('marks added before booked before past', () => {
    const t = buildHourTiles({
      openHour: 8,
      closeHour: 12,
      taken: [9, 10],
      added: [10],
      pastBefore: 9,
      priceFor: (h) => h,
    })
    expect(t.map((x) => x.status)).toEqual(['past', 'booked', 'added', 'available'])
  })
})

describe('selectTile', () => {
  it('starts, extends, shortens and clears', () => {
    const t = tiles()
    let s = selectTile(t, null, 1, 1, 3).selection
    expect(s).toEqual({ start: 1, count: 1 })
    s = selectTile(t, s, 3, 1, 3).selection
    expect(s).toEqual({ start: 1, count: 3 })
    s = selectTile(t, s, 2, 1, 3).selection
    expect(s).toEqual({ start: 1, count: 2 })
    expect(selectTile(t, s, 1, 1, 3).selection).toBeNull()
  })

  it('respects the minimum and maximum length', () => {
    const t = tiles()
    expect(selectTile(t, null, 0, 2, 3).selection).toEqual({ start: 0, count: 2 })
    const tooLong = selectTile(t, { start: 0, count: 2 }, 4, 2, 3)
    expect(tooLong.selection).toEqual({ start: 0, count: 2 })
    expect(tooLong.error).toMatch(/longest/)
    expect(tooLong.reason).toBe('max')
    expect(selectTile(t, null, 5, 2, 3).error).toMatch(/Not enough open time/)
  })

  it('starts fresh instead of jumping over a booked hour', () => {
    const t = tiles([10])
    // 8 AM picked, tap noon: 10 AM is booked in between, so noon becomes the new start.
    expect(selectTile(t, { start: 0, count: 1 }, 4, 1, 4).selection).toEqual({ start: 4, count: 1 })
  })

  it("won't pick booked or added tiles", () => {
    const t = tiles([9], [11])
    expect(selectTile(t, null, 1, 1, 3).error).toBeTruthy()
    expect(selectTile(t, null, 3, 1, 3).error).toBeTruthy()
  })
})
