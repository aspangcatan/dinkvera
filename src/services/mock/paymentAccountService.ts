import type {
  AccountMethod,
  PaymentAccount,
  PlatformAccountMethod,
  PlatformPaymentAccount,
} from '@/types/tenant'

import { db, respond, ServiceError } from './mockDb'

export type PaymentAccountInput = Pick<
  PaymentAccount,
  'accountName' | 'accountNumber' | 'bankName' | 'instructions'
>

/** QR images: JPG, PNG or WebP up to 2 MB (same as the Storage bucket). */
export const QR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const QR_MAX_BYTES = 2 * 1024 * 1024

export function assertQrFile(file: File): void {
  if (!QR_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.')
  if (file.size > QR_MAX_BYTES) throw new Error('The image is over 2 MB. Try a smaller screenshot.')
}

export async function listPaymentAccounts(tenantId: string): Promise<PaymentAccount[]> {
  return respond(db.paymentAccounts.filter((a) => a.tenantId === tenantId))
}

function findOrCreate(tenantId: string, method: AccountMethod): PaymentAccount {
  let account = db.paymentAccounts.find((a) => a.tenantId === tenantId && a.method === method)
  if (!account) {
    account = {
      tenantId,
      method,
      accountName: '',
      accountNumber: '',
      bankName: '',
      instructions: '',
      qrUrl: null,
    }
    db.paymentAccounts.push(account)
  }
  return account
}

export async function savePaymentAccount(
  tenantId: string,
  method: AccountMethod,
  input: PaymentAccountInput,
): Promise<PaymentAccount> {
  Object.assign(findOrCreate(tenantId, method), input)
  return respond(findOrCreate(tenantId, method))
}

/** Mock upload: keeps the image in memory as a data URL. */
export async function uploadPaymentQr(
  tenantId: string,
  method: AccountMethod,
  file: File,
): Promise<PaymentAccount> {
  assertQrFile(file)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new ServiceError('Could not read the image.', 'invalid'))
    reader.readAsDataURL(file)
  })
  findOrCreate(tenantId, method).qrUrl = dataUrl
  return respond(findOrCreate(tenantId, method))
}

export async function removePaymentQr(
  tenantId: string,
  method: AccountMethod,
): Promise<PaymentAccount> {
  findOrCreate(tenantId, method).qrUrl = null
  return respond(findOrCreate(tenantId, method))
}

// --- Sideline's own accounts (where businesses pay invoices) ----------------

function findOrCreatePlatform(method: PlatformAccountMethod): PlatformPaymentAccount {
  let account: PlatformPaymentAccount | undefined = db.platformPaymentAccounts.find(
    (a) => a.method === method,
  )
  if (!account) {
    account = {
      tenantId: '',
      method,
      accountName: '',
      accountNumber: '',
      bankName: '',
      instructions: '',
      qrUrl: null,
    }
    db.platformPaymentAccounts.push(account)
  }
  return account
}

export async function listPlatformPaymentAccounts(): Promise<PlatformPaymentAccount[]> {
  return respond(db.platformPaymentAccounts)
}

export async function savePlatformPaymentAccount(
  method: PlatformAccountMethod,
  input: PaymentAccountInput,
): Promise<PlatformPaymentAccount> {
  return respond(Object.assign(findOrCreatePlatform(method), input))
}

export async function uploadPlatformPaymentQr(
  method: PlatformAccountMethod,
  file: File,
): Promise<PlatformPaymentAccount> {
  assertQrFile(file)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new ServiceError('Could not read the image.', 'invalid'))
    reader.readAsDataURL(file)
  })
  findOrCreatePlatform(method).qrUrl = dataUrl
  return respond(findOrCreatePlatform(method))
}

export async function removePlatformPaymentQr(
  method: PlatformAccountMethod,
): Promise<PlatformPaymentAccount> {
  findOrCreatePlatform(method).qrUrl = null
  return respond(findOrCreatePlatform(method))
}
