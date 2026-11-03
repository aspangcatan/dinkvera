/**
 * Hour tiles for the public booking flow, ported from match-pickleball's
 * bookingTiles: tap a start time, tap a later time to book longer, tap a
 * picked time to shorten, tap the start again to clear.
 */
export type TileStatus = 'available' | 'booked' | 'past' | 'added'

export interface HourTile {
  hour: number
  status: TileStatus
  /** Centavos for this hour. */
  price: number
}

/** A contiguous run of tiles: `start` index and how many. */
export interface TileSelection {
  start: number
  count: number
}

export interface BuildTilesInput {
  openHour: number
  closeHour: number
  /** Hours already booked on this court and date. */
  taken: number[]
  /** Hours already added to this booking on this court and date. */
  added: number[]
  /** Hours that have already started (today only). */
  pastBefore: number | null
  priceFor: (hour: number) => number
}

export function buildHourTiles(input: BuildTilesInput): HourTile[] {
  const tiles: HourTile[] = []
  for (let h = input.openHour; h < input.closeHour; h++) {
    let status: TileStatus = 'available'
    if (input.added.includes(h)) status = 'added'
    else if (input.taken.includes(h)) status = 'booked'
    else if (input.pastBefore !== null && h < input.pastBefore) status = 'past'
    tiles.push({ hour: h, status, price: input.priceFor(h) })
  }
  return tiles
}

export interface SelectTileResult {
  selection: TileSelection | null
  error: string | null
  /** "max": tapped past the longest booking (the page suggests "Add date"). */
  reason?: 'max'
}

const hoursLabel = (n: number) => `${n} hour${n === 1 ? '' : 's'}`

function allAvailable(tiles: HourTile[], from: number, to: number): boolean {
  if (from < 0 || to >= tiles.length) return false
  for (let i = from; i <= to; i++) if (tiles[i]!.status !== 'available') return false
  return true
}

export function selectTile(
  tiles: HourTile[],
  current: TileSelection | null,
  index: number,
  minTiles: number,
  maxTiles: number,
): SelectTileResult {
  const tile = tiles[index]
  if (!tile || tile.status !== 'available') {
    return { selection: current, error: "That time isn't available." }
  }

  const startFresh = (): SelectTileResult =>
    allAvailable(tiles, index, index + minTiles - 1)
      ? { selection: { start: index, count: minTiles }, error: null }
      : {
          selection: current,
          error: `Not enough open time after this start. The shortest booking is ${hoursLabel(minTiles)}.`,
        }

  if (!current || index < current.start) return startFresh()
  if (index === current.start) return { selection: null, error: null }

  const lastPicked = current.start + current.count - 1
  if (index <= lastPicked) {
    const count = index - current.start + 1
    return count >= minTiles
      ? { selection: { start: current.start, count }, error: null }
      : { selection: current, error: `The shortest booking is ${hoursLabel(minTiles)}.` }
  }

  // Something booked in between: the tapped time becomes a new start.
  if (!allAvailable(tiles, current.start, index)) return startFresh()
  const count = index - current.start + 1
  if (count > maxTiles) {
    return {
      selection: current,
      error: `The longest booking is ${hoursLabel(maxTiles)}.`,
      reason: 'max',
    }
  }
  return { selection: { start: current.start, count }, error: null }
}
