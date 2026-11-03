import { supabase, unwrap } from '@/lib/supabase/client'
import type { PlatformSettings } from '@/types/tenant'

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come untyped from PostgREST */
function toSettings(r: Record<string, any>): PlatformSettings {
  return {
    companyName: r.company_name,
    supportEmail: r.support_email,
    billingCurrency: r.billing_currency,
    trialDays: r.trial_days,
    graceDays: r.grace_days,
    suspendAfterInvoices: r.suspend_after_invoices,
    requireCardForTrial: r.require_card_for_trial,
    allowSignups: r.allow_signups,
    maintenanceMode: r.maintenance_mode,
    emailBookingConfirmations: r.email_booking_confirmations,
    emailInvoiceReminders: r.email_invoice_reminders,
  }
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  return toSettings(unwrap(await supabase().from('platform_settings').select('*').single()))
}

export async function savePlatformSettings(input: PlatformSettings): Promise<PlatformSettings> {
  const row = unwrap<Record<string, any>>(
    await supabase()
      .from('platform_settings')
      .update({
        company_name: input.companyName.trim(),
        support_email: input.supportEmail.trim(),
        billing_currency: input.billingCurrency,
        trial_days: input.trialDays,
        grace_days: input.graceDays,
        suspend_after_invoices: input.suspendAfterInvoices,
        require_card_for_trial: input.requireCardForTrial,
        allow_signups: input.allowSignups,
        maintenance_mode: input.maintenanceMode,
        email_booking_confirmations: input.emailBookingConfirmations,
        email_invoice_reminders: input.emailInvoiceReminders,
      })
      .eq('id', true)
      .select('*')
      .single(),
  )
  return toSettings(row)
}
