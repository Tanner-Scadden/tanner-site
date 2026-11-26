import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { Machine } from 'effect-machine'

import { started } from '../../lib/actor.ts'
import { FIRST_SEED, TURNS, nextSeed } from '../replay.ts'
import { WorkshopEvent, WorkshopState, workshopMachine } from './Workshop.ts'

describe('Workshop', () => {
  it.effect('plays a seed a turn at a time, and replays or reseeds it', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const actor = yield* started(Machine.spawn(workshopMachine(false)))
        yield* TestClock.adjust('1 second')
        const playing = yield* actor.snapshot
        assert.deepStrictEqual(
          playing,
          WorkshopState.Playing({ seed: FIRST_SEED, turn: 2 }),
        )
        yield* TestClock.adjust(`${TURNS} seconds`)
        const over = yield* actor.snapshot
        assert.deepStrictEqual(over, WorkshopState.Over({ seed: FIRST_SEED }))
        const replayed = yield* actor.call(WorkshopEvent.Replayed)
        assert.deepStrictEqual(
          replayed.newState,
          WorkshopState.Playing({ seed: FIRST_SEED, turn: 0 }),
        )
        const reseeded = yield* actor.call(WorkshopEvent.Reseeded)
        assert.deepStrictEqual(
          reseeded.newState,
          WorkshopState.Playing({ seed: nextSeed(FIRST_SEED), turn: 0 }),
        )
      }),
    ),
  )

  it('with reduced motion every run starts at its end', () => {
    assert.deepStrictEqual(
      workshopMachine(true).initial,
      WorkshopState.Over({ seed: FIRST_SEED }),
    )
  })
})
