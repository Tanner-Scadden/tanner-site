// NOTE: what a blog animation is made of. A scene draws with lines, dots and
// rings, in CSS px, and the kit paints them with WebGPU, or a 2D canvas when
// there's no WebGPU. A scene never touches the canvas, the clock or the
// controls. It only answers "what's on screen at this moment?", so any
// moment can be scrubbed to, and the same answer paints on either renderer.

import type { Array as Arr, Option } from 'effect'

export type Rgba = readonly [number, number, number, number]
export type Point = readonly [number, number]

export interface Line {
  readonly from: Point
  readonly to: Point
  readonly width: number
  readonly color: Rgba
}

export interface Dot {
  readonly x: number
  readonly y: number
  readonly radius: number
  // A soft halo this far past the radius, or 0.
  readonly glow: number
  // A ring this thick at `radius`, or 0 for a filled dot.
  readonly ring: number
  readonly color: Rgba
}

// Lines draw first, then dots in order, so later dots sit on top.
export interface Shapes {
  readonly lines: ReadonlyArray<Line>
  readonly dots: ReadonlyArray<Dot>
}

// One version of the scene a reader can switch to, and what the caption
// says while it's showing.
export interface Variant {
  readonly id: string
  readonly label: string
  readonly caption: string
  // The controls' accent while it's showing: the gold, or red for harm.
  readonly tone: 'hi' | 'alarm'
}

// One run of a variant, from a seed.
export interface Run {
  // Seconds until everything has happened. The slider spans this.
  readonly end: number
  // What's on screen at `time`, in a canvas this big, with the reader's
  // pointer here if it's over the canvas.
  readonly shapesAt: (time: number, width: number, height: number, pointer: Option.Option<Point>) => Shapes
}

export interface Scene {
  // The first is where it starts.
  readonly variants: Arr.NonEmptyReadonlyArray<Variant>
  readonly run: (variant: string, seed: number) => Run
  // The most of each a frame can hold, so the GPU buffers are sized once.
  readonly maxLines: number
  readonly maxDots: number
}
