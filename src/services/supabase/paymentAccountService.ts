import { supabase, toError, unwrap, storageError } from '@/lib/supabase/client'
import type {
  AccountMethod,
  PaymentAccount,
  PlatformAccountMethod,
  PlatformPaymentAccount,
} from '@/types/tenant'

import { assertQrFile, type PaymentAccountInput } from '../mock/paymentAccountService'

const BUCKET = 'payment-qr'

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come untyped from PostgREST */
function toAccount<M extends string = AccountMethod>(r: Record<string, any>): PaymentAccount<M> {
  return {
    tenantId: r.tenant_id ?? '',
    method: r.method,
    accountName: r.account_name,
    accountNumber: r.account_number,
    bankName: r.bank_name,
    instructions: r.instructions,
    // Stored as an object path, so the bucket URL never gets baked into data.
    qrUrl: r.qr_path
      ? supabase().storage.from(BUCKET).getPublicUrl(r.qr_path).data.publicUrl
      : null,
  }
}

async function getRow(tenantId: string, method: AccountMethod) {
  const { data, error } = await supabase()
    .from('payment_accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('method', method)
    .maybeSingle()
  if (error) throw toError(error)
  return data
}

export async function listPaymentAccounts(tenantId: string): Promise<PaymentAccount[]> {
  return unwrap(
    await supabase().from('payment_accounts').select('*').eq('tenant_id', tenantId),
  ).map(toAccount)
}

export async function savePaymentAccount(
  tenantId: string,
  method: AccountMethod,
  input: PaymentAccountInput,
): Promise<PaymentAccount> {
  const row = unwrap<Record<string, any>>(
    await supabase()
      .from('payment_accounts')
      .upsert({
        tenant_id: tenantId,
        method,
        account_name: input.accountName,
        account_number: input.accountNumber,
        bank_name: input.bankName,
        instructions: input.instructions,
      })
      .select('*')
      .single(),
  )
  return toAccount(row)
}

/**
 * Uploads a new QR image into the business's folder, points the account
 * at it, then removes the previous image. A fresh file name each time
 * keeps browsers and the CDN from showing a cached old QR.
 */
export async function uploadPaymentQr(
  tenantId: string,
  method: AccountMethod,
  file: File,
): Promise<PaymentAccount> {
  assertQrFile(file)
  const previous = (await getRow(tenantId, method))?.qr_path as string | undefined
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${tenantId}/${method}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw storageError(uploadError.message, 'QR code uploads')

  const row = unwrap<Record<string, any>>(
    await supabase()
      .from('payment_accounts')
      .upsert({ tenant_id: tenantId, method, qr_path: path })
      .select('*')
      .single(),
  )
  if (previous && previous !== path) await supabase().storage.from(BUCKET).remove([previous])
  return toAccount(row)
}

export async function removePaymentQr(
  tenantId: string,
  method: AccountMethod,
): Promise<PaymentAccount> {
  const previous = (await getRow(tenantId, method))?.qr_path as string | undefined
  const row = unwrap<Record<string, any>>(
    await supabase()
      .from('payment_accounts')
      .upsert({ tenant_id: tenantId, method, qr_path: null })
      .select('*')
      .single(),
  )
  if (previous) await supabase().storage.from(BUCKET).remove([previous])
  return toAccount(row)
}

// --- Sideline's own accounts (where businesses pay invoices) ----------------
// Same columns without tenant_id; QR images go in the bucket's "sideline/" folder.

const PLATFORM_TABLE = 'platform_payment_accounts'

async function getPlatformRow(method: PlatformAccountMethod) {
  const { data, error } = await supabase()
    .from(PLATFORM_TABLE)
    .select('*')
    .eq('method', method)
    .maybeSingle()
  if (error) throw toError(error)
  return data
}

export async function listPlatformPaymentAccounts(): Promise<PlatformPaymentAccount[]> {
  return unwrap(await supabase().from(PLATFORM_TABLE).select('*')).map(toAccount)
}

export async function savePlatformPaymentAccount(
  method: PlatformAccountMethod,
  input: PaymentAccountInput,
): Promise<PlatformPaymentAccount> {
  const row = unwrap<Record<string, any>>(
    await supabase()
      .from(PLATFORM_TABLE)
      .upsert({
        method,
        account_name: input.accountName,
        account_number: input.accountNumber,
        bank_name: input.bankName,
        instructions: input.instructions,
      })
      .select('*')
      .single(),
  )
  return toAccount(row)
}

export async function uploadPlatformPaymentQr(
  method: PlatformAccountMethod,
  file: File,
): Promise<PlatformPaymentAccount> {
  assertQrFile(file)
  const previous = (await getPlatformRow(method))?.qr_path as string | undefined
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `sideline/${method}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw storageError(uploadError.message, 'QR code uploads')

  const row = unwrap<Record<string, any>>(
    await supabase().from(PLATFORM_TABLE).upsert({ method, qr_path: path }).select('*').single(),
  )
  if (previous && previous !== path) await supabase().storage.from(BUCKET).remove([previous])
  return toAccount(row)
}

export async function removePlatformPaymentQr(
  method: PlatformAccountMethod,
): Promise<PlatformPaymentAccount> {
  const previous = (await getPlatformRow(method))?.qr_path as string | undefined
  const row = unwrap<Record<string, any>>(
    await supabase().from(PLATFORM_TABLE).upsert({ method, qr_path: null }).select('*').single(),
  )
  if (previous) await supabase().storage.from(BUCKET).remove([previous])
  return toAccount(row)
}
