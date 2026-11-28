import { Schema } from 'effect'

export const Controls = Schema.Struct({
  variant: Schema.String,
  playing: Schema.Boolean,
  seek: Schema.Finite,
  seeks: Schema.Finite,
  restarts: Schema.Finite,
  interacts: Schema.Finite,
})
export type Controls = typeof Controls.Type

export const Started = Schema.Struct({
  drawable: Schema.Boolean,
  still: Schema.Boolean,
})
export type Started = typeof Started.Type

export const Report = Schema.TaggedUnion({
  Started: Started.fields,
  Aimed: {},
  Counted: { interactions: Schema.Finite },
  Ended: {},
})
export type Report = typeof Report.Type

export const SLIDER_STEPS = 1000
export const HOLD = 3
export const FADE = 1.2

export class PlayerUnavailable extends Schema.TaggedError<
  PlayerUnavailable,
  { readonly brand: unique symbol }
>()('PlayerUnavailable', { cause: Schema.Unknown }) {}
