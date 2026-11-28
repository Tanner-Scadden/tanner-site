import { type Array as Arr, MutableRef, Option } from 'effect'

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
// says while it's showing. An empty caption leaves the figure without one.
export interface Variant {
  readonly id: string
  readonly label: string
  readonly caption: string
  // The controls' accent while it's showing: the gold, or red for harm.
  readonly tone: 'hi' | 'alarm'
}

// A reader pressed INTERACT at this moment of the run. `aim` is where they
// clicked the drawing, as a fraction of its width and height, or none when
// they pressed the button. The canvas is always 16:9, so a fraction lands
// on the same spot at any size.
export interface Interaction {
  readonly time: number
  readonly aim: Option.Option<Point>
  // Where they let go, as a fraction like `aim`, when they pressed on the
  // drawing and dragged before letting go. Only scenes that take drags see
  // one.
  readonly to?: Point
}

// A scene that takes interactions. The button always says INTERACT; what it
// does is up to the scene.
export interface Interact {
  // What a press does, for the button's tooltip and screen readers, such as
  // "Plant another seed".
  readonly hint: string
  // Seconds until an interaction has played out. Under reduced motion the
  // figure stays on its last frame, so an interaction goes in this long
  // before it, and the still frame shows it done.
  readonly settle: number
  // The most a run takes, so the GPU buffers still hold. Presses past it
  // are ignored.
  readonly max: number
}

// One run of a variant, from a seed.
export interface Run {
  // Seconds until everything has happened. The slider spans this.
  readonly end: number
  // What's on screen at `time`, in a canvas this big, with the reader's
  // pointer here if it's over the canvas, and every interaction so far in
  // the order they happened. Only interactions up to `time` show, so
  // scrubbing back before one shows the world without it.
  //
  // The kit passes the same array until it changes, so work out what they
  // do once per array with `rememberLast`, and keep each frame cheap.
  //
  // In a scene that takes drags, `held` is where the reader pressed, in CSS
  // px, for as long as they hold, so the scene can show what they've
  // grabbed following the pointer.
  readonly shapesAt: (
    time: number,
    width: number,
    height: number,
    pointer: Option.Option<Point>,
    interactions: ReadonlyArray<Interaction>,
    held?: Option.Option<Point>,
  ) => Shapes
}

export interface Scene {
  // The first is where it starts.
  readonly variants: Arr.NonEmptyReadonlyArray<Variant>
  readonly run: (variant: string, seed: number) => Run
  // The most of each a frame can hold, so the GPU buffers are sized once.
  readonly maxLines: number
  readonly maxDots: number
  // Readers can add to it with the INTERACT button. The run's frames have
  // to stay inside the buffers with `interact.max` interactions in them.
  readonly interact?: Interact
  // Readers can also press on the drawing and drag. Letting go far enough
  // from where they pressed adds an interaction with a `to`; a short press
  // is a click, as usual.
  readonly drag?: boolean
  // Plays once and rests on its last frame, rather than fading into a new
  // run. Play from there replays it from the start.
  readonly once?: boolean
}

// `f`, remembering its last answer, so passing the same input again (by
// reference) doesn't work it out again.
export const rememberLast = <A, B>(f: (a: A) => B): ((a: A) => B) => {
  const last = MutableRef.make(Option.none<{ readonly input: A; readonly output: B }>())
  return input =>
    Option.match(Option.filter(MutableRef.get(last), memo => memo.input === input), {
      onSome: memo => memo.output,
      onNone: () => {
        const output = f(input)
        MutableRef.set(last, Option.some({ input, output }))
        return output
      },
    })
}
