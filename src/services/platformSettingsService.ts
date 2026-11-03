import { usingSupabase } from '@/config/env'

import * as mock from './mock/platformSettingsService'
import * as remote from './supabase/platformSettingsService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<typeof mock, 'getPlatformSettings' | 'savePlatformSettings'>
const api: Api = usingSupabase ? remote : mock

/** Super Admin → Settings. */
export const getPlatformSettings = api.getPlatformSettings
export const savePlatformSettings = api.savePlatformSettings
