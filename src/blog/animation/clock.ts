import { Array as Arr, Boolean as Bool, Option, Order } from 'effect'

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
  readonly interactions: ReadonlyArray<Interaction>
  readonly still: boolean
}

const byTime = Order.mapInput(Order.Number, (interaction: Interaction) => interaction.time)

export const isFull = (scene: Scene, count: number): boolean => count >= (scene.interact?.max ?? 0)

const interactionTime = (scene: Scene, clock: Clock, time: number): number => {
  if (clock.still) return Math.max(0, time - (scene.interact?.settle ?? 0))
  return time
}

const interactionAt = (time: number, aim: Option.Option<Point>, to: Option.Option<Point>): Interaction =>
  Option.match(to, {
    onNone: () => ({ time, aim }),
    onSome: point => ({ time, aim, to: point }),
  })

export const interact = (scene: Scene, clock: Clock, aim: Option.Option<Point>, to?: Point): Clock => {
  if (isFull(scene, clock.interactions.length)) return clock
  const time = Bool.match(scene.once === true, {
    onTrue: () => clock.time,
    onFalse: () => Math.min(clock.time, clock.run.end),
  })
  const interaction = interactionAt(interactionTime(scene, clock, time), aim, Option.fromNullishOr(to))
  return { ...clock, time, interactions: Arr.sort([...clock.interactions, interaction], byTime) }
}

const keptTime = (clock: Clock, controls: Controls, run: Run, changed: boolean): number => {
  if (!changed) return clock.time
  if (controls.playing) return 0
  return clamp01(clock.time / clock.run.end) * run.end
}

const followedTime = (clock: Clock, controls: Controls, run: Run, changed: boolean): number => {
  if (controls.seeks !== clock.seeks) return controls.seek * run.end
  return keptTime(clock, controls, run, changed)
}

const isReplay = (scene: Scene, clock: Clock, controls: Controls, changed: boolean): boolean =>
  scene.once === true &&
  controls.playing &&
  !clock.playing &&
  !changed &&
  controls.seeks === clock.seeks &&
  controls.interacts === clock.interacts &&
  clock.time >= doneAt(scene, clock)

export const follow = (scene: Scene, clock: Clock, controls: Controls): Clock => {
  const changed = controls.variant !== clock.variant
  const run = Bool.match(changed, {
    onTrue: () => scene.run(controls.variant, clock.seed),
    onFalse: () => clock.run,
  })
  const time = Bool.match(isReplay(scene, clock, controls, changed), {
    onTrue: () => 0,
    onFalse: () => followedTime(clock, controls, run, changed),
  })
  const cleared = changed || controls.restarts !== clock.restarts
  const next: Clock = {
    ...clock,
    variant: controls.variant,
    run,
    time,
    playing: controls.playing,
    seeks: controls.seeks,
    restarts: controls.restarts,
    interacts: controls.interacts,
    interactions: Bool.match(cleared, { onTrue: () => [], onFalse: () => clock.interactions }),
  }
  if (controls.interacts > clock.interacts) return interact(scene, next, Option.none())
  return next
}

export const doneAt = (scene: Scene, clock: Clock): number =>
  Arr.reduce(clock.interactions, clock.run.end, (latest, { time }) =>
    Math.max(latest, time + (scene.interact?.settle ?? 0)),
  )

export const tick = (scene: Scene, clock: Clock, seconds: number): Clock => {
  const time = clock.time + seconds
  if (scene.once === true) {
    const done = doneAt(scene, clock)
    if (time < done) return { ...clock, time }
    return { ...clock, time: Math.max(clock.time, done), playing: false }
  }
  if (time <= doneAt(scene, clock) + HOLD + FADE) return { ...clock, time }
  const seed = clock.seed + 1
  return { ...clock, seed, run: scene.run(clock.variant, seed), time: 0, interactions: [] }
}

export const startClock = (scene: Scene, controls: Controls, still: boolean): Clock => {
  const run = scene.run(controls.variant, 1)
  return {
    seed: 1,
    variant: controls.variant,
    run,
    time: Bool.match(still, { onTrue: () => run.end, onFalse: () => 0 }),
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
