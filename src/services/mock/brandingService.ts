import type { HeroImage, Tenant } from '@/types/tenant'

import { db, findOrThrow, respond, ServiceError } from './mockDb'

/** Banner photos: JPG, PNG or WebP up to 5 MB, at most 3 (same as the database). */
export const HERO_MAX_IMAGES = 3
export const HERO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const HERO_MAX_BYTES = 5 * 1024 * 1024

export function assertHeroFile(file: File, current: HeroImage[]): void {
  if (current.length >= HERO_MAX_IMAGES) {
    throw new Error(`You can add up to ${HERO_MAX_IMAGES} photos. Remove one first.`)
  }
  if (!HERO_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG or WebP photo.')
  if (file.size > HERO_MAX_BYTES) throw new Error('The photo is over 5 MB. Try a smaller one.')
}

/** Mock upload: keeps the photo in memory as a data URL (its "path" too). */
export async function uploadHeroImage(tenantId: string, file: File): Promise<Tenant> {
  const tenant = findOrThrow(db.tenants, tenantId, 'Business')
  assertHeroFile(file, tenant.branding.heroImages)
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new ServiceError('Could not read the photo.', 'invalid'))
    reader.readAsDataURL(file)
  })
  tenant.branding.heroImages = [...tenant.branding.heroImages, { path: url, url }]
  return respond(tenant)
}

export async function removeHeroImage(tenantId: string, path: string): Promise<Tenant> {
  const tenant = findOrThrow(db.tenants, tenantId, 'Business')
  tenant.branding.heroImages = tenant.branding.heroImages.filter((i) => i.path !== path)
  return respond(tenant)
}

/** Moves a photo one place earlier (-1) or later (+1) in the slideshow. */
export async function moveHeroImage(
  tenantId: string,
  path: string,
  direction: -1 | 1,
): Promise<Tenant> {
  const tenant = findOrThrow(db.tenants, tenantId, 'Business')
  tenant.branding.heroImages = reorder(tenant.branding.heroImages, path, direction)
  return respond(tenant)
}

export function reorder(images: HeroImage[], path: string, direction: -1 | 1): HeroImage[] {
  const list = [...images]
  const from = list.findIndex((i) => i.path === path)
  const to = from + direction
  if (from < 0 || to < 0 || to >= list.length) return list
  ;[list[from], list[to]] = [list[to]!, list[from]!]
  return list
}
