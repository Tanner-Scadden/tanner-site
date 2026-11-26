import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { Machine } from 'effect-machine'

import { RATTLES_SAYS } from '#content/manor'

import { started } from '../../lib/actor.ts'
import { DialogueEvent, DialogueState, dialogueMachine } from './Dialogue.ts'

describe('Dialogue', () => {
  const line = RATTLES_SAYS.parlour

  it.effect('Rattles types the line out and stops', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const actor = yield* started(
          Machine.spawn(dialogueMachine({ line, reducedMotion: false })),
        )
        yield* TestClock.adjust('36 millis')
        const typing = yield* actor.snapshot
        assert.deepStrictEqual(typing, DialogueState.Typing({ shown: 4 }))
        yield* TestClock.adjust('10 seconds')
        const said = yield* actor.snapshot
        assert.strictEqual(said._tag, 'Said')
      }),
    ),
  )

  it.effect('a tick past the end says the line', () =>
    Effect.gen(function* () {
      const state = yield* Machine.replay(
        dialogueMachine({ line: 'Hi', reducedMotion: false }),
        [DialogueEvent.Ticked],
      )
      assert.deepStrictEqual(state, DialogueState.Said)
    }),
  )
})
