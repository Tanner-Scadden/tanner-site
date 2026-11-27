import { Effect } from 'effect'
import { type ActorRef, Machine } from 'effect-machine'

export const started = <
  S extends { readonly _tag: string },
  E extends { readonly _tag: string },
  O,
  R,
>(
  spawn: Effect.Effect<ActorRef<S, E, O>, never, R>,
) => Machine.scoped(Effect.tap(spawn, actor => actor.start))

// The actors here never reach a final state, so they have no output.
export type Actor<S extends { readonly _tag: string }, E extends { readonly _tag: string }> =
  ActorRef<S, E, never>
