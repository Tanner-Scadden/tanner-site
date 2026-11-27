import { Context, Effect, Layer, Schema, String as Str } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { EGG_NAMES } from '#content/eggs'
import { EGG_COUNT, EggId } from '#domain/Egg'

import { type Actor, started } from '../../lib/actor.ts'
import { TOAST_MS, ToastEvent, Toasts } from '../../toast/machines/Toast.ts'
import { saveFoundEggs } from '../storage.ts'

const Found = Schema.Array(EggId)

export const EggsState = State({
  Hunting: { found: Found },
  AllFound: { found: Found },
})
export type EggsState = typeof EggsState.Type

export const EggsEvent = Event({
  Found: { egg: EggId },
})
export type EggsEvent = typeof EggsEvent.Type

export const eggsOf = (found: ReadonlyArray<EggId>): EggsState =>
  found.length >= EGG_COUNT
    ? EggsState.AllFound({ found })
    : EggsState.Hunting({ found })

export const eggsMachine = Machine.make({
  state: EggsState,
  event: EggsEvent,
  initial: (input: { readonly found: ReadonlyArray<EggId> }) => eggsOf(input.found),
}).when(
  EggsState.Hunting,
  EggsEvent.Found,
  function isNewEgg({ state, event }) {
    return !state.found.includes(event.egg)
  },
  function foundEgg({ state, event }) {
    return Effect.gen(function* () {
      const found = [...state.found, event.egg]
      const toasts = yield* Toasts
      yield* toasts.send(
        ToastEvent.Announced({
          text: `EGG FOUND: ${Str.toUpperCase(EGG_NAMES[event.egg])} · ${found.length}/${EGG_COUNT}`,
          ms: TOAST_MS,
        }),
      )
      return eggsOf(found)
    })
  },
)

export class Eggs extends Context.Service<
  Eggs,
  Actor<EggsState, EggsEvent>
>()('tanner-site/eggs/machines/Eggs') {
  static readonly layer = (found: ReadonlyArray<EggId>) =>
    Layer.effect(
      this,
      started(
        Machine.spawn(eggsMachine, {
          input: { found },
          lifecycle: {
            durability: {
              save: ({ nextState }) => saveFoundEggs(nextState.found),
              shouldSave: (state, previous) =>
                state.found.length !== previous.found.length,
            },
          },
        }),
      ),
    )
}

export const findEgg = (egg: EggId) =>
  Eggs.use(eggs => eggs.send(EggsEvent.Found({ egg })))
