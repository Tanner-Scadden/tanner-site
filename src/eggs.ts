import { Command, Component, Subscription } from '@effect/ui'
import {
  Array as Arr,
  Effect,
  Option,
  Queue,
  Schema,
  Stream,
  String as Str,
  pipe,
} from 'effect'

import {
  HELLO,
  HELLO_ART,
  HELLO_LINKS,
  HELLO_NOTE,
} from './content'

export const EggId = Schema.Literals([
  'manor',
  'worlds',
  'thesis',
  'konami',
  'console',
  'print',
  'gpu',
])
export type EggId = typeof EggId.Type

export const EGG_NAMES: Record<EggId, string> = {
  manor: 'The Manor',
  worlds: 'Playing days',
  thesis: 'Simplified',
  konami: 'The horde',
  console: 'Devtools',
  print: 'Paper copy',
  gpu: 'Drafting pens',
}

// NOTE: hover hints for the EGGS counter, like a quest log. Each one points
// at where to look without giving the egg away.
export const EGG_HINTS: Record<EggId, string> = {
  manor: 'Every blueprint has a door. Check the bottom corner.',
  worlds: 'Read about my life outside work. One phrase leads somewhere.',
  thesis: 'The big line up top could be simpler. Give it a click.',
  konami: 'Old games had a secret code. It starts ↑ ↑ ↓ ↓.',
  console: 'Developers, open your tools. Someone left a note.',
  print: 'Some things only show up on paper.',
  gpu: 'Look at what this site is built with. One of them can draw.',
}

export const EGG_COUNT = EggId.literals.length

const STORAGE_KEY = 'eggs'

class EggStorageError extends Schema.TaggedError<
  EggStorageError,
  { readonly brand: unique symbol }
>()('EggStorageError', {
  reason: Schema.String,
}) {}

const toStorageError = (error: unknown): EggStorageError =>
  EggStorageError.make({ reason: String(error) })

const StoredEggs = Schema.fromJsonString(Schema.Array(Schema.Unknown))
const decodeStoredEggs = Schema.decodeUnknownOption(StoredEggs)
const encodeFoundEggs = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Array(EggId)),
)

const isEggId = Schema.is(EggId)

// NOTE: localStorage can be missing or throw (private windows, blocked
// site data), so a failed read is no eggs and a failed write is ignored.
export const readFoundEggs: Effect.Effect<ReadonlyArray<EggId>> = pipe(
  Effect.try({
    try: () => Option.fromNullishOr(localStorage.getItem(STORAGE_KEY)),
    catch: toStorageError,
  }),
  Effect.map(
    Option.match({
      onNone: (): ReadonlyArray<EggId> => [],
      onSome: json =>
        Option.match(decodeStoredEggs(json), {
          onNone: () => [],
          onSome: Arr.filter(isEggId),
        }),
    }),
  ),
  Effect.orElseSucceed(() => []),
)

export class SaveEggs extends Command.Service<SaveEggs>()('site/SaveEggs', {
  args: { found: Schema.Array(EggId) },
  success: Component.Noop,
}) {
  static readonly layer = this.toLayer(
    Effect.succeed(({ found }: { readonly found: ReadonlyArray<EggId> }) =>
      pipe(
        encodeFoundEggs(found),
        Effect.flatMap(json =>
          Effect.try({
            try: () => localStorage.setItem(STORAGE_KEY, json),
            catch: toStorageError,
          }),
        ),
        Effect.ignore,
        Effect.as(Component.noop),
      ),
    ),
  )
}

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

// NOTE: a little blueprint card in the console: the art, a note, the links
// and a nudge toward the other eggs. Every line is its own styled segment.
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

// NOTE: `tanner.hello()` in the console. The function exists only while the
// subscription runs, and each call is a message.
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

// NOTE: HtmlSubscription.onWindow only knows focus and blur.
export const beforePrint = <Msg>(message: Msg) =>
  Subscription.make(
    'beforeprint',
    Stream.callback<Msg>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const listener = () => Queue.offerUnsafe(queue, message)
          window.addEventListener('beforeprint', listener)
          return listener
        }),
        listener =>
          Effect.sync(() => {
            window.removeEventListener('beforeprint', listener)
          }),
      ),
    ),
  )

export const KONAMI = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
] as const

// NOTE: keys are kept lowercased, so caps lock still counts.
export const isKonami = (keys: ReadonlyArray<string>): boolean =>
  keys.length === KONAMI.length &&
  Arr.every(keys, (key, i) => key === KONAMI[i])

export const lower = (key: string): string => Str.toLowerCase(key)
