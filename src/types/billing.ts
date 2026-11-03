/** Platform-side billing: what tenants pay the SaaS. */
export type PlanId = 'starter' | 'growth' | 'pro'
export type BillingCycle = 'monthly' | 'annual'

export interface PlanLimits {
  /** `null` = unlimited. */
  locations: number | null
  courts: number | null
  bookingsPerMonth: number | null
}

export interface Plan {
  id: PlanId
  name: string
  description: string
  /** Integer centavos. */
  monthlyPrice: number
  annualPrice: number
  limits: PlanLimits
  features: string[]
  highlighted: boolean
  isPublic: boolean
  /** Shown on pricing with a "Coming soon" badge; businesses can't pick it yet. */
  comingSoon: boolean
}

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled'

export interface Subscription {
  id: string
  tenantId: string
  planId: PlanId
  status: SubscriptionStatus
  billingCycle: BillingCycle
  startedAt: string
  currentPeriodStart: string
  currentPeriodEnd: string
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
}

export type InvoiceStatus = 'paid' | 'open' | 'overdue' | 'void'

export interface Invoice {
  id: string
  number: string
  tenantId: string
  subscriptionId: string
  planId: PlanId
  amount: number
  status: InvoiceStatus
  issuedAt: string
  dueAt: string
  paidAt: string | null
  /** How the business says it paid (manual payments), once proof is sent. */
  paymentMethod: 'qrph' | 'gcash' | 'maya' | 'bank_transfer' | null
  /** Proof of payment: a storage path (a data URL in mock mode). */
  proofPath: string | null
  transactionReference: string
  /** Set while proof waits for Sideline's review; cleared when declined. */
  proofSubmittedAt: string | null
  /** Sideline's reason when it declined the proof. */
  reviewNote: string
  /** Paid online through PayMongo checkout (confirmed automatically). */
  paidOnline: boolean
  /** An online checkout was started (it may have been paid without CourtDesk hearing yet). */
  checkoutStarted?: boolean
  /** First day of the billing period it covers (automatic invoices); null for older ones. */
  periodStart: string | null
}

/** A court owner asking for a free trial from the marketing site. */
export type TrialRequestStatus = 'new' | 'contacted' | 'converted' | 'declined'

export interface TrialRequest {
  id: string
  businessName: string
  contactName: string
  email: string
  phone: string
  city: string
  courts: number | null
  message: string
  /** Plan they asked to try (pricing page button or the form); null = not sure. */
  planId: PlanId | null
  status: TrialRequestStatus
  createdAt: string
  handledAt: string | null
}

export type PlanRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled'

/**
 * A business asking to switch plan. With no automatic payment yet, the
 * plan only changes when a platform admin approves it.
 */
export interface PlanRequest {
  id: string
  tenantId: string
  tenantName: string
  fromPlanId: PlanId
  fromBillingCycle: BillingCycle
  planId: PlanId
  billingCycle: BillingCycle
  /** The business's message to Sideline. */
  note: string
  status: PlanRequestStatus
  /** Sideline's reply, e.g. why it was declined. */
  decisionNote: string
  createdAt: string
  decidedAt: string | null
}
