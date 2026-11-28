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
  readonly glow: number
  readonly ring: number
  readonly color: Rgba
}

export interface Marks {
  readonly lines: ReadonlyArray<Line>
  readonly dots: ReadonlyArray<Dot>
}

export interface Variant {
  readonly id: string
  readonly label: string
  readonly caption: string
  readonly tone: 'hi' | 'alarm'
}

export interface Interaction {
  readonly time: number
  readonly aim: Option.Option<Point>
  readonly to?: Point
}

export interface Interact {
  readonly hint: string
  readonly settle: number
  readonly max: number
}

export interface Run {
  readonly end: number
  readonly marksAt: (
    time: number,
    width: number,
    height: number,
    pointer: Option.Option<Point>,
    interactions: ReadonlyArray<Interaction>,
    held?: Option.Option<Point>,
  ) => Marks
}

export interface Scene {
  readonly variants: Arr.NonEmptyReadonlyArray<Variant>
  readonly run: (variant: string, seed: number) => Run
  readonly maxLines: number
  readonly maxDots: number
  readonly interact?: Interact
  readonly drag?: boolean
  readonly once?: boolean
}

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
