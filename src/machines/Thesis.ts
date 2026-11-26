import { Array as Arr, Context, Layer, Schema } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { THESES } from '../content'
import { type Actor, started } from './actor'
import { findEgg } from './Eggs'

const LAST = THESES.length - 1
const SOLVED = Arr.lastNonEmpty(THESES)

// NOTE: each click drops a few more words, down to one. One more click
// starts over.
export const ThesisState = State({
  Wordy: { line: Schema.Finite },
  Solved: {},
})
export type ThesisState = typeof ThesisState.Type

export const ThesisEvent = Event({
  Clicked: {},
})
export type ThesisEvent = typeof ThesisEvent.Type

export const thesisMachine = Machine.make({
  state: ThesisState,
  event: ThesisEvent,
  initial: ThesisState.Wordy({ line: 0 }),
})
  .on(ThesisState.Wordy, ThesisEvent.Clicked, ({ state }) =>
    state.line + 1 >= LAST
      ? ThesisState.Solved
      : ThesisState.Wordy({ line: state.line + 1 }),
  )
  .on(ThesisState.Solved, ThesisEvent.Clicked, () => ThesisState.Wordy({ line: 0 }))
  .spawn(ThesisState.Solved, () => findEgg('thesis'), { name: 'findThesisEgg' })

export const thesisText = (state: ThesisState): string =>
  ThesisState.$match(state, {
    Wordy: ({ line }) => THESES[line] ?? THESES[0],
    Solved: () => SOLVED,
  })

export class Thesis extends Context.Service<
  Thesis,
  Actor<ThesisState, ThesisEvent>
>()('tanner-site/machines/Thesis') {
  static readonly layer = Layer.effect(this, started(Machine.spawn(thesisMachine)))
}
