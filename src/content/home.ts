// NOTE: every word the site shows lives in content/, one file per area, so
// copy edits never touch a component. Keep it plain and specific, and no em
// dashes. This file is the front page.

export interface Job {
  readonly when: string
  readonly name: string
  readonly href: string
  readonly role: string
  readonly problem: string
  readonly approach: string
  readonly result: string
}

export const WORK: ReadonlyArray<Job> = [
  {
    when: '2024 → NOW',
    name: 'Vitalize',
    href: 'https://www.vitalize.care',
    role: 'FOUNDING ENGINEER',
    problem:
      'Hospital staffing depends on forecasts, skills, costs, union rules and many day\u2011of variables.',
    approach:
      'Built the real-time scheduling engine and the app around it. Everything is written in Effect and runs on Effect Cluster.',
    result: 'Used by tens of thousands of clinical staff.',
  },
  {
    when: '2022 → 2024',
    name: 'Demiplane',
    href: 'https://www.demiplane.com',
    role: 'SENIOR FULL STACK',
    problem:
      'Every tabletop RPG has its own rules, and each character tool was hand\u2011built.',
    approach:
      'Built one shared game engine, plus a no-code editor for setting up character rules.',
    result: 'New games go live fast, expansions are easy to add, and players love the character builder.',
  },
  {
    when: '2021 → 2022',
    name: 'Webaholics',
    href: 'https://www.oneapp.today',
    role: 'TECH LEAD',
    problem:
      'An ATV parts business sold on Amazon, Walmart, eBay and WooCommerce, and kept listings, stock and orders in sync by hand.',
    approach:
      'Led a team of six building automation that kept every channel in sync, sent orders to suppliers and adjusted prices on its own.',
    result: 'Fewer shipping mistakes, faster fulfillment, higher margins, and items stayed top sellers.',
  },
  {
    when: '2019 → 2020',
    name: 'Solo',
    href: 'https://gosolo.io',
    role: 'SOLAR PROPOSALS',
    problem:
      'Getting a solar proposal took days, and each permitting packet took hours to put together.',
    approach:
      'Saved the local permitting (AHJ) rules, calculated the system specs, and generated the proposal and permit packet from them.',
    result: 'Proposals went from days to minutes, and the permit packet came with them.',
  },
  {
    when: 'SIDE PROJECT',
    name: 'Munch Manor',
    href: 'https://munchmanor.com',
    role: 'ZOMBIE GAME',
    problem:
      'I wanted real-time 4-player co-op in a browser tab, with no install, that still holds up on a phone with bad signal.',
    approach:
      'A deterministic simulation: the server runs the same game as every client, and any run replays from its seed.',
    result: 'Anyone can jump in with friends for free, on a laptop or a phone.',
  },
]

export interface Project {
  readonly name: string
  readonly what: string
  readonly href: string
}

// Each link lists all my PRs in that project, so the claim is one click from proof.
const GITHUB_USER = 'Tanner-Scadden'
const repoPulls = (repo: string): string =>
  `https://github.com/${repo}/pulls?q=is%3Apr+author%3A${GITHUB_USER}`
const orgPulls = (org: string): string =>
  `https://github.com/search?type=pullrequests&q=is%3Apr+author%3A${GITHUB_USER}+org%3A${org}`

// Strongest first.
export const OPEN_SOURCE: ReadonlyArray<Project> = [
  { name: 'Effect', what: 'Cluster sharding and shutdown', href: repoPulls('Effect-TS/effect') },
  { name: 'Code Climbers', what: 'CLI and browser extension', href: orgPulls('CodeClimbersIO') },
  { name: 'prpc', what: 'Vite plugin, Zod validation, parser', href: repoPulls('OrJDev/prpc') },
  { name: 'Foldkit', what: 'Canvas, UI components, perf, Vite SSR', href: repoPulls('foldkit/foldkit') },
  { name: 'TanStack Router', what: 'Solid adapter', href: repoPulls('TanStack/router') },
  {
    name: 'Solid Primitives',
    what: 'Type-safe i18n provider',
    href: repoPulls('solidjs-community/solid-primitives'),
  },
  { name: 'SolidStart', what: 'Example app and small fixes', href: repoPulls('solidjs/solid-start') },
]

export interface Link {
  readonly label: string
  readonly href: string
}

// TODO(tanner): add LinkedIn once you have the URL you want here.
export const ELSEWHERE: ReadonlyArray<Link> = [
  { label: 'github', href: 'https://github.com/Tanner-Scadden' },
  { label: 'x', href: 'https://x.com/TannerSDev' },
]

export const THESES = [
  'I build the hard part underneath the product.',
  'The hard part, underneath.',
  'Underneath.',
  'Solved.',
] as const

export const BIO =
  "Scheduling engines, game rules engines, marketplace sync. I'm usually an early engineer at a startup, and I build the part everything else depends on, then keep it running. Mostly TypeScript and Effect. Self-taught."


export const SITE_REPO_URL = 'https://github.com/Tanner-Scadden/tanner-site'
