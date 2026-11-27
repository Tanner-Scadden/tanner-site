import { Array as Arr, Option, String as Str } from 'effect'
import { dual } from 'effect/Function'

import type { Field, FieldId, SearchIndex } from './index.ts'
import type { Token } from './tokenize.ts'
import type { Hit, Result } from './search.ts'

// NOTE: the snippet under a result: the stretch of the body with the most
// matched words in it, cut at word boundaries, with those words marked. A
// post that matches only in its summary gets its summary back, marked
// instead; one that matches only in its title gets no snippet.

export interface Part {
  readonly text: string
  readonly marked: boolean
}

export interface Snippet {
  readonly field: 'summary' | 'body'
  readonly parts: ReadonlyArray<Part>
}

// How many words a snippet shows, and how many lead into the first match.
export const WINDOW = 26
const LEAD = 5

const OPEN = '… '
const CLOSE = ' …'

// The words of a field at these positions, split out of its text, from
// token `from` to token `to`. A range that ends a block runs on to the end
// of its line, so its last full stop comes too.
export const mark: {
  (positions: ReadonlySet<number>, range?: readonly [number, number]): (field: Field) => ReadonlyArray<Part>
  (field: Field, positions: ReadonlySet<number>, range?: readonly [number, number]): ReadonlyArray<Part>
} = dual(
  (args: IArguments) => typeof args[0] === 'object' && 'tokens' in args[0],
  (field: Field, positions: ReadonlySet<number>, range?: readonly [number, number]): ReadonlyArray<Part> => {
    const tokens = field.tokens
    if (tokens.length === 0) return [{ text: field.text, marked: false }]
    const [from, to] = range ?? [0, tokens.length - 1]
    const startAt = from === 0 ? 0 : tokens[from]!.start
    const next = tokens[to + 1]
    const lineEnd = Option.getOrElse(Str.indexOf('\n')(Str.slice(tokens[to]!.end)(field.text)), () => Infinity)
    const endAt =
      next === undefined
        ? field.text.length
        : next.position > tokens[to]!.position + 1
          ? Math.min(tokens[to]!.end + lineEnd, field.text.length)
          : tokens[to]!.end
    const parts: Array<Part> = []
    let cursor = startAt
    for (let i = from; i <= to; i++) {
      const token = tokens[i]!
      if (!positions.has(token.position)) continue
      if (token.start > cursor) parts.push({ text: Str.slice(cursor, token.start)(field.text), marked: false })
      parts.push({ text: Str.slice(token.start, token.end)(field.text), marked: true })
      cursor = token.end
    }
    if (endAt > cursor) parts.push({ text: Str.slice(cursor, endAt)(field.text), marked: false })
    // A snippet reads as one line.
    return Arr.map(parts, part => ({ ...part, text: Str.replace(/\s*\n\s*/g, ' ')(part.text) }))
  },
)

// The first and last token of the block (paragraph, heading, list item)
// that token `i` is in. A line break skips a position, so a block is a run
// of consecutive positions.
const blockOf = (tokens: ReadonlyArray<Token>, i: number): readonly [number, number] => {
  let start = i
  while (start > 0 && tokens[start - 1]!.position === tokens[start]!.position - 1) start--
  let end = i
  while (end < tokens.length - 1 && tokens[end + 1]!.position === tokens[end]!.position + 1) end++
  return [start, end]
}

interface Window {
  readonly from: number
  readonly to: number
  // Whether the window starts at its block's start, and ends at its end.
  readonly whole: readonly [boolean, boolean]
}

// The window of up to `WINDOW` words, inside one block, with the most
// distinct matched words, then the most matches. It starts a few words
// before its first match, or at the start of the block.
const bestWindow = (field: Field, positions: ReadonlySet<number>): Window => {
  const tokens = field.tokens
  const matched = Arr.filter(Arr.range(0, tokens.length - 1), i => positions.has(tokens[i]!.position))
  let best: Window = { from: 0, to: Math.min(WINDOW, tokens.length) - 1, whole: [true, false] }
  let bestScore = -1
  for (const i of matched) {
    const [start, end] = blockOf(tokens, i)
    const from = Math.max(start, i - LEAD)
    const to = Math.min(end, from + WINDOW - 1)
    const inside = Arr.filter(matched, j => j >= from && j <= to)
    const distinct = new Set(Arr.map(inside, j => tokens[j]!.term)).size
    const score = distinct * 100 + inside.length
    if (score > bestScore) {
      bestScore = score
      best = { from, to, whole: [from === start, to === end] }
    }
  }
  return best
}

const positionsIn = (hits: ReadonlyArray<Hit>, field: FieldId): ReadonlySet<number> =>
  new Set(Arr.map(Arr.filter(hits, hit => hit.field === field), hit => hit.position))

export const snippetOf: {
  (result: Result): (index: SearchIndex) => Option.Option<Snippet>
  (index: SearchIndex, result: Result): Option.Option<Snippet>
} = dual(2, (index: SearchIndex, result: Result): Option.Option<Snippet> => {
  const doc = Arr.findFirst(index.docs, d => d.id === result.id)
  return Option.flatMap(doc, ({ fields }) => {
    const inBody = positionsIn(result.hits, 2)
    if (inBody.size > 0) {
      const body = fields[2]
      const { from, to, whole } = bestWindow(body, inBody)
      return Option.some({
        field: 'body' as const,
        parts: [
          ...(whole[0] ? [] : [{ text: OPEN, marked: false }]),
          ...mark(body, inBody, [from, to]),
          ...(whole[1] ? [] : [{ text: CLOSE, marked: false }]),
        ],
      })
    }
    const inSummary = positionsIn(result.hits, 1)
    return inSummary.size > 0 ? Option.some({ field: 'summary' as const, parts: mark(fields[1], inSummary) }) : Option.none()
  })
})
