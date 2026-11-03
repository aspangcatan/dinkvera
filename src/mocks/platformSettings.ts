import type { PlatformSettings } from '@/types/tenant'

/** Same defaults as the platform_settings row in the migration. */
export const platformSettingsSeed: PlatformSettings = {
  companyName: 'Sideline Technologies Inc.',
  supportEmail: 'support@courtdesk.app',
  billingCurrency: 'PHP',
  trialDays: 14,
  graceDays: 7,
  suspendAfterInvoices: 2,
  requireCardForTrial: false,
  allowSignups: false,
  maintenanceMode: false,
  emailBookingConfirmations: true,
  emailInvoiceReminders: true,
}
