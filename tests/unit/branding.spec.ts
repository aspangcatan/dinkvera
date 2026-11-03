import { describe, expect, it } from 'vitest'

import { assertHeroFile, reorder } from '@/services/mock/brandingService'

const img = (path: string) => ({ path, url: path })

describe('banner photos', () => {
  it('reorders one step at a time and ignores moves past the ends', () => {
    const list = [img('a'), img('b'), img('c')]
    expect(reorder(list, 'b', -1).map((i) => i.path)).toEqual(['b', 'a', 'c'])
    expect(reorder(list, 'b', 1).map((i) => i.path)).toEqual(['a', 'c', 'b'])
    expect(reorder(list, 'a', -1).map((i) => i.path)).toEqual(['a', 'b', 'c'])
  })

  it('allows at most 3 photos of an allowed type and size', () => {
    const file = (type: string, size = 1000) => ({ type, size }) as File
    expect(() => assertHeroFile(file('image/jpeg'), [img('a'), img('b')])).not.toThrow()
    expect(() => assertHeroFile(file('image/jpeg'), [img('a'), img('b'), img('c')])).toThrow(
      /up to 3/,
    )
    expect(() => assertHeroFile(file('image/gif'), [])).toThrow(/JPG, PNG or WebP/)
    expect(() => assertHeroFile(file('image/png', 6 * 1024 * 1024), [])).toThrow(/over 5 MB/)
  })
})
