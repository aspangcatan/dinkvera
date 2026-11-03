<script setup lang="ts">
import { RouterLink } from 'vue-router'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dark' | 'ball'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    /** Internal route (Vue Router). For an external URL, use `href` instead. */
    to?: string | Record<string, unknown>
    href?: string
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    fullWidth?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    to: undefined,
    href: undefined,
    type: 'button',
    disabled: false,
    loading: false,
    fullWidth: false,
  },
)

/*
 * `primary` follows the tenant brand (defaults to forest on platform
 * pages, see main.css), so the same button is on-brand everywhere.
 */
const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-lime-300 text-forest-800 hover:bg-lime-400 active:bg-lime-500',
  outline:
    'border border-charcoal-200 bg-white text-charcoal-600 shadow-sm hover:bg-charcoal-50 active:bg-charcoal-100',
  ghost: 'text-charcoal-500 hover:bg-charcoal-100 hover:text-charcoal-700 bg-transparent',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800',
  dark: 'bg-forest-800 text-warm-white hover:bg-forest-700 active:bg-forest-900',
  /* Marketing-site CTA (lime pill), e.g. on the sign-in screens. */
  ball: 'rounded-full! bg-ball text-court shadow-[0_8px_24px_-8px_rgba(199,243,107,0.65)] hover:bg-[#d4f78a] active:bg-[#b9ea52]',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

const baseClasses =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2'

const isDisabled = () => props.disabled || props.loading
</script>

<template>
  <RouterLink
    v-if="to && !isDisabled()"
    :to="to"
    :class="[baseClasses, variantClasses[variant], sizeClasses[size], fullWidth ? 'w-full' : '']"
  >
    <slot name="icon-left" />
    <slot />
    <slot name="icon-right" />
  </RouterLink>
  <a
    v-else-if="href && !isDisabled()"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    :class="[baseClasses, variantClasses[variant], sizeClasses[size], fullWidth ? 'w-full' : '']"
  >
    <slot name="icon-left" />
    <slot />
    <slot name="icon-right" />
  </a>
  <button
    v-else
    :type="type"
    :disabled="isDisabled()"
    :class="[
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      fullWidth ? 'w-full' : '',
      'disabled:cursor-not-allowed disabled:opacity-50',
    ]"
  >
    <svg
      v-if="loading"
      class="-ml-0.5 size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
    <slot v-if="!loading" name="icon-left" />
    <slot />
    <slot v-if="!loading" name="icon-right" />
  </button>
</template>
