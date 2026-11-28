import { Array as Arr, Option, Order } from 'effect'

import { type Controls, FADE, HOLD } from './controls.ts'
import { clamp01 } from './kit.ts'
import type { Interaction, Point, Run, Scene } from './scene.ts'

export interface Clock {
  readonly seed: number
  readonly variant: string
  readonly run: Run
  readonly time: number
  readonly playing: boolean
  readonly seeks: number
  readonly restarts: number
  readonly interacts: number
  // In the order they happened in the run.
  readonly interactions: ReadonlyArray<Interaction>
  readonly still: boolean
}

const byTime = Order.mapInput(Order.Number, (interaction: Interaction) => interaction.time)

// Whether a run with this many interactions takes no more. The figure
// disables INTERACT then, and a press past it changes nothing.
export const isFull = (scene: Scene, count: number): boolean => count >= (scene.interact?.max ?? 0)

// The clock once the reader interacts now, aimed or not. A full run gives
// back the same clock.
export const interact = (scene: Scene, clock: Clock, aim: Option.Option<Point>, to?: Point): Clock => {
  if (isFull(scene, clock.interactions.length)) return clock
  const settle = scene.interact?.settle ?? 0
  // Past the end, it goes in at the end, and the hold waits for it. A scene
  // that plays once rests where its last interaction settled, so it goes in
  // there, after the ones before it.
  const time = scene.once === true ? clock.time : Math.min(clock.time, clock.run.end)
  const at = clock.still ? Math.max(0, time - settle) : time
  const interaction: Interaction = to === undefined ? { time: at, aim } : { time: at, aim, to }
  return { ...clock, time, interactions: Arr.sort([...clock.interactions, interaction], byTime) }
}

// The clock after the controls change. A new variant starts over, unless
// it's paused, where it keeps its place. Restart and a new variant clear
// the interactions.
export const follow = (scene: Scene, clock: Clock, controls: Controls): Clock => {
  const changed = controls.variant !== clock.variant
  const run = changed ? scene.run(controls.variant, clock.seed) : clock.run
  const kept = !changed ? clock.time : controls.playing ? 0 : clamp01(clock.time / clock.run.end) * run.end
  const time = controls.seeks !== clock.seeks ? controls.seek * run.end : kept
  const cleared = changed || controls.restarts !== clock.restarts
  // Play on a run that played once and rests at its end starts it over.
  const replay =
    scene.once === true &&
    controls.playing &&
    !clock.playing &&
    !changed &&
    controls.seeks === clock.seeks &&
    controls.interacts === clock.interacts &&
    clock.time >= doneAt(scene, clock)
  const next: Clock = {
    ...clock,
    variant: controls.variant,
    run,
    time: replay ? 0 : time,
    playing: controls.playing,
    seeks: controls.seeks,
    restarts: controls.restarts,
    interacts: controls.interacts,
    interactions: cleared ? [] : clock.interactions,
  }
  return controls.interacts > clock.interacts ? interact(scene, next, Option.none()) : next
}

// When the run has finished, with every interaction played out, so the
// hold waits for one pressed near the end.
export const doneAt = (scene: Scene, clock: Clock): number =>
  Arr.reduce(clock.interactions, clock.run.end, (latest, { time }) =>
    Math.max(latest, time + (scene.interact?.settle ?? 0)),
  )

// The clock `seconds` later. A finished run holds, fades, and the next
// seed starts afresh, unless the scene plays once: then it stops on its
// last frame.
export const tick = (scene: Scene, clock: Clock, seconds: number): Clock => {
  const time = clock.time + seconds
  if (scene.once === true) {
    const done = doneAt(scene, clock)
    return time < done ? { ...clock, time } : { ...clock, time: Math.max(clock.time, done), playing: false }
  }
  if (time <= doneAt(scene, clock) + HOLD + FADE) return { ...clock, time }
  const seed = clock.seed + 1
  return { ...clock, seed, run: scene.run(clock.variant, seed), time: 0, interactions: [] }
}

// The clock a drawing starts on.
export const startClock = (scene: Scene, controls: Controls, still: boolean): Clock => {
  const run = scene.run(controls.variant, 1)
  return {
    seed: 1,
    variant: controls.variant,
    run,
    time: still ? run.end : 0,
    playing: controls.playing && !still,
    seeks: controls.seeks,
    restarts: controls.restarts,
    interacts: controls.interacts,
    interactions: [],
    still,
  }
}

export const opacityAt = (scene: Scene, clock: Clock): number =>
  1 - clamp01((clock.time - doneAt(scene, clock) - HOLD) / FADE)
