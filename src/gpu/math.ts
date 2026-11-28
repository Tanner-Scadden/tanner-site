import { Number as Num } from 'effect'

// Small numeric pieces every drawing on the site repeats.

export const clamp01 = (t: number): number => Num.clamp(t, { minimum: 0, maximum: 1 })

// Mulberry32, a small seeded generator, so a run replays from its seed.
// One step of it: the next seed and a number from 0 to 1. The seed is kept
// as a signed 32-bit integer; only its bits matter.
export const nextRandom = (seed: number): readonly [number, number] => {
  const s = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296]
}

// The same generator as a function that keeps its own seed, for code that
// draws many numbers in a row. The seed is taken as an unsigned 32-bit
// integer first, so any number gives the same run as its whole-number bits.
export const random = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    const [next, value] = nextRandom(state)
    state = next
    return value
  }
}

export interface Approach {
  readonly from: number
  readonly to: number
  // Seconds since the last step.
  readonly dt: number
  // How fast it closes in, per second.
  readonly rate: number
  // How close counts as there. Without it, it never lands on `to` early.
  readonly snap?: number
}

// Eases `from` toward `to` at the same speed at any frame rate, and lands
// exactly on `to` once it's within `snap`, so the page can stop drawing.
export const approach = ({ from, to, dt, rate, snap = 0 }: Approach): number => {
  const next = from + (to - from) * (1 - Math.exp(-rate * dt))
  return Math.abs(next - to) < snap ? to : next
}
