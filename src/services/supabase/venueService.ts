import { supabase, toError, unwrap } from '@/lib/supabase/client'
import type { Court, Location } from '@/types/venue'
import { slugify } from '@/utils/ids'

import type { CourtInput, LocationInput } from '../mock/venueService'
import { toCourt, toLocation } from './mappers'

export async function listLocations(tenantId: string): Promise<Location[]> {
  return unwrap(
    await supabase().from('locations').select('*').eq('tenant_id', tenantId).order('created_at'),
  ).map(toLocation)
}

export async function saveLocation(
  tenantId: string,
  input: LocationInput,
  id?: string,
): Promise<Location> {
  if (input.closeHour <= input.openHour) throw new Error('Closing time must be after opening time')
  const row = {
    name: input.name,
    slug: slugify(input.name),
    address: input.address,
    city: input.city,
    phone: input.phone,
    open_hour: input.openHour,
    close_hour: input.closeHour,
    status: input.status,
    amenities: input.amenities,
    latitude: input.latitude,
    longitude: input.longitude,
  }
  const query = id
    ? supabase().from('locations').update(row).eq('id', id)
    : supabase()
        .from('locations')
        .insert({ ...row, tenant_id: tenantId })
  return toLocation(unwrap(await query.select('*').single()))
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase().from('locations').delete().eq('id', id)
  if (error) throw toError(error)
}

export async function listCourts(tenantId: string, locationId?: string): Promise<Court[]> {
  let query = supabase().from('courts').select('*').eq('tenant_id', tenantId).order('name')
  if (locationId) query = query.eq('location_id', locationId)
  return unwrap(await query).map(toCourt)
}

export async function saveCourt(tenantId: string, input: CourtInput, id?: string): Promise<Court> {
  if (input.dayRate <= 0 || input.nightRate <= 0) throw new Error('Rates must be more than zero')
  const row = {
    location_id: input.locationId,
    name: input.name,
    type: input.type,
    surface: input.surface,
    day_rate_centavos: input.dayRate,
    night_rate_centavos: input.nightRate,
    night_start_hour: input.nightStartHour,
    status: input.status,
    features: input.features,
  }
  const query = id
    ? supabase().from('courts').update(row).eq('id', id)
    : supabase()
        .from('courts')
        .insert({ ...row, tenant_id: tenantId })
  return toCourt(unwrap(await query.select('*').single()))
}

export async function deleteCourt(id: string): Promise<void> {
  const { error } = await supabase().from('courts').delete().eq('id', id)
  if (error) throw toError(error)
}
