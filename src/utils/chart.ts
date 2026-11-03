/**
 * "Nice" axis ticks: round steps (1, 2, 2.5, 5 × 10ⁿ) from 0 to at least
 * `max`, so gridlines land on clean numbers.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude
  const ticks: number[] = []
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  if (ticks.length < 2) ticks.push(step)
  return ticks
}

/** Every n-th index so at most `max` x-axis labels show. */
export function labelStride(length: number, max: number): number {
  return Math.max(1, Math.ceil(length / max))
}

/** Path for a column with a rounded top (4px) and a square base. */
export function columnPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4,
): string {
  if (height <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    'Z',
  ].join(' ')
}
