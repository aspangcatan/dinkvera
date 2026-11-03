import type { PlatformSettings } from '@/types/tenant'

import { db, respond } from './mockDb'

export async function getPlatformSettings(): Promise<PlatformSettings> {
  return respond(db.platformSettings)
}

export async function savePlatformSettings(input: PlatformSettings): Promise<PlatformSettings> {
  return respond(Object.assign(db.platformSettings, input))
}
