// NOTE: what a blog animation's figure and its drawing say to each other.
// Kept apart from play.ts, which brings in WebGPU and loads with the
// drawing, so a page (or a test) can render the figure without it.

import { Schema } from 'effect'

export const Controls = Schema.Struct({
  variant: Schema.String,
  playing: Schema.Boolean,
  // Where the slider was last moved to, 0 to 1, and how many times, so
  // moving it to the same spot twice still counts.
  seek: Schema.Finite,
  seeks: Schema.Finite,
})
export type Controls = typeof Controls.Type

// What the figure learns once the drawing starts: what it draws with, or
// `none` when the canvas can't be drawn on at all.
export const Started = Schema.Struct({
  renderer: Schema.Literals(['webgpu', 'canvas', 'none']),
  still: Schema.Boolean,
})
export type Started = typeof Started.Type

export const SLIDER_STEPS = 1000
// Seconds a finished run holds, then fades, before the next one starts.
export const HOLD = 3
export const FADE = 1.2

// The drawing's code didn't load, say on a flaky connection.
export class PlayerUnavailable extends Schema.TaggedError<
  PlayerUnavailable,
  { readonly brand: unique symbol }
>()('PlayerUnavailable', { cause: Schema.Unknown }) {}
