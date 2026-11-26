import { Array as Arr, Context, Effect, Layer, Schema, Stream } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { type Actor, started } from '../../lib/actor.ts'
import { MUNCHED_MS, ToastEvent, Toasts } from '../../toast/machines/Toast.ts'
import { Viewport } from '../services/Viewport.ts'

const HORDE_SIZE = 6
const ZOMBIE_GAP = 90
const ZOMBIE_WIDTH = 56
const FRAME_MS = 1000 / 60
const LONGEST_FRAME_MS = 100

export const Zombie = Schema.Struct({
  id: Schema.Finite,
  x: Schema.Finite,
  speed: Schema.Finite,
})
export type Zombie = typeof Zombie.Type

// NOTE: the Konami horde. It measures the window, walks in from the right,
// and is gone once every zombie is munched or off the left edge.
export const HordeState = State({
  Gone: {},
  Arriving: {},
  Marching: { zombies: Schema.Array(Zombie) },
})
export type HordeState = typeof HordeState.Type

export const HordeEvent = Event({
  Summoned: {},
  Measured: { width: Schema.Finite },
  Ticked: { delta: Schema.Finite },
  Munched: { id: Schema.Finite },
})
export type HordeEvent = typeof HordeEvent.Type

const hordeAt = (width: number): ReadonlyArray<Zombie> =>
  Arr.makeBy(HORDE_SIZE, n => ({
    id: n,
    x: width + n * ZOMBIE_GAP,
    // A spread of speeds without randomness, so the horde shuffles a
    // little out of step and every run looks the same.
    speed: 0.6 + ((n * 37) % 10) / 25,
  }))

const walk = (zombies: ReadonlyArray<Zombie>, delta: number) => {
  const step = Math.min(delta, LONGEST_FRAME_MS) / FRAME_MS
  return Arr.filter(
    Arr.map(zombies, z => ({ ...z, x: z.x - z.speed * step })),
    z => z.x > -ZOMBIE_WIDTH,
  )
}

export const hordeMachine = Machine.make({
  state: HordeState,
  event: HordeEvent,
  initial: HordeState.Gone,
})
  // The code again while a horde is out sends a fresh one.
  .on(
    [HordeState.Gone, HordeState.Marching],
    HordeEvent.Summoned,
    () => HordeState.Arriving,
  )
  .task(HordeState.Arriving, () => Viewport.use(viewport => viewport.width), {
    name: 'measureViewport',
    onSuccess: width => HordeEvent.Measured({ width }),
  })
  .on(HordeState.Arriving, HordeEvent.Measured, ({ event }) =>
    HordeState.Marching({ zombies: hordeAt(event.width) }),
  )
  .spawn(
    HordeState.Marching,
    ({ self }) =>
      Viewport.use(viewport =>
        Stream.runForEach(viewport.frames, delta =>
          self.send(HordeEvent.Ticked({ delta })),
        ),
      ),
    { name: 'walkEachFrame' },
  )
  .on(HordeState.Marching, HordeEvent.Ticked, ({ state, event }) =>
    HordeState.Marching({ zombies: walk(state.zombies, event.delta) }),
  )
  .on(HordeState.Marching, HordeEvent.Munched, function munch({ state, event }) {
    return Effect.gen(function* () {
      const toasts = yield* Toasts
      yield* toasts.send(ToastEvent.Announced({ text: 'MUNCHED!', ms: MUNCHED_MS }))
      return HordeState.Marching({
        zombies: Arr.filter(state.zombies, z => z.id !== event.id),
      })
    })
  })
  .immediateWhen(
    HordeState.Marching,
    function isEmpty({ state }) {
      return state.zombies.length === 0
    },
    () => HordeState.Gone,
  )

export const zombiesOf = (state: HordeState): ReadonlyArray<Zombie> =>
  state._tag === 'Marching' ? state.zombies : []

export class Horde extends Context.Service<
  Horde,
  Actor<HordeState, HordeEvent>
>()('tanner-site/horde/machines/Horde') {
  static readonly layer = Layer.effect(this, started(Machine.spawn(hordeMachine)))
}
