<script setup lang="ts">
import type { Map as LeafletMap, Marker } from 'leaflet'
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

import { roundPin, type LatLng } from '@/utils/maps'

/**
 * OpenStreetMap map with one pin (Leaflet, loaded on demand).
 * - read-only (default): shows the pin; used on the booking site.
 * - `editable`: click the map or drag the pin to move it; emits the new spot.
 * Without a pin it shows the whole Philippines (editable) and waits for one.
 */
const props = withDefaults(
  defineProps<{
    pin: LatLng | null
    editable?: boolean
    /** Accessible name for the map region. */
    label?: string
  }>(),
  { editable: false, label: 'Map' },
)
const emit = defineEmits<{ 'update:pin': [pin: LatLng] }>()

const el = useTemplateRef<HTMLDivElement>('el')
const failed = ref(false)
let map: LeafletMap | null = null
let marker: Marker | null = null
let resize: ResizeObserver | null = null
let L: typeof import('leaflet') | null = null

const PHILIPPINES: [number, number] = [12.3, 122.6]
const STREET_ZOOM = 17

/** A brand-colored pin, so no marker image files are needed. */
function pinIcon() {
  return L!.divIcon({
    className: '',
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    html: `<svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true" style="filter:drop-shadow(0 2px 2px rgb(0 0 0 / .35))">
      <path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.4 15 39 15 39s14-13.6 14-24.1C29 7.2 22.7 1 15 1z" style="fill:var(--tenant-primary, #1f5641)" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="15" r="5" fill="#fff"/></svg>`,
  })
}

function placeMarker(p: LatLng): void {
  if (!map || !L) return
  if (marker) {
    marker.setLatLng([p.lat, p.lng])
    return
  }
  marker = L.marker([p.lat, p.lng], {
    icon: pinIcon(),
    draggable: props.editable,
    keyboard: props.editable,
    title: props.editable ? 'Drag to the exact spot' : props.label,
  }).addTo(map)
  if (props.editable) {
    marker.on('dragend', () => {
      const ll = marker!.getLatLng()
      emit('update:pin', roundPin({ lat: ll.lat, lng: ll.lng }))
    })
  }
}

onMounted(async () => {
  try {
    L = await import('leaflet')
    await import('leaflet/dist/leaflet.css')
  } catch {
    failed.value = true
    return
  }
  if (!el.value) return
  map = L.map(el.value, {
    zoomControl: props.editable,
    scrollWheelZoom: props.editable,
    // Read-only maps on phones: one finger scrolls the page, not the map.
    dragging: props.editable || !L.Browser.mobile,
    attributionControl: true,
  })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>')
  if (props.pin) {
    map.setView([props.pin.lat, props.pin.lng], STREET_ZOOM)
    placeMarker(props.pin)
  } else {
    map.setView(PHILIPPINES, 5)
  }
  if (props.editable) {
    map.on('click', (e) => {
      const p = roundPin({ lat: e.latlng.lat, lng: e.latlng.lng })
      placeMarker(p)
      emit('update:pin', p)
    })
  }
  // Maps inside dialogs or tabs measure 0×0 at first; re-measure on resize.
  resize = new ResizeObserver(() => map?.invalidateSize())
  resize.observe(el.value)
})

// Pin changed from outside (address search, "use my location", clear).
watch(
  () => props.pin,
  (p) => {
    if (!map) return
    if (!p) {
      marker?.remove()
      marker = null
      return
    }
    const current = marker?.getLatLng()
    if (current && current.lat === p.lat && current.lng === p.lng) return
    placeMarker(p)
    map.setView([p.lat, p.lng], Math.max(map.getZoom(), STREET_ZOOM))
  },
)

onBeforeUnmount(() => {
  resize?.disconnect()
  map?.remove()
  map = null
  marker = null
})
</script>

<template>
  <div class="bg-charcoal-50 relative isolate overflow-hidden">
    <div ref="el" class="h-full w-full" role="region" :aria-label="label" />
    <p
      v-if="failed"
      class="text-charcoal-400 absolute inset-0 flex items-center justify-center p-4 text-center text-sm"
    >
      The map couldn't load. Check your connection.
    </p>
  </div>
</template>
