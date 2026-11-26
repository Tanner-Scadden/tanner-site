import { Context, Layer, Schema } from 'effect'
import { Event, Machine, State } from 'effect-machine'

import { type Actor, started } from '../../lib/actor.ts'

export const TOAST_MS = 2600
export const MUNCHED_MS = 900

export const ToastState = State({
  // The last text shown outlives its toast, so the dock on a hidden page can
  // shrink it away smoothly instead of dropping it at once.
  Hidden: { last: Schema.String },
  Showing: { text: Schema.String, ms: Schema.Finite },
})
export type ToastState = typeof ToastState.Type

export const ToastEvent = Event({
  Announced: { text: Schema.String, ms: Schema.Finite },
  Expired: {},
})
export type ToastEvent = typeof ToastEvent.Type

// NOTE: a new announcement replaces the one showing and restarts its timer,
// so it reenters Showing instead of staying in it.
export const toastMachine = Machine.make({
  state: ToastState,
  event: ToastEvent,
  initial: ToastState.Hidden({ last: '' }),
})
  .reenter(
    [ToastState.Hidden, ToastState.Showing],
    ToastEvent.Announced,
    ({ event }) => ToastState.Showing({ text: event.text, ms: event.ms }),
  )
  .timeout(ToastState.Showing, {
    duration: state => state.ms,
    event: ToastEvent.Expired,
  })
  .on(ToastState.Showing, ToastEvent.Expired, ({ state }) =>
    ToastState.Hidden({ last: state.text }),
  )

export class Toasts extends Context.Service<
  Toasts,
  Actor<ToastState, ToastEvent>
>()('tanner-site/toast/machines/Toast/Toasts') {
  static readonly layer = Layer.effect(this, started(Machine.spawn(toastMachine)))
}
