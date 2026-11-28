import { Array as Arr, Option, Predicate, String as Str } from 'effect'
import { dual } from 'effect/Function'

import type { Field, FieldId, SearchIndex } from './index.ts'
import type { Part as PartSchema, Snippet as SnippetSchema } from './schema.ts'
import type { Hit, Result } from './search.ts'
import type { Token } from './tokenize.ts'

export type Part = typeof PartSchema.Type
export type Snippet = typeof SnippetSchema.Type

const WINDOW = 26
const LEAD = 5

const OPEN = '… '
const CLOSE = ' …'

const startOf = (tokens: ReadonlyArray<Token>, from: number): number => {
  if (from === 0) return 0
  return tokens[from]!.start
}

const endAfterGap = (field: Field, last: Token, next: Token): number => {
  if (next.position <= last.position + 1) return last.end
  const lineEnd = Option.getOrElse(Str.indexOf('\n')(Str.slice(last.end)(field.text)), () => Infinity)
  return Math.min(last.end + lineEnd, field.text.length)
}

const endOf = (field: Field, to: number): number =>
  Option.match(Option.fromNullishOr(field.tokens[to + 1]), {
    onNone: () => field.text.length,
    onSome: next => endAfterGap(field, field.tokens[to]!, next),
  })

export const mark: {
  (positions: ReadonlySet<number>, range?: readonly [number, number]): (field: Field) => ReadonlyArray<Part>
  (field: Field, positions: ReadonlySet<number>, range?: readonly [number, number]): ReadonlyArray<Part>
} = dual(
  (args: IArguments) => Predicate.hasProperty(args[0], 'tokens'),
  (field: Field, positions: ReadonlySet<number>, range?: readonly [number, number]): ReadonlyArray<Part> => {
    const tokens = field.tokens
    if (tokens.length === 0) return [{ text: field.text, marked: false }]
    const [from, to] = range ?? [0, tokens.length - 1]
    const startAt = startOf(tokens, from)
    const endAt = endOf(field, to)
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
    return Arr.map(parts, part => ({ ...part, text: Str.replace(/\s*\n\s*/g, ' ')(part.text) }))
  },
)

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
  readonly whole: readonly [boolean, boolean]
}

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

const ellipsis = (whole: boolean, text: string): ReadonlyArray<Part> => {
  if (whole) return []
  return [{ text, marked: false }]
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
          ...ellipsis(whole[0], OPEN),
          ...mark(body, inBody, [from, to]),
          ...ellipsis(whole[1], CLOSE),
        ],
      })
    }
    const inSummary = positionsIn(result.hits, 1)
    if (inSummary.size === 0) return Option.none()
    return Option.some({ field: 'summary' as const, parts: mark(fields[1], inSummary) })
  })
})
