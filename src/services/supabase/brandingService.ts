import { check, storageError, supabase } from '@/lib/supabase/client'
import type { Tenant } from '@/types/tenant'

import { assertHeroFile, reorder } from '../mock/brandingService'
import { getTenant } from './tenantService'

const BUCKET = 'branding'

async function savePaths(tenantId: string, paths: string[]): Promise<Tenant> {
  check(await supabase().from('tenants').update({ hero_images: paths }).eq('id', tenantId))
  return getTenant(tenantId)
}

/**
 * Uploads a banner photo into the business's folder of the public
 * branding bucket and appends it to the slideshow.
 */
export async function uploadHeroImage(tenantId: string, file: File): Promise<Tenant> {
  const tenant = await getTenant(tenantId)
  assertHeroFile(file, tenant.branding.heroImages)
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${tenantId}/hero-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw storageError(error.message, 'Photo uploads')
  try {
    return await savePaths(tenantId, [...tenant.branding.heroImages.map((i) => i.path), path])
  } catch (e) {
    // Don't leave an orphaned file behind if the list couldn't be saved.
    await supabase().storage.from(BUCKET).remove([path])
    throw e
  }
}

export async function removeHeroImage(tenantId: string, path: string): Promise<Tenant> {
  const tenant = await getTenant(tenantId)
  const updated = await savePaths(
    tenantId,
    tenant.branding.heroImages.map((i) => i.path).filter((p) => p !== path),
  )
  await supabase().storage.from(BUCKET).remove([path])
  return updated
}

export async function moveHeroImage(
  tenantId: string,
  path: string,
  direction: -1 | 1,
): Promise<Tenant> {
  const tenant = await getTenant(tenantId)
  return savePaths(
    tenantId,
    reorder(tenant.branding.heroImages, path, direction).map((i) => i.path),
  )
}
