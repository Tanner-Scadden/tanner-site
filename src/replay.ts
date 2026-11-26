import { Array as Arr, String as Str } from 'effect'

// NOTE: a tiny version of Munch Manor's big idea for the Workshop: four
// survivors hold the parlour against a few waves. The run is a pure function
// of its seed: no Math.random, no clock. Same seed, same run, same hash.

// The parlour is 320x180 game pixels, cut into 20px tiles.
export const ROOM_W = 320
export const ROOM_H = 180
export const COLS = 16
export const ROWS = 9
export const TURNS = 48
export const WAVES = 4
export const FIRST_SEED = 13370

export type ZombieKind = 'walker' | 'lid' | 'brute'

export interface Survivor {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly up: boolean
}

export interface Zombie {
  readonly id: number
  readonly kind: ZombieKind
  readonly x: number
  readonly y: number
  readonly hp: number
}

export interface Splat {
  readonly id: number
  readonly kind: ZombieKind
  readonly x: number
  readonly y: number
}

// One shot fired this turn, from a survivor's tile toward a zombie's tile.
export interface Shot {
  readonly by: number
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly hit: boolean
}

export interface Frame {
  readonly wave: number
  readonly survivors: ReadonlyArray<Survivor>
  readonly zombies: ReadonlyArray<Zombie>
  // Shots fired, zombies hit and zombies downed on this turn, for the
  // tracers, the flash and the fall.
  readonly shots: ReadonlyArray<Shot>
  readonly hits: ReadonlyArray<number>
  readonly splats: ReadonlyArray<Splat>
  readonly downed: number
}

export interface Run {
  readonly seed: number
  readonly frames: ReadonlyArray<Frame>
  readonly held: boolean
  readonly hash: string
}

const HP: Record<ZombieKind, number> = { walker: 1, lid: 2, brute: 4 }

// Where the parlour's doors are, in tiles.
export const DOORS = [
  { x: 10, y: 0 },
  { x: 4, y: 8 },
  { x: 0, y: 4 },
  { x: 15, y: 4 },
] as const

// Each wave: the turn it starts, and who comes through the doors.
const WAVE_PLAN: ReadonlyArray<{ readonly turn: number; readonly kinds: ReadonlyArray<ZombieKind> }> = [
  { turn: 1, kinds: ['walker', 'walker', 'walker'] },
  { turn: 12, kinds: ['walker', 'walker', 'lid', 'walker'] },
  { turn: 24, kinds: ['lid', 'walker', 'lid', 'walker', 'walker'] },
  { turn: 34, kinds: ['brute', 'walker', 'lid', 'walker', 'walker'] },
]

const RANGE = 3
const AIM = 0.22

// mulberry32: small, fast, and the same in every browser.
const rng = (seed: number) => {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Spot {
  readonly x: number
  readonly y: number
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

const dist = (a: Spot, b: Spot) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

const nearest = <A extends Spot>(from: Spot, targets: ReadonlyArray<A>): A | undefined => {
  let best: A | undefined
  for (const t of targets) {
    if (best === undefined || dist(from, t) < dist(from, best)) best = t
  }
  return best
}

const stepToward = <A extends Spot>(from: A, to: Spot, roll: number): A => {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  return dx !== 0 && (dy === 0 || roll < 0.5)
    ? { ...from, x: from.x + dx }
    : { ...from, y: from.y + dy }
}

// Survivors back off toward the middle of the rug, never into a wall.
const stepAway = (from: Survivor, threat: Spot, roll: number): Survivor => {
  const dx = Math.sign(from.x - threat.x) || (roll < 0.5 ? 1 : -1)
  const dy = Math.sign(from.y - threat.y) || (roll < 0.5 ? -1 : 1)
  return roll < 0.5
    ? { ...from, x: clamp(from.x + dx, 4, COLS - 5) }
    : { ...from, y: clamp(from.y + dy, 2, ROWS - 3) }
}

// NOTE: walkers shamble most turns; lids and brutes are slower.
const moves = (kind: ZombieKind, turn: number, roll: number): boolean =>
  kind === 'walker' ? roll < 0.7 : turn % 2 === 0

// FNV-1a over every position in every frame.
const hashOf = (frames: ReadonlyArray<Frame>): string => {
  let h = 0x811c9dc5
  const mix = (n: number) => {
    h = Math.imul(h ^ n, 0x01000193)
  }
  for (const frame of frames) {
    for (const s of frame.survivors) {
      mix(s.id); mix(s.x); mix(s.y); mix(s.up ? 1 : 0)
    }
    mix(-1)
    for (const z of frame.zombies) {
      mix(z.id); mix(z.x); mix(z.y); mix(z.hp)
    }
    mix(frame.downed)
  }
  return Str.toUpperCase(Str.slice(0, 6)(Str.padStart(8, '0')((h >>> 0).toString(16))))
}

const simulate = (seed: number): Run => {
  const next = rng(seed)
  let zombieId = 100
  let survivors: ReadonlyArray<Survivor> = [
    { id: 0, x: 7, y: 4, up: true },
    { id: 1, x: 8, y: 4, up: true },
    { id: 2, x: 7, y: 5, up: true },
    { id: 3, x: 8, y: 5, up: true },
  ]
  let zombies: ReadonlyArray<Zombie> = []
  let downed = 0
  let wave = 0
  const frames: Array<Frame> = [
    { wave, survivors, zombies, shots: [], hits: [], splats: [], downed },
  ]

  for (let turn = 1; turn <= TURNS; turn++) {
    const shots: Array<Shot> = []
    const hits: Array<number> = []
    const splats: Array<Splat> = []

    const plan = WAVE_PLAN[wave]
    if (plan !== undefined && plan.turn === turn) {
      wave++
      zombies = [
        ...zombies,
        ...Arr.map(plan.kinds, kind => {
          const door = DOORS[Math.floor(next() * DOORS.length)] ?? DOORS[0]
          return { id: zombieId++, kind, x: door.x, y: door.y, hp: HP[kind] }
        }),
      ]
    }

    // Survivors shoot the nearest zombie in range, or back off if it's close.
    for (const s of survivors) {
      if (!s.up) continue
      const target = nearest(s, zombies)
      if (target === undefined || dist(s, target) > RANGE) continue
      const hit = next() < AIM
      shots.push({ by: s.id, x0: s.x, y0: s.y, x1: target.x, y1: target.y, hit })
      if (hit) {
        hits.push(target.id)
        zombies = Arr.flatMap(zombies, z => {
          if (z.id !== target.id) return [z]
          if (z.hp > 1) return [{ ...z, hp: z.hp - 1 }]
          downed++
          splats.push({ id: z.id, kind: z.kind, x: z.x, y: z.y })
          return []
        })
      }
    }
    survivors = Arr.map(survivors, s => {
      if (!s.up) return s
      const threat = nearest(s, zombies)
      return threat !== undefined && dist(s, threat) <= 2 && next() < 0.5
        ? stepAway(s, threat, next())
        : s
    })

    // Zombies go for the nearest survivor still standing.
    const standing = Arr.filter(survivors, s => s.up)
    zombies = Arr.map(zombies, z => {
      const target = nearest(z, standing)
      return target !== undefined && moves(z.kind, turn, next())
        ? stepToward(z, target, next())
        : z
    })

    // Try not to get eaten.
    survivors = Arr.map(survivors, s =>
      s.up && Arr.some(zombies, z => z.x === s.x && z.y === s.y)
        ? { ...s, up: false }
        : s,
    )

    frames.push({ wave, survivors, zombies, shots, hits, splats, downed })
  }

  const held = Arr.some(survivors, s => s.up)
  return { seed, frames, held, hash: hashOf(frames) }
}

const cache = new Map<number, Run>()

export const runOf = (seed: number): Run => {
  const hit = cache.get(seed)
  if (hit !== undefined) return hit
  const run = simulate(seed)
  cache.set(seed, run)
  return run
}

// NOTE: the next seed comes from the current one, so the update stays pure.
export const nextSeed = (seed: number): number =>
  ((Math.imul(seed + 1, 2654435761) >>> 0) % 90000) + 10000
