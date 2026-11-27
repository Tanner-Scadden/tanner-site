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
  // The colour of the wave that runs through this job, if not the usual gold.
  readonly wave?: string
}

export const WORK: ReadonlyArray<Job> = [
  {
    when: '2024 → NOW',
    name: 'Vitalize',
    href: 'https://www.vitalize.care',
    role: 'FOUNDING ENGINEER',
    problem:
      'Hospital staffing and scheduling depend on forecasts, skills, costs, union rules and many day\u2011of variables. Money is wasted, staff burn out, and managers drown in custom processes.',
    approach:
      'Built the real-time scheduling engine and the app around it. Everything is written in Effect and runs on Effect Cluster.',
    result:
      'Hospitals save time and millions of dollars, schedules are fairer, and staff spend more time with patients. Used by tens of thousands of clinical staff.',
  },
  {
    when: '2022 → 2024',
    name: 'Demiplane',
    href: 'https://www.demiplane.com',
    role: 'SENIOR FULL STACK',
    problem:
      'Every tabletop RPG has its own rules, and each character tool was hand\u2011built. New games were slow to launch, and every expansion meant more custom code.',
    approach:
      'Built a game engine powered by a rule engine, with a custom framework on top of React that let us scale without engineers.',
    result: 'New games go live fast, game rules are easy to update, and players love the character builder.',
  },
  {
    when: '2021 → 2022',
    name: 'Webaholics',
    href: 'https://www.oneapp.today',
    role: 'TECH LEAD',
    problem:
      'An ATV parts business sold on Amazon, Walmart, eBay and WooCommerce, and kept listings, stock and orders in sync by hand. Orders shipped wrong, fulfillment was slow, and margins were thin.',
    approach:
      'Built inventory management that brought every POS into one system, plus automation, from web scrapers to Chrome extensions, that sent orders to suppliers and adjusted prices on its own.',
    result: 'Fewer shipping mistakes, faster fulfillment, higher margins, and their items stayed top sellers.',
  },
  {
    when: '2019 → 2020',
    name: 'Solo',
    href: 'https://gosolo.io',
    role: 'ENGINEER',
    problem:
      'Getting a solar proposal took days, and each permitting packet took hours to put together. Customers waited, and the team lost hours to paperwork.',
    approach:
      'Built custom CAD tooling in canvas, saved the local permitting (AHJ) rules, calculated the system specs, and generated the proposal and permit packet from them.',
    result: 'Proposals went from days to minutes, and the permit packet came with them.',
  },
  {
    when: 'SIDE PROJECT',
    name: 'Munch Manor',
    href: 'https://munchmanor.com',
    role: 'ZOMBIE GAME',
    problem:
      'I wanted a fun zombie game to play with friends, like the ones from my childhood: online, free, and anyone can jump in.',
    approach:
      'Built it on Cloudflare Durable Objects, with fun pixel art and a story about collecting items to escape Munch Manor.',
    result: 'Anyone can jump in for free, on a laptop or a phone, and make more memories killing zombies with friends.',
    // Its own zombie green.
    wave: '#7ce36b',
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

// The big line up top. Each click drops a few more words, down to one.
export const THESES = [
  'I like to build things. Mostly software, sometimes games.',
  'I like to build things.',
  'I like to build.',
  'Build.',
] as const

export const GREETING = "Hey, I'm Tanner 👋"

export const WELCOME = "Come on in and click around. There's a few Easter eggs."

// The fourth section of the page, about life away from the keyboard.
export const PERSONAL_LIFE = 'PERSONAL LIFE'

// NOTE: the floor plan next to the greeting. Each room is a section of the
// page, in page order: the blog is the library. D-13 stays shut, like the
// door at the bottom of the sheet.
export const HOUSE = {
  sheet: 'SHEET A-1 · THE HOUSE',
  rooms: {
    library: { name: '01 BLOG' },
    work: { name: '02 WORK' },
    oss: { name: '03 OPEN SOURCE' },
    outside: { name: `04 ${PERSONAL_LIFE}` },
    locked: { name: 'D-13', note: 'CLOSED' },
  },
} as const

export const SIGN_OFF = 'Thanks for stopping by'

export const SITE_REPO_URL = 'https://github.com/Tanner-Scadden/tanner-site'
