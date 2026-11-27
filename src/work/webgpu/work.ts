import { Array as Arr } from 'effect'
import { dual } from 'effect/Function'

export const STEPS = 3
// A beat after the job lands on screen, so the eye gets there first.
export const WAVE_DELAY_MS = 220
// How long the wave's front takes from PROBLEM to the far side of RESULT.
// It runs at one speed the whole way, so how far it gets is a fraction of
// the job's path.
export const WAVE_MS = 1500
// The front stops at the end, and the rest of the wave runs out behind it
// for this much more of the path.
export const WAVE_TAIL = 0.15
export const PING_MS = 600
const WAVE_END_MS = WAVE_MS * (1 + WAVE_TAIL)
const HOVER_PER_S = 12
const LONGEST_STEP_S = 0.05
const SNAP = 0.002

export interface JobState {
  // When the job first came into view, or null while it hasn't.
  readonly seenAt: number | null
  // When the latest wave left, or null before the first.
  readonly waveAt: number | null
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

// One job at one moment.
export interface At {
  readonly now: number
  readonly still: boolean
}

export const initialWork = (jobs: number): WorkState => ({
  jobs: Arr.makeBy(jobs, () => ({
    seenAt: null,
    waveAt: null,
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

// The wave is on its way, or the RESULT box is still glowing from it.
const busy = (job: JobState, now: number): boolean =>
  job.waveAt !== null && now < job.waveAt + Math.max(WAVE_END_MS, WAVE_MS + PING_MS)

// A job came into view: a wave leaves once, a beat later.
export const seen: {
  (event: JobEvent): (state: WorkState) => WorkState
  (state: WorkState, event: JobEvent): WorkState
} = dual(2, (state: WorkState, { job, now }: JobEvent): WorkState =>
  updateJob(state, job, current =>
    current.seenAt !== null
      ? current
      : { ...current, seenAt: now, waveAt: now + WAVE_DELAY_MS },
  ),
)

// The pointer came onto a job, or a finger tapped it: a seen job sends
// another wave, unless one's already going through.
export const replayed: {
  (event: JobEvent): (state: WorkState) => WorkState
  (state: WorkState, event: JobEvent): WorkState
} = dual(2, (state: WorkState, { job, now }: JobEvent): WorkState =>
  updateJob(state, job, current =>
    current.seenAt === null || busy(current, now) ? current : { ...current, waveAt: now },
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

// How far the wave's front is along the job's whole path: 0 to 1 while it
// travels, up to 1 + WAVE_TAIL while the rest of it runs out, or null when
// there's no wave.
export const waveOf: {
  (at: At): (job: JobState) => number | null
  (job: JobState, at: At): number | null
} = dual(2, (job: JobState, { now, still }: At): number | null => {
  if (still || job.waveAt === null) return null
  const t = (now - job.waveAt) / WAVE_MS
  return t >= 0 && t <= 1 + WAVE_TAIL ? t : null
})

// 0 to 1: the glow on RESULT once the wave closes round it.
export const pingOf: {
  (at: At): (job: JobState) => number
  (job: JobState, at: At): number
} = dual(2, (job: JobState, { now, still }: At): number => {
  if (still || job.waveAt === null) return 0
  const since = now - (job.waveAt + WAVE_MS)
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
      (still || !busy(job, now)),
  ),
)

// A burst of frames starts fresh, so its first dt is 0, not the rest time.
export const wake = (state: WorkState): WorkState => ({ ...state, last: null })
