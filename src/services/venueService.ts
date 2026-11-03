import { usingSupabase } from '@/config/env'

import * as mock from './mock/venueService'
import * as remote from './supabase/venueService'

export type { CourtInput, LocationInput } from './mock/venueService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<
  typeof mock,
  'listLocations' | 'saveLocation' | 'deleteLocation' | 'listCourts' | 'saveCourt' | 'deleteCourt'
>
const api: Api = usingSupabase ? remote : mock

export const listLocations = api.listLocations
export const saveLocation = api.saveLocation
export const deleteLocation = api.deleteLocation
export const listCourts = api.listCourts
export const saveCourt = api.saveCourt
export const deleteCourt = api.deleteCourt
