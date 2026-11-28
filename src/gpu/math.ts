import { Number as Num } from 'effect'


export const clamp01 = (t: number): number => Num.clamp(t, { minimum: 0, maximum: 1 })

export const nextRandom = (seed: number): readonly [number, number] => {
  const s = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296]
}

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
  readonly dt: number
  readonly rate: number
  readonly snap?: number
}

export const approach = ({ from, to, dt, rate, snap = 0 }: Approach): number => {
  const next = from + (to - from) * (1 - Math.exp(-rate * dt))
  if (Math.abs(next - to) < snap) return to
  return next
}
