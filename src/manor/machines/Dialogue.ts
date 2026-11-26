import { Effect, Schema, String as Str } from 'effect'
import { Event, Machine, State } from 'effect-machine'

const TYPE_MS = 18
const CHARS_PER_TICK = 2

// NOTE: Rattles typing out one line. With reduced motion the line is
// already said.
export const DialogueState = State({
  Typing: { shown: Schema.Finite },
  Said: {},
})
export type DialogueState = typeof DialogueState.Type

export const DialogueEvent = Event({
  Ticked: {},
})
export type DialogueEvent = typeof DialogueEvent.Type

export const dialogueMachine = ({
  line,
  reducedMotion,
}: {
  readonly line: string
  readonly reducedMotion: boolean
}) =>
  Machine.make({
    state: DialogueState,
    event: DialogueEvent,
    initial:
      reducedMotion || line.length === 0
        ? DialogueState.Said
        : DialogueState.Typing({ shown: 0 }),
  })
    .on(DialogueState.Typing, DialogueEvent.Ticked, ({ state }) =>
      state.shown + CHARS_PER_TICK >= line.length
        ? DialogueState.Said
        : DialogueState.Typing({ shown: state.shown + CHARS_PER_TICK }),
    )
    .spawn(
      DialogueState.Typing,
      ({ self }) =>
        Effect.forever(
          Effect.andThen(Effect.sleep(TYPE_MS), self.send(DialogueEvent.Ticked)),
        ),
      { name: 'typeLine' },
    )

export const shownOf = ({
  line,
  state,
}: {
  readonly line: string
  readonly state: DialogueState
}): string =>
  DialogueState.$match(state, {
    Typing: ({ shown }) => `${Str.slice(0, shown)(line)}▌`,
    Said: () => line,
  })
