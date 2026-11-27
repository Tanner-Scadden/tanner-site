import { Schema } from 'effect'

export const Controls = Schema.Struct({
  variant: Schema.String,
  playing: Schema.Boolean,
  // Where the slider was last moved to, 0 to 1, and how many times, so
  // moving it to the same spot twice still counts.
  seek: Schema.Finite,
  seeks: Schema.Finite,
  // How many times restart and INTERACT have been pressed. The drawing
  // keeps the interactions themselves, at the clock's time when each
  // happened.
  restarts: Schema.Finite,
  interacts: Schema.Finite,
})
export type Controls = typeof Controls.Type

// What the figure learns once the drawing starts: whether the canvas can
// be drawn on at all, and whether it's still for reduced motion.
export const Started = Schema.Struct({
  drawable: Schema.Boolean,
  still: Schema.Boolean,
})
export type Started = typeof Started.Type

// What the drawing tells the figure: that it's started, that a click on
// the drawing added an interaction, so the figure plays to show it, and
// how many interactions the run has whenever that changes, so INTERACT
// goes once it's full.
export const Report = Schema.Union([
  Schema.TaggedStruct('Started', Started.fields),
  Schema.TaggedStruct('Aimed', {}),
  Schema.TaggedStruct('Counted', { interactions: Schema.Finite }),
  Schema.TaggedStruct('Ended', {}),
])
export type Report = typeof Report.Type

export const SLIDER_STEPS = 1000
// Seconds a finished run holds, then fades, before the next one starts.
export const HOLD = 3
export const FADE = 1.2

// The drawing's code didn't load, say on a flaky connection.
export class PlayerUnavailable extends Schema.TaggedError<
  PlayerUnavailable,
  { readonly brand: unique symbol }
>()('PlayerUnavailable', { cause: Schema.Unknown }) {}
