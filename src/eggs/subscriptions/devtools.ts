import { Subscription } from '@effect/ui'
import { Array as Arr, Effect, Queue, Stream, String as Str } from 'effect'

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

const printHello = (): void => {
  const width = Math.max(
    ...Arr.map(HELLO_LINKS, link => link.label.length),
  )
  const lines: ReadonlyArray<Line> = [
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
  // Every line is padded to the same width, so the card is a clean block.
  const lengthOf = ({ parts }: Line) =>
    Arr.reduce(parts, 0, (n, [text]) => n + text.length)
  const cardWidth = Math.max(...Arr.map(lines, lengthOf))
  const segments = Arr.flatMap(lines, (current, i) =>
    Arr.map(current.parts, ([text, style], j) => ({
      text: `${i > 0 && j === 0 ? '\n' : ''}%c${
        j === current.parts.length - 1
          ? Str.padEnd(text.length + cardWidth - lengthOf(current), ' ')(text)
          : text
      }`,
      // Only the outer edges of a line get padding, so links line up too.
      style: `${style};padding:0 ${j === current.parts.length - 1 ? 12 : 0}px 0 ${j === 0 ? 12 : 0}px`,
    })),
  )
  // @effect-diagnostics-next-line globalConsole:off
  console.log(
    Arr.join(
      Arr.map(segments, s => s.text),
      '',
    ),
    ...Arr.map(segments, s => s.style),
  )
}

export const devtools = <Msg>(message: Msg) =>
  Subscription.make(
    'devtools',
    Stream.callback<Msg>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          Object.assign(window, {
            tanner: {
              hello: () => {
                printHello()
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
