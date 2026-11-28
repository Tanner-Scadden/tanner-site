import { Array as Arr, Boolean as Bool, Option } from 'effect'
import { dual } from 'effect/Function'

import { stepSince } from '../../gpu/loop.ts'
import { approach } from '../../gpu/math.ts'

export const STEPS = 3
export const WAVE_DELAY_MS = 220
export const WAVE_MS = 1500
export const WAVE_TAIL = 0.15
export const PING_MS = 600
const WAVE_END_MS = WAVE_MS * (1 + WAVE_TAIL)
const HOVER_PER_S = 12
const SNAP = 0.002

export interface JobState {
  readonly seenAt: Option.Option<number>
  readonly waveAt: Option.Option<number>
  readonly hover: ReadonlyArray<number>
}

export interface WorkState {
  readonly jobs: ReadonlyArray<JobState>
  readonly last: Option.Option<number>
}

export interface Hovered {
  readonly job: number
  readonly step: Option.Option<number>
}

export interface Tick {
  readonly now: number
  readonly hovered: Option.Option<Hovered>
  readonly still: boolean
}

export interface JobEvent {
  readonly job: number
  readonly now: number
}

export interface At {
  readonly now: number
  readonly still: boolean
}

export const initialWork = (jobs: number): WorkState => ({
  jobs: Arr.makeBy(jobs, () => ({
    seenAt: Option.none(),
    waveAt: Option.none(),
    hover: Arr.makeBy(STEPS, () => 0),
  })),
  last: Option.none(),
})

const updateJob = (
  state: WorkState,
  index: number,
  f: (job: JobState) => JobState,
): WorkState => {
  const job = Arr.get(state.jobs, index)
  if (Option.isNone(job)) return state
  const next = f(job.value)
  if (next === job.value) return state
  return {
    ...state,
    jobs: Arr.map(state.jobs, (old, i) => Bool.match(i === index, { onTrue: () => next, onFalse: () => old })),
  }
}

const busy = (job: JobState, now: number): boolean =>
  Option.exists(job.waveAt, waveAt => now < waveAt + Math.max(WAVE_END_MS, WAVE_MS + PING_MS))

export const seen: {
  (event: JobEvent): (state: WorkState) => WorkState
  (state: WorkState, event: JobEvent): WorkState
} = dual(2, (state: WorkState, { job, now }: JobEvent): WorkState =>
  updateJob(state, job, current => {
    if (Option.isSome(current.seenAt)) return current
    return { ...current, seenAt: Option.some(now), waveAt: Option.some(now + WAVE_DELAY_MS) }
  }),
)

export const replayed: {
  (event: JobEvent): (state: WorkState) => WorkState
  (state: WorkState, event: JobEvent): WorkState
} = dual(2, (state: WorkState, { job, now }: JobEvent): WorkState =>
  updateJob(state, job, current => {
    if (Option.isNone(current.seenAt) || busy(current, now)) return current
    return { ...current, waveAt: Option.some(now) }
  }),
)

const hoverTarget = (hovered: Option.Option<Hovered>, job: number, box: number): number => {
  const over = Option.exists(hovered, at => at.job === job && Option.contains(at.step, box))
  if (over) return 1
  return 0
}

export const step: {
  (tick: Tick): (state: WorkState) => WorkState
  (state: WorkState, tick: Tick): WorkState
} = dual(2, (state: WorkState, { now, hovered, still }: Tick): WorkState => {
  const dt = stepSince({ before: state.last, now })
  return {
    last: Option.some(now),
    jobs: Arr.map(state.jobs, (job, j) => ({
      ...job,
      hover: Arr.map(job.hover, (h, b) => {
        const to = hoverTarget(hovered, j, b)
        if (still) return to
        return approach({ from: h, to, dt, rate: HOVER_PER_S, snap: SNAP })
      }),
    })),
  }
})

export const waveOf: {
  (at: At): (job: JobState) => Option.Option<number>
  (job: JobState, at: At): Option.Option<number>
} = dual(2, (job: JobState, { now, still }: At): Option.Option<number> => {
  if (still) return Option.none()
  return Option.filter(
    Option.map(job.waveAt, waveAt => (now - waveAt) / WAVE_MS),
    t => t >= 0 && t <= 1 + WAVE_TAIL,
  )
})

export const pingOf: {
  (at: At): (job: JobState) => number
  (job: JobState, at: At): number
} = dual(2, (job: JobState, { now, still }: At): number => {
  if (still || Option.isNone(job.waveAt)) return 0
  const since = now - (job.waveAt.value + WAVE_MS)
  if (since < 0 || since > PING_MS) return 0
  return 1 - since / PING_MS
})

export const settled: {
  (tick: Tick): (state: WorkState) => boolean
  (state: WorkState, tick: Tick): boolean
} = dual(2, (state: WorkState, { now, hovered, still }: Tick): boolean =>
  Arr.every(
    state.jobs,
    (job, j) =>
      Arr.every(job.hover, (h, b) => h === hoverTarget(hovered, j, b)) &&
      (still || !busy(job, now)),
  ),
)

export const wake = (state: WorkState): WorkState => ({ ...state, last: Option.none() })
