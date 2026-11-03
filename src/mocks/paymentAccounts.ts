import type { PaymentAccount, PlatformPaymentAccount } from '@/types/tenant'

/** Payment details customers see at checkout (same as the database seed; no QR images). */
const account = (
  tenantId: string,
  method: PaymentAccount['method'],
  accountName: string,
  accountNumber: string,
  extra: Partial<PaymentAccount> = {},
): PaymentAccount => ({
  tenantId,
  method,
  accountName,
  accountNumber,
  bankName: '',
  instructions: '',
  qrUrl: null,
  ...extra,
})

export const paymentAccountSeed: PaymentAccount[] = [
  account('tn_rally', 'gcash', 'Rally Point Sports Inc.', '0917 555 0142', {
    instructions: 'Use your full name as the message.',
  }),
  account('tn_rally', 'maya', 'Rally Point Sports Inc.', '0917 555 0142'),
  account('tn_rally', 'bank_transfer', 'Rally Point Sports Inc.', '0012 3456 7890', {
    bankName: 'BDO',
  }),
  account('tn_dink', 'gcash', 'Dink and Drive Recreation', '0918 555 0198'),
  account('tn_dink', 'maya', 'Dink and Drive Recreation', '0918 555 0198'),
  account('tn_kitchen', 'gcash', 'Marivic Dela Cruz', '0927 555 0110', {
    instructions: 'Send a screenshot to our Facebook page too.',
  }),
  account('tn_baseline', 'gcash', 'Baseline Sports Hub', '0939 555 0177'),
  account('tn_paddle', 'gcash', 'Paddle Republic Holdings', '0917 555 0303'),
  account('tn_paddle', 'bank_transfer', 'Paddle Republic Holdings Inc.', '1234 5678 90', {
    bankName: 'BPI',
  }),
  account('tn_thirdshot', 'gcash', 'Rico Santos', '0920 555 0155'),
  account('tn_coast', 'gcash', 'Coastline Pickle Co.', '0905 555 0121'),
]

/** Sideline's own details, shown to businesses paying an invoice (sample values). */
export const platformPaymentAccountSeed: PlatformPaymentAccount[] = [
  account('', 'gcash', 'Sideline Technologies', '0917 555 0100', {
    instructions: 'Put your invoice number (e.g. SL-1052) in the message.',
  }),
  account('', 'bank_transfer', 'Sideline Technologies Inc.', '0012 3456 7890', {
    bankName: 'BDO',
    instructions: 'Use your invoice number as the reference.',
  }),
]
