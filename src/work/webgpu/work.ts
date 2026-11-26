// NOTE: the timing rules for the Selected Work drawing, as plain data in and
// plain data out, so when each box draws, sparks and rests is testable
// without a GPU. The renderer only draws what these return.
//
// A job draws once, the first time it scrolls into view: its three boxes
// are drafted one after another, then a spark runs along the arrows from
// PROBLEM to RESULT. Pointing at a job later sends the spark again. With
// motion reduced the boxes are simply there, and nothing travels.

import { Array as Arr } from 'effect'
import { dual } from 'effect/Function'

export const STEPS = 3
export const STAGGER_MS = 240
export const DRAW_MS = 760
// The spark leaves as the last box closes, and takes one arrow at a time.
const SPARK_LEAD_MS = 200
export const GAP_MS = 420
export const TRAVEL_MS = 360
// After the spark lands its trail fades, and the box it hit glows a moment.
export const TRAIL_TAIL = 0.4
export const PING_MS = 520
const SPARK_MS = (STEPS - 2) * GAP_MS + TRAVEL_MS + PING_MS
const HOVER_PER_S = 12
const LONGEST_STEP_S = 0.05
const SNAP = 0.002

export interface JobState {
  // When the job first came into view, or null while it hasn't.
  readonly seenAt: number | null
  // When the latest spark left, or null before the first.
  readonly sparkAt: number | null
  // 0 to 1 per box: how much the pointer's over it.
  readonly hover: ReadonlyArray<number>
}

export interface WorkState {
  readonly jobs: ReadonlyArray<JobState>
  // The previous frame's time, or null at the start of a burst.
  readonly last: number | null
}

// The box under a mouse, if any. `step` is null between boxes.
export interface Hovered {
  readonly job: number
  readonly step: number | null
}

export interface Tick {
  readonly now: number
  readonly hovered: Hovered | null
  readonly still: boolean
}

// Something that happened to one job at one moment.
export interface JobEvent {
  readonly job: number
  readonly now: number
}

// One box of one job at one moment.
export interface BoxAt {
  readonly box: number
  readonly now: number
  readonly still: boolean
}

export const initialWork = (jobs: number): WorkState => ({
  jobs: Arr.makeBy(jobs, () => ({
    seenAt: null,
    sparkAt: null,
    hover: Arr.makeBy(STEPS, () => 0),
  })),
  last: null,
})

// An update that changes nothing keeps the same state, so callers can tell
// nothing happened.
const updateJob = (
  state: WorkState,
  index: number,
  f: (job: JobState) => JobState,
): WorkState => {
  const job = state.jobs[index]
  if (job === undefined) return state
  const next = f(job)
  return next === job
    ? state
    : { ...state, jobs: Arr.map(state.jobs, (old, i) => (i === index ? next : old)) }
}

const drawnAt = (seenAt: number): number =>
  seenAt + (STEPS - 1) * STAGGER_MS + DRAW_MS

const sparking = (job: JobState, now: number): boolean =>
  job.sparkAt !== null && now < job.sparkAt + SPARK_MS

// A job came into view: it starts drawing, and sparks once it's drawn.
export const seen: {
  (event: JobEvent): (state: WorkState) => WorkState
  (state: WorkState, event: JobEvent): WorkState
} = dual(2, (state: WorkState, { job, now }: JobEvent): WorkState =>
  updateJob(state, job, current =>
    current.seenAt !== null
      ? current
      : { ...current, seenAt: now, sparkAt: drawnAt(now) - SPARK_LEAD_MS },
  ),
)

// The pointer came onto a job: a drawn job sparks again, unless one's
// already on its way.
export const entered: {
  (event: JobEvent): (state: WorkState) => WorkState
  (state: WorkState, event: JobEvent): WorkState
} = dual(2, (state: WorkState, { job, now }: JobEvent): WorkState =>
  updateJob(state, job, current =>
    current.seenAt === null ||
    now < drawnAt(current.seenAt) ||
    sparking(current, now)
      ? current
      : { ...current, sparkAt: now },
  ),
)

const hoverTarget = (hovered: Hovered | null, job: number, box: number): number =>
  hovered !== null && hovered.job === job && hovered.step === box ? 1 : 0

const ease = (from: number, to: number, dt: number): number => {
  const next = from + (to - from) * (1 - Math.exp(-HOVER_PER_S * dt))
  return Math.abs(next - to) < SNAP ? to : next
}

export const step: {
  (tick: Tick): (state: WorkState) => WorkState
  (state: WorkState, tick: Tick): WorkState
} = dual(2, (state: WorkState, { now, hovered, still }: Tick): WorkState => {
  const dt =
    state.last === null ? 0 : Math.min((now - state.last) / 1000, LONGEST_STEP_S)
  return {
    last: now,
    jobs: Arr.map(state.jobs, (job, j) => ({
      ...job,
      hover: Arr.map(job.hover, (h, b) => {
        const to = hoverTarget(hovered, j, b)
        return still ? to : ease(h, to, dt)
      }),
    })),
  }
})

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

// 0 to 1: how much of a box's outline is drawn.
export const revealOf: {
  (at: BoxAt): (job: JobState) => number
  (job: JobState, at: BoxAt): number
} = dual(2, (job: JobState, { box, now, still }: BoxAt): number => {
  if (job.seenAt === null) return 0
  if (still) return 1
  return clamp01((now - job.seenAt - box * STAGGER_MS) / DRAW_MS)
})

// How far the spark is along the arrow into `box` (1 or 2): 0 to 1 while
// it travels, a little past 1 while its trail fades, or null when it's not
// on that arrow.
export const sparkOf: {
  (at: BoxAt): (job: JobState) => number | null
  (job: JobState, at: BoxAt): number | null
} = dual(2, (job: JobState, { box, now, still }: BoxAt): number | null => {
  if (still || job.sparkAt === null) return null
  const t = (now - job.sparkAt - (box - 1) * GAP_MS) / TRAVEL_MS
  return t >= 0 && t <= 1 + TRAIL_TAIL ? t : null
})

// 0 to 1: the glow on a box the spark just reached.
export const pingOf: {
  (at: BoxAt): (job: JobState) => number
  (job: JobState, at: BoxAt): number
} = dual(2, (job: JobState, { box, now, still }: BoxAt): number => {
  if (still || job.sparkAt === null || box === 0) return 0
  const since = now - (job.sparkAt + (box - 1) * GAP_MS + TRAVEL_MS)
  return since < 0 || since > PING_MS ? 0 : 1 - since / PING_MS
})

// True once nothing would change on the next frame, so the loop can sleep.
export const settled: {
  (tick: Tick): (state: WorkState) => boolean
  (state: WorkState, tick: Tick): boolean
} = dual(2, (state: WorkState, { now, hovered, still }: Tick): boolean =>
  Arr.every(
    state.jobs,
    (job, j) =>
      Arr.every(job.hover, (h, b) => h === hoverTarget(hovered, j, b)) &&
      (still ||
        job.seenAt === null ||
        (now >= drawnAt(job.seenAt) && !sparking(job, now))),
  ),
)

// A burst of frames starts fresh, so its first dt is 0, not the rest time.
export const wake = (state: WorkState): WorkState => ({ ...state, last: null })
