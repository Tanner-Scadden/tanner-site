import { Array as Arr, MutableHashMap, Option, String as Str } from 'effect'

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
  readonly shots: ReadonlyArray<Shot>
  readonly hits: ReadonlyArray<number>
  readonly splats: ReadonlyArray<Splat>
  readonly downed: number
}

export interface Run {
  readonly seed: number
  readonly frames: Arr.NonEmptyReadonlyArray<Frame>
  readonly held: boolean
  readonly hash: string
}

const HP: Record<ZombieKind, number> = { walker: 1, lid: 2, brute: 4 }

export const DOORS = [
  { x: 10, y: 0 },
  { x: 4, y: 8 },
  { x: 0, y: 4 },
  { x: 15, y: 4 },
] as const

const WAVE_PLAN: ReadonlyArray<{ readonly turn: number; readonly kinds: ReadonlyArray<ZombieKind> }> = [
  { turn: 1, kinds: ['walker', 'walker', 'walker'] },
  { turn: 12, kinds: ['walker', 'walker', 'lid', 'walker'] },
  { turn: 24, kinds: ['lid', 'walker', 'lid', 'walker', 'walker'] },
  { turn: 34, kinds: ['brute', 'walker', 'lid', 'walker', 'walker'] },
]

const RANGE = 3
const AIM = 0.22

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

const nearest = <A extends Spot>(from: Spot, targets: ReadonlyArray<A>): Option.Option<A> => {
  let best: Option.Option<A> = Option.none()
  for (const t of targets) {
    if (Option.isNone(best) || dist(from, t) < dist(from, best.value)) best = Option.some(t)
  }
  return best
}

const stepToward = <A extends Spot>(from: A, to: Spot, roll: number): A => {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  if (dx !== 0 && (dy === 0 || roll < 0.5)) return { ...from, x: from.x + dx }
  return { ...from, y: from.y + dy }
}

const coinFlip = (roll: number, heads: number, tails: number): number => {
  if (roll < 0.5) return heads
  return tails
}

const directionOr = (direction: number, fallback: number): number => {
  if (direction !== 0) return direction
  return fallback
}

const stepAway = (from: Survivor, threat: Spot, roll: number): Survivor => {
  const dx = directionOr(Math.sign(from.x - threat.x), coinFlip(roll, 1, -1))
  const dy = directionOr(Math.sign(from.y - threat.y), coinFlip(roll, -1, 1))
  if (roll < 0.5) return { ...from, x: clamp(from.x + dx, 4, COLS - 5) }
  return { ...from, y: clamp(from.y + dy, 2, ROWS - 3) }
}

const moves = (kind: ZombieKind, turn: number, roll: number): boolean => {
  if (kind === 'walker') return roll < 0.7
  return turn % 2 === 0
}

const hashOf = (frames: ReadonlyArray<Frame>): string => {
  let h = 0x811c9dc5
  const mix = (n: number) => {
    h = Math.imul(h ^ n, 0x01000193)
  }
  for (const frame of frames) {
    for (const s of frame.survivors) {
      mix(s.id); mix(s.x); mix(s.y); mix(Number(s.up))
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
  const frames: Arr.NonEmptyArray<Frame> = [
    { wave, survivors, zombies, shots: [], hits: [], splats: [], downed },
  ]

  for (let turn = 1; turn <= TURNS; turn++) {
    const shots: Array<Shot> = []
    const hits: Array<number> = []
    const splats: Array<Splat> = []

    const plan = Option.filter(Arr.get(WAVE_PLAN, wave), arriving => arriving.turn === turn)
    if (Option.isSome(plan)) {
      wave++
      zombies = [
        ...zombies,
        ...Arr.map(plan.value.kinds, kind => {
          const door = Option.getOrElse(
            Arr.get(DOORS, Math.floor(next() * DOORS.length)),
            () => DOORS[0],
          )
          return { id: zombieId++, kind, x: door.x, y: door.y, hp: HP[kind] }
        }),
      ]
    }

    for (const s of survivors) {
      if (!s.up) continue
      const inRange = Option.filter(nearest(s, zombies), z => dist(s, z) <= RANGE)
      if (Option.isNone(inRange)) continue
      const target = inRange.value
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
      const threat = Option.filter(nearest(s, zombies), z => dist(s, z) <= 2)
      if (Option.isNone(threat) || next() >= 0.5) return s
      return stepAway(s, threat.value, next())
    })

    const standing = Arr.filter(survivors, s => s.up)
    zombies = Arr.map(zombies, z => {
      const target = nearest(z, standing)
      if (Option.isNone(target) || !moves(z.kind, turn, next())) return z
      return stepToward(z, target.value, next())
    })

    survivors = Arr.map(survivors, s => {
      if (s.up && Arr.some(zombies, z => z.x === s.x && z.y === s.y)) return { ...s, up: false }
      return s
    })

    frames.push({ wave, survivors, zombies, shots, hits, splats, downed })
  }

  const held = Arr.some(survivors, s => s.up)
  return { seed, frames, held, hash: hashOf(frames) }
}

const cache = MutableHashMap.empty<number, Run>()

const simulated = (seed: number): Run => {
  const run = simulate(seed)
  MutableHashMap.set(cache, seed, run)
  return run
}

export const runOf = (seed: number): Run =>
  Option.getOrElse(MutableHashMap.get(cache, seed), () => simulated(seed))

export const nextSeed = (seed: number): number =>
  ((Math.imul(seed + 1, 2654435761) >>> 0) % 90000) + 10000
