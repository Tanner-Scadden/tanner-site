import { Array as Arr, Context, Effect, Layer, Schema, String as Str } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { Gpu, GpuEvent } from '../../blueprint/machines/Gpu.ts'
import { findEgg } from '../../eggs/machines/Eggs.ts'
import { Horde, HordeEvent } from '../../horde/machines/Horde.ts'
import { type Actor, started } from '../../lib/actor.ts'
import { Page, PageEvent } from './Page.ts'

const KONAMI = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
] as const

// NOTE: keys are kept lowercased, so caps lock still counts.
const isKonami = (keys: ReadonlyArray<string>): boolean =>
  keys.length === KONAMI.length &&
  Arr.every(keys, (key, i) => key === KONAMI[i])

const lower = (key: string): string => Str.toLowerCase(key)


// NOTE: the keyboard. It remembers the last few keys, lowercased so caps
// lock still counts, and tells the other machines what they spell.
export const KeysState = State({
  Listening: { recent: Schema.Array(Schema.String) },
})
export type KeysState = typeof KeysState.Type

export const KeysEvent = Event({
  Pressed: { key: Schema.String },
})
export type KeysEvent = typeof KeysEvent.Type

export const keysMachine = Machine.make({
  state: KeysState,
  event: KeysEvent,
  initial: KeysState.Listening({ recent: [] }),
}).on(KeysState.Listening, KeysEvent.Pressed, function pressedKey({ state, event }) {
  return Effect.gen(function* () {
    const recent = Arr.takeRight([...state.recent, lower(event.key)], KONAMI.length)
    if (isKonami(recent)) {
      yield* findEgg('konami')
      yield* Horde.use(horde => horde.send(HordeEvent.Summoned))
    } else if (event.key === 'Escape') {
      // Escape puts the pens down first, and only then leaves the page.
      const gpu = yield* Gpu.use(gpu => gpu.call(GpuEvent.Escaped))
      if (!gpu.transitioned) yield* Page.use(page => page.send(PageEvent.Escaped))
    } else if (Arr.join(Arr.takeRight(recent, 4), '') === 'rest') {
      yield* Page.use(page => page.send(PageEvent.TypedRest))
    }
    return KeysState.Listening({ recent })
  })
})

export class Keys extends Context.Service<
  Keys,
  Actor<KeysState, KeysEvent>
>()('tanner-site/site/machines/Keys') {
  static readonly layer = Layer.effect(this, started(Machine.spawn(keysMachine)))
}
