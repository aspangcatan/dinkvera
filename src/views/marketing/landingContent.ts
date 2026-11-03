/*
 * Copy for the marketing landing page, kept in one place so it can be
 * edited without touching layout code. Only describe features that exist.
 */
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  ClipboardList,
  Globe,
  HeartHandshake,
  Hourglass,
  Layers,
  LayoutGrid,
  LandPlot,
  ListChecks,
  MessagesSquare,
  MonitorSmartphone,
  Palette,
  ReceiptText,
  Rocket,
  Settings2,
  Sparkles,
  TrendingUp,
  UsersRound,
  Wallet,
  type LucideIcon,
} from '@lucide/vue'

/**
 * Where the conversion buttons go. Trials aren't self-serve (Sideline sets
 * up each account), so "Get started" opens the Contact page's trial
 * request form.
 */
export const links = {
  getStarted: '/contact',
  signIn: '/login',
  exampleSite: '/book/rally-point',
  contact: '/contact',
  customBuild: '/contact?topic=custom',
  privacy: '/privacy',
  terms: '/terms',
}

/** SAMPLE contact details shown on the Contact page. Replace with real ones. */
export const contactDetails = {
  email: 'hello@courtdesk.app',
  phone: '+63 917 123 4567',
  hours: 'Monday to Saturday, 9 AM – 6 PM',
  location: 'Cebu City, Philippines',
}

export interface NavItem {
  id: string
  label: string
}

export const navItems: NavItem[] = [
  { id: 'top', label: 'Home' },
  { id: 'features', label: 'Features' },
  { id: 'benefits', label: 'Benefits' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
]

export interface IconItem {
  icon: LucideIcon
  title: string
  body: string
}

export const heroPoints = ['Your own booking page', 'GCash, Maya & bank QR', '7-day free trial']

export const problems: IconItem[] = [
  {
    icon: MessagesSquare,
    title: 'Reservations buried in messages',
    body: 'Chats, calls and comments — every booking starts as a conversation.',
  },
  {
    icon: CalendarX,
    title: 'Double bookings',
    body: 'Two groups, one court, and an awkward conversation at the gate.',
  },
  {
    icon: ClipboardList,
    title: 'Availability tracked by hand',
    body: 'Notebooks and spreadsheets that are out of date the moment you look away.',
  },
  {
    icon: Hourglass,
    title: 'Hours lost to admin',
    body: 'Confirming slots and chasing payments instead of growing the business.',
  },
  {
    icon: UsersRound,
    title: 'Player details everywhere',
    body: 'Names and numbers scattered across phones, chats and paper.',
  },
]

export const solutions: IconItem[] = [
  {
    icon: CalendarCheck,
    title: 'Simple court reservations',
    body: 'Players book open slots themselves, so taken times can’t be booked twice.',
  },
  {
    icon: LayoutGrid,
    title: 'Organized court schedules',
    body: 'Every court and every hour on one calendar, always up to date.',
  },
  {
    icon: ListChecks,
    title: 'All bookings in one place',
    body: 'Online, walk-in and phone bookings together in one list.',
  },
  {
    icon: ReceiptText,
    title: 'Easier payment tracking',
    body: 'See what’s paid and unpaid, and check transfer proofs in one screen.',
  },
  {
    icon: HeartHandshake,
    title: 'A better player experience',
    body: 'Book in minutes from any phone, any time — no app or account needed.',
  },
  {
    icon: Palette,
    title: 'Your brand, front and center',
    body: 'A booking page with your name, colors, photos and house rules.',
  },
]

export interface Feature extends IconItem {
  /** Big bento tile with a product screenshot. */
  shot?: 'calendar' | 'reserve'
}

export const features: Feature[] = [
  {
    icon: CalendarDays,
    title: 'Booking management',
    body: 'Every court on one calendar. Add walk-ins in a few clicks and see each day’s bookings, hours and unpaid slots at a glance.',
    shot: 'calendar',
  },
  {
    icon: Globe,
    title: 'Online reservations',
    body: 'Players choose dates, courts and times in one go on your booking page — no sign-up needed.',
    shot: 'reserve',
  },
  {
    icon: LandPlot,
    title: 'Court management',
    body: 'Set courts, opening hours and separate day and night rates.',
  },
  {
    icon: Wallet,
    title: 'Payment tracking',
    body: 'Show your GCash, Maya or bank QR at checkout. Players upload proof; you confirm it.',
  },
  {
    icon: UsersRound,
    title: 'Player management',
    body: 'A customer list that builds itself from every booking.',
  },
  {
    icon: Palette,
    title: 'Facility branding',
    body: 'Your logo colors, photo banner, rules and policies.',
  },
  {
    icon: BarChart3,
    title: 'Business analytics',
    body: 'Revenue, occupancy by court and hour, and no-show rates.',
  },
  {
    icon: Building2,
    title: 'Multi-facility support',
    body: 'Run several locations from one account, each with its own courts.',
  },
]

export const steps: IconItem[] = [
  {
    icon: Rocket,
    title: 'Subscribe to the platform',
    body: 'Request your 7-day free trial. Our team sets up your account and helps you pick a plan.',
  },
  {
    icon: Settings2,
    title: 'Set up your facility and courts',
    body: 'Add your locations, courts, hours, rates, payment QR codes and branding.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Start accepting online reservations',
    body: 'Share your booking link. Players book and pay; you confirm and play on.',
  },
]

export const reasons: IconItem[] = [
  {
    icon: LandPlot,
    title: 'Designed around pickleball',
    body: 'Courts, hourly slots, day and night rates — built for how courts are really rented.',
  },
  {
    icon: Globe,
    title: 'Your own booking presence',
    body: 'A booking page that carries your facility’s name, not ours.',
  },
  {
    icon: Sparkles,
    title: 'Simple to run',
    body: 'Clean screens your front desk can learn in an afternoon.',
  },
  {
    icon: Layers,
    title: 'Independent facility accounts',
    body: 'Your data, settings and players are kept separate from every other business.',
  },
  {
    icon: TrendingUp,
    title: 'Grows with you',
    body: 'Start with one location and move up a plan as you add courts.',
  },
  {
    icon: Hourglass,
    title: 'Less admin work',
    body: 'Fewer messages to answer, fewer slots to check, more time on the courts.',
  },
]

export const faqs = [
  {
    q: 'What is this platform?',
    a: 'CourtDesk by Sideline is booking and management software for pickleball facilities. You get your own online booking page for players, plus a dashboard with a court calendar, booking list, payment tracking, a customer list and reports.',
  },
  {
    q: 'Who can subscribe?',
    a: 'Any business that rents out pickleball courts — from a single-court venue to a club with several locations.',
  },
  {
    q: 'Can I manage multiple courts?',
    a: 'Yes. Add courts across one or more locations, each with its own opening hours and day and night rates. How many you can add depends on your plan.',
  },
  {
    q: 'Will my facility have its own booking page?',
    a: 'Yes. Every facility gets its own booking page with its name, colors, photos, and rules and policies. Players book from any phone or computer without creating an account.',
  },
  {
    q: 'Can I manage reservations online?',
    a: 'Yes. Online bookings appear on your calendar as soon as they’re made, and you can add walk-in and phone bookings yourself, so everything is in one place.',
  },
  {
    q: 'How does the subscription work?',
    a: 'Request a free trial from our Contact page and our team sets up your account with a 14-day trial. After that, choose a plan and pay monthly or annually (annual saves two months). You pay by GCash, Maya or bank transfer and upload your proof on the invoice; we confirm it.',
  },
  {
    q: 'Can I upgrade my plan?',
    a: 'Yes. Request a plan change from the Subscription page in your dashboard. Our team confirms it, and your new plan’s limits apply once it’s approved.',
  },
]
