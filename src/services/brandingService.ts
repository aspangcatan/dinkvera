import { usingSupabase } from '@/config/env'

import * as mock from './mock/brandingService'
import * as remote from './supabase/brandingService'

export { HERO_MAX_BYTES, HERO_MAX_IMAGES, HERO_TYPES } from './mock/brandingService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<typeof mock, 'uploadHeroImage' | 'removeHeroImage' | 'moveHeroImage'>
const api: Api = usingSupabase ? remote : mock

export const uploadHeroImage = api.uploadHeroImage
export const removeHeroImage = api.removeHeroImage
export const moveHeroImage = api.moveHeroImage
