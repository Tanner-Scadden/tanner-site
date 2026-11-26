// NOTE: every word the page shows lives here, so copy edits never touch the
// component. Keep it plain and specific, and no em dashes.

export interface Job {
  readonly when: string
  readonly name: string
  readonly role: string
  readonly problem: string
  readonly approach: string
  readonly result: string
}

export const WORK: ReadonlyArray<Job> = [
  {
    when: '2024 → NOW',
    name: 'Vitalize',
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
    role: 'TEAM LEAD',
    problem:
      'An ATV parts business sold on Amazon, Walmart, eBay and WooCommerce, and kept listings, stock and orders in sync by hand.',
    approach:
      'Led a team of six building automation that kept every channel in sync, sent orders to suppliers and adjusted prices on its own.',
    result: 'Fewer shipping mistakes, faster fulfillment, higher margins, and items stayed top sellers.',
  },
  {
    when: '2019 → 2020',
    name: 'Solo',
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
    role: 'MUNCHMANOR.COM',
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
  'I like making hard problems simple.',
  'Hard problems, made simple.',
  'Hard → simple.',
  'Simple.',
] as const

export const ROOMS = ['parlour', 'trophy', 'workshop'] as const
export type RoomId = (typeof ROOMS)[number]

export const ROOM_NAMES: Record<RoomId, string> = {
  parlour: 'PARLOUR',
  trophy: 'TROPHY ROOM',
  workshop: 'WORKSHOP',
}

export const ROOM_TAGS: Record<RoomId, string> = {
  parlour: 'THE GAME',
  trophy: 'WHERE IT CAME FROM',
  workshop: "HOW IT'S BUILT",
}

export const RATTLES_SAYS: Record<RoomId, string> = {
  parlour:
    "Oh! A visitor. Most people stay on the drawings. This is Munch Manor, his game. Have a look around, just don't touch anything sticky.",
  trophy:
    "These aren't his trophies. They're the games that made this one. He talks about them a lot more than the real ones.",
  workshop:
    "This is where Munch Manor gets built. I run the shop. Try the machine: same seed, same run, every time. Same zombies too, sorry.",
}

export const PARLOUR_SAYS: ReadonlyArray<string> = [
  'Munch Manor is a goofy, gory pixel zombie shooter that runs in a browser tab. You and up to three friends hold a haunted manor through 8 waves of the dead, then face Uncle Chunk. Try not to get eaten.',
  "There's nothing to install. Send a link and you're playing together in a minute, on a laptop or on your phone.",
]

export interface Fact {
  readonly label: string
  readonly value: string
}

export const PARLOUR_FACTS: ReadonlyArray<Fact> = [
  { label: 'PLAYERS', value: 'Up to 4' },
  { label: 'INSTALL', value: 'None' },
  { label: 'RUNS ON', value: 'Any browser' },
  { label: 'COSTS', value: 'Free' },
]

export const TROPHY_SAYS: ReadonlyArray<string> = [
  'I grew up playing Zombie Estate II and Call of Duty Zombies with friends. Munch Manor is me trying to bring that feeling back: a quick game you can start with friends from anywhere.',
  "It's a family project, built for playing with family and friends.",
  "It's also my excuse to learn. I wanted to understand game development properly, and to see how far I could push Effect outside of work.",
]

export interface Plaque {
  readonly name: string
  readonly note: string
}

export const SHELF: ReadonlyArray<Plaque> = [
  { name: 'ZOMBIE ESTATE II', note: 'Where it started' },
  { name: 'COD ZOMBIES', note: 'Round after round with friends' },
  { name: 'EFFECT', note: 'The excuse to learn' },
]

export const TROPHY_REST = 'Looking for my actual trophies? They live over here.'

export const WORKSHOP_SAYS: ReadonlyArray<string> = [
  'Munch Manor is a deterministic simulation. The server runs the same game as every player, step for step, so everyone agrees on what happened, even on a phone with a bad connection. Any run can be replayed from its seed.',
  "Below is a tiny version of the idea, using the game's own crew and zombies: four survivors, four waves and a seed. Replay it as many times as you like. Every shot lands the same way and the run hash never changes. Pick a new seed and you get a whole new run.",
]

export const WORKSHOP_STACK = 'TypeScript and Effect, on Cloudflare.'

export const REST_FACTS = [
  'ALLEGIANCE',
  'SENTINELS',
  '2× NA CHAMPION',
  'MVP',
  'NA RUNNER-UP',
  '3 TRIPS TO WORLDS',
] as const

export interface Shot {
  readonly size: 'big' | 'mid' | 'full'
  readonly when: string
  readonly title: string
  // NOTE: put photos in public/worlds/ and set the path here, such as
  // 'worlds/valor-series-s1.jpg'. The gallery only shows shots with a photo.
  readonly photo?: string
}

export const SHOTS: ReadonlyArray<Shot> = [
  {
    size: 'big',
    when: 'JUNE 2018 · E3, LOS ANGELES',
    title: 'VALOR SERIES NA CHAMPIONS · MVP',
    photo: 'worlds/valor-series-e3-mvp.jpg',
  },
  {
    size: 'mid',
    when: 'JULY 2018 · LOS ANGELES',
    title: 'AOV WORLD CUP · TOP 8',
    photo: 'worlds/awc-2018-rest.jpg',
  },
  {
    size: 'mid',
    when: 'JUNE 2022 · SINGAPORE',
    title: 'ON STAGE AT ICONS',
    photo: 'worlds/icons-2022-rest.jpg',
  },
  {
    size: 'full',
    when: 'JULY 2018 · LOS ANGELES',
    title: 'ALLEGIANCE AS TEAM NORTH AMERICA',
    photo: 'worlds/awc-2018-team-na.jpg',
  },
  {
    size: 'full',
    when: 'JUNE 2022 · SINGAPORE',
    title: 'WILD RIFT ICONS · SENTINELS',
    photo: 'worlds/wild-rift-icons-sentinels.jpg',
  },
  // Still looking for photos of these:
  { size: 'mid', when: 'NOV 2018', title: 'VALOR SERIES S2 · CHAMPIONS AGAIN' },
  { size: 'mid', when: 'NOV 2018 · HO CHI MINH CITY', title: 'AIC 2018' },
]

export const MUNCH_MANOR_URL = 'https://munchmanor.com'
export const SITE_REPO_URL = 'https://github.com/Tanner-Scadden/tanner-site'

// NOTE: what `tanner.hello()` prints in the console. The art is ANSI Shadow.
export const HELLO_ART: ReadonlyArray<string> = [
  '██╗  ██╗██╗██╗',
  '██║  ██║██║██║',
  '███████║██║██║',
  '██╔══██║██║╚═╝',
  '██║  ██║██║██╗',
  '╚═╝  ╚═╝╚═╝╚═╝',
]

export const HELLO_LINKS: ReadonlyArray<Link> = [
  ...ELSEWHERE,
  { label: 'play', href: MUNCH_MANOR_URL },
]

export const HELLO_NOTE: ReadonlyArray<string> = [
  "Thanks for poking around. I'm Tanner, and I like making",
  'hard problems simple. Say hi anytime:',
]

// The value `tanner.hello()` returns, shown last in the console.
export const HELLO = 'gg, thanks for stopping by'
