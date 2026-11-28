import { Effect, Schema } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { FIRST_SEED, TURNS, nextSeed } from '../replay.ts'

const REPLAY_MS = 450

export const WorkshopState = State({
  Playing: { seed: Schema.Finite, turn: Schema.Finite },
  Over: { seed: Schema.Finite },
})
export type WorkshopState = typeof WorkshopState.Type

export const WorkshopEvent = Event({
  Ticked: {},
  Replayed: {},
  Reseeded: {},
})
export type WorkshopEvent = typeof WorkshopEvent.Type

export const turnOf = (state: WorkshopState): number =>
  WorkshopState.$match(state, {
    Playing: ({ turn }) => turn,
    Over: () => TURNS,
  })

export const workshopMachine = (reducedMotion: boolean) => {
  const runOf = (seed: number): WorkshopState => {
    if (reducedMotion) return WorkshopState.Over({ seed })
    return WorkshopState.Playing({ seed, turn: 0 })
  }
  return (
    Machine.make({
      state: WorkshopState,
      event: WorkshopEvent,
      initial: runOf(FIRST_SEED),
    })
      .on(WorkshopState.Playing, WorkshopEvent.Ticked, ({ state }) => {
        if (state.turn + 1 >= TURNS) return WorkshopState.Over.with(state)
        return WorkshopState.Playing.with(state, { turn: state.turn + 1 })
      })
      .reenter(
        [WorkshopState.Playing, WorkshopState.Over],
        WorkshopEvent.Replayed,
        ({ state }) => runOf(state.seed),
      )
      .reenter(
        [WorkshopState.Playing, WorkshopState.Over],
        WorkshopEvent.Reseeded,
        ({ state }) => runOf(nextSeed(state.seed)),
      )
      .spawn(
        WorkshopState.Playing,
        ({ self }) =>
          Effect.forever(
            Effect.andThen(Effect.sleep(REPLAY_MS), self.send(WorkshopEvent.Ticked)),
          ),
        { name: 'tickReplay' },
      )
  )
}
