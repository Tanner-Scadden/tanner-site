import { Effect, Schema } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { FIRST_SEED, TURNS, nextSeed } from '../replay.ts'

const REPLAY_MS = 450

// NOTE: the Workshop's replay of one seed. It plays a turn at a time and
// stops on the last one. With reduced motion every run starts at its end.
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
  state._tag === 'Playing' ? state.turn : TURNS

export const workshopMachine = (reducedMotion: boolean) => {
  const runOf = (seed: number): WorkshopState =>
    reducedMotion
      ? WorkshopState.Over({ seed })
      : WorkshopState.Playing({ seed, turn: 0 })
  return (
    Machine.make({
      state: WorkshopState,
      event: WorkshopEvent,
      initial: runOf(FIRST_SEED),
    })
      .on(WorkshopState.Playing, WorkshopEvent.Ticked, ({ state }) =>
        state.turn + 1 >= TURNS
          ? WorkshopState.Over.with(state)
          : WorkshopState.Playing.with(state, { turn: state.turn + 1 }),
      )
      // Both start a run over, so the tick restarts with it.
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
