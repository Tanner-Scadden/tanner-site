import { Subscription } from '@effect/ui'
import { Array as Arr, Console, Effect, Queue, Stream, String as Str } from 'effect'

import { HELLO, HELLO_ART, HELLO_LINKS, HELLO_NOTE } from '#content/hello'
import { EGG_COUNT } from '#domain/Egg'

const CARD = 'background:#0f3b78;font-family:monospace'
const ART = `${CARD};color:#ffd166;font-weight:700;line-height:1.15`
const TEXT = `${CARD};color:#dcebff`
const DIM = `${CARD};color:#8fa8cc`
const GOLD = `${CARD};color:#ffd166`

interface Line {
  readonly parts: ReadonlyArray<readonly [text: string, style: string]>
}

const line = (...parts: Line['parts']): Line => ({ parts })
const blank = line(['', TEXT])

const withoutScheme = Str.replace(/^https?:\/\//, '')

const lengthOf = ({ parts }: Line) =>
  Arr.reduce(parts, 0, (n, [text]) => n + text.length)

const helloLines = (): ReadonlyArray<Line> => {
  const width = Math.max(
    ...Arr.map(HELLO_LINKS, link => link.label.length),
  )
  return [
    blank,
    ...Arr.map(HELLO_ART, art => line([art, ART])),
    blank,
    ...Arr.map(HELLO_NOTE, note => line([note, TEXT])),
    blank,
    ...Arr.map(HELLO_LINKS, link =>
      line(
        [Str.padEnd(width + 3, ' ')(link.label), DIM],
        [withoutScheme(link.href), GOLD],
      ),
    ),
    blank,
    line([
      `There are ${EGG_COUNT} eggs on this page. Hover the EGGS counter for hints.`,
      DIM,
    ]),
    blank,
  ]
}

interface Segment {
  readonly text: string
  readonly style: string
}

const lineBreak = (i: number, j: number): string => {
  if (i > 0 && j === 0) return '\n'
  return ''
}

const paddedText = (text: string, current: Line, j: number, cardWidth: number): string => {
  if (j === current.parts.length - 1) {
    return Str.padEnd(text.length + cardWidth - lengthOf(current), ' ')(text)
  }
  return text
}

const edgePadding = (isEdge: boolean): number => {
  if (isEdge) return 12
  return 0
}

const segmentsOf = (lines: ReadonlyArray<Line>): ReadonlyArray<Segment> => {
  const cardWidth = Math.max(...Arr.map(lines, lengthOf))
  return Arr.flatMap(lines, (current, i) =>
    Arr.map(current.parts, ([text, style], j) => ({
      text: `${lineBreak(i, j)}%c${paddedText(text, current, j, cardWidth)}`,
      style: `${style};padding:0 ${edgePadding(j === current.parts.length - 1)}px 0 ${edgePadding(j === 0)}px`,
    })),
  )
}

const printHello = Effect.suspend(() => {
  const segments = segmentsOf(helloLines())
  return Console.log(
    Arr.join(
      Arr.map(segments, s => s.text),
      '',
    ),
    ...Arr.map(segments, s => s.style),
  )
})

export const devtools = <Msg>(message: Msg) =>
  Subscription.make(
    'devtools',
    Stream.callback<Msg>(queue =>
      Effect.acquireRelease(
        Effect.gen(function* () {
          const context = yield* Effect.context<never>()
          Object.assign(window, {
            tanner: {
              hello: () => {
                Effect.runSyncWith(context)(printHello)
                Queue.offerUnsafe(queue, message)
                return HELLO
              },
            },
          })
        }),
        () =>
          Effect.sync(() => {
            Reflect.deleteProperty(window, 'tanner')
          }),
      ),
    ),
  )
