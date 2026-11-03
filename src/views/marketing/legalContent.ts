/*
 * DRAFT legal pages for the marketing site. Starting points only — have
 * them reviewed by a lawyer before launch, and replace the sample emails
 * (see src/config/brand.ts for the names and domain).
 */
import { brand } from '@/config/brand'

export interface LegalSection {
  heading: string
  paragraphs: string[]
}

export const company = {
  name: brand.legalName,
  email: `hello@${brand.domain}`,
  privacyEmail: `privacy@${brand.domain}`,
  address: 'Cebu City, Philippines',
}

export const legalUpdated = '2026-11-02'

export const privacySections: LegalSection[] = [
  {
    heading: 'Who we are',
    paragraphs: [
      `CourtDesk is court booking and management software for pickleball facilities, operated by ${company.name} ("Sideline", "we", "us"). This policy explains what personal information we collect, why, and the choices you have. We follow the Philippine Data Privacy Act of 2012 (Republic Act No. 10173) and its implementing rules.`,
    ],
  },
  {
    heading: 'Two kinds of users',
    paragraphs: [
      'Facility owners ("businesses") subscribe to CourtDesk to run their courts. Players book courts on a business’s booking page.',
      'For player information, the business is the personal information controller and Sideline processes it on the business’s behalf. Questions about a booking should go to the facility first; we will help them answer.',
    ],
  },
  {
    heading: 'What we collect',
    paragraphs: [
      'From businesses: your name, email address, mobile number, business name and address, your facility’s courts, rates and settings, and billing records, including proof of payment you upload for your invoices.',
      'From players, on behalf of businesses: name, mobile number, optional email address, booking details, and proof of payment if uploaded.',
      'From everyone: basic technical information such as IP address, browser type and pages visited, used to keep the service secure and working (for example, to limit abuse of booking forms).',
      'From free-trial requests: the details you enter on our Contact page.',
    ],
  },
  {
    heading: 'How we use it',
    paragraphs: [
      'To provide the service: create and manage bookings, show availability, record payments, and produce reports for businesses.',
      'To run our business: set up accounts and free trials, issue invoices, check payments, and provide support.',
      'To keep CourtDesk safe: prevent spam, fraud and misuse.',
      'We do not sell personal information, and we do not use player information for our own marketing.',
    ],
  },
  {
    heading: 'Sharing',
    paragraphs: [
      'A player’s booking details are shared with the facility they booked. Each business can only see its own players and bookings.',
      'We use trusted service providers to host data and run the service (for example, our database and file storage provider). They may only process data on our instructions.',
      'We may disclose information when required by law or to protect the rights and safety of our users or the public.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'We keep business account and billing records for as long as the account is active and afterwards as required by tax and accounting rules. Booking records are kept for as long as the business keeps its account, unless the business deletes them sooner. Free-trial requests we can’t act on are deleted within 12 months.',
    ],
  },
  {
    heading: 'Security',
    paragraphs: [
      'Data is stored with access controls that keep each business’s data separate. Payment proofs are stored privately and shown only to the business concerned (or, for invoices, to Sideline). No system is perfectly secure; if a breach affects you, we will notify you and the National Privacy Commission as the law requires.',
    ],
  },
  {
    heading: 'Your rights',
    paragraphs: [
      'You may ask to access, correct or delete your personal information, object to processing, or ask for a copy of your data. Players should contact the facility they booked with; businesses and anyone else can contact us at the address below. You may also complain to the National Privacy Commission.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      `Data protection questions: ${company.privacyEmail}. ${company.name}, ${company.address}.`,
      'We may update this policy. We will post the new version here and, for important changes, tell businesses by email.',
    ],
  },
]

export const termsSections: LegalSection[] = [
  {
    heading: 'About these terms',
    paragraphs: [
      `These terms are an agreement between ${company.name} ("Sideline") and the business that subscribes to CourtDesk ("you"). By using CourtDesk you agree to them. If you use CourtDesk for a company, you confirm you may accept these terms for it.`,
    ],
  },
  {
    heading: 'The service',
    paragraphs: [
      'Sideline provides CourtDesk, software to manage pickleball courts: a booking page for your players, a court calendar, booking and customer records, payment tracking and reports. Features depend on your plan and may change as we improve the service.',
    ],
  },
  {
    heading: 'Accounts and free trials',
    paragraphs: [
      'Accounts are set up by Sideline. Free trials are granted by Sideline on request and last for the period we tell you. When the trial ends, your account moves onto the plan shown on your Subscription page and the first invoice is issued; tell us before then if you don’t want to continue.',
      'Keep your login details safe. You are responsible for activity under your account.',
    ],
  },
  {
    heading: 'Plans, invoices and payment',
    paragraphs: [
      'Subscriptions are billed monthly or annually in advance, in Philippine pesos, at the prices shown when you subscribe or change plan.',
      'Payments are made manually to Sideline’s published payment accounts. Upload your proof of payment on the invoice; an invoice is paid once Sideline confirms the payment.',
      'Plan changes are requested from your dashboard and take effect once Sideline approves them. If an invoice stays unpaid after its due date, your account may be marked past due and, after notice, your booking page may be paused until it is paid.',
      'Fees already paid are not refundable unless the law requires otherwise.',
    ],
  },
  {
    heading: 'Payments from your players',
    paragraphs: [
      'Players pay you directly using the payment details you publish. Sideline does not receive, hold or refund players’ money and is not a party to your agreements with your players. You are responsible for your prices, house rules, policies, cancellations and refunds.',
    ],
  },
  {
    heading: 'Your data and your players’ data',
    paragraphs: [
      'You own the data you put into CourtDesk. You allow us to host and process it to provide the service. For your players’ personal information, you are the personal information controller and we process it on your behalf, as described in our Privacy Policy.',
      'You must have the right to collect the information you put into CourtDesk and must use it lawfully.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: [
      'Do not misuse CourtDesk: no unlawful activity, no attempts to access other businesses’ data, no interfering with the service, and no reselling it without our written permission.',
    ],
  },
  {
    heading: 'Availability and changes',
    paragraphs: [
      'We work to keep CourtDesk available but do not guarantee uninterrupted service. We may change or discontinue features; if a change significantly reduces what you pay for, we will tell you in advance.',
    ],
  },
  {
    heading: 'Cancelling',
    paragraphs: [
      'You can cancel from your dashboard; your plan stays active until the end of the paid period. We may suspend or close accounts that break these terms or remain unpaid, after notice where reasonable.',
    ],
  },
  {
    heading: 'Liability',
    paragraphs: [
      'CourtDesk is provided “as is” to the extent the law allows. We are not liable for indirect or consequential losses, such as lost bookings or profits. Our total liability for any claim is limited to the fees you paid us in the 12 months before the claim.',
    ],
  },
  {
    heading: 'General',
    paragraphs: [
      'These terms are governed by the laws of the Philippines. We may update them; we will post the new version here and tell you about important changes. Continuing to use CourtDesk after a change means you accept it.',
      `Questions: ${company.email}.`,
    ],
  },
]
