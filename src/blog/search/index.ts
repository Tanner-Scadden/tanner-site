import { Array as Arr, Option } from 'effect'
import { dual } from 'effect/Function'

import type { Doc as DocSchema } from './schema.ts'
import { type Token, bare, tokenize } from './tokenize.ts'

export type FieldId = 0 | 1 | 2

const FIELD_IDS = [0, 1, 2] as const satisfies ReadonlyArray<FieldId>

export type Doc = typeof DocSchema.Type

export interface Field {
  readonly text: string
  readonly tokens: ReadonlyArray<Token>
}

export interface IndexedDoc {
  readonly id: string
  readonly date: string
  readonly fields: readonly [Field, Field, Field]
}

export interface Posting {
  readonly doc: number
  readonly field: FieldId
  readonly positions: ReadonlyArray<number>
}

export interface SearchIndex {
  readonly docs: ReadonlyArray<IndexedDoc>
  readonly postings: ReadonlyMap<string, ReadonlyArray<Posting>>
  readonly docCount: ReadonlyMap<string, number>
  readonly vocabulary: ReadonlyArray<readonly [string, ReadonlyArray<string>]>
  readonly averageLength: readonly [number, number, number]
}

const append = <K, V>(map: Map<K, Array<V>>, key: K, value: V): void => {
  const list = Option.fromNullishOr(map.get(key))
  if (Option.isSome(list)) list.value.push(value)
  else map.set(key, [value])
}

const include = <K, V>(map: Map<K, Set<V>>, key: K, value: V): void => {
  const set = Option.fromNullishOr(map.get(key))
  if (Option.isSome(set)) set.value.add(value)
  else map.set(key, new Set([value]))
}

export const build = (docs: ReadonlyArray<Doc>): SearchIndex => {
  const postings = new Map<string, Array<Posting>>()
  const docCount = new Map<string, number>()
  const surfaces = new Map<string, Set<string>>()
  const totals: [number, number, number] = [0, 0, 0]

  const indexed = Arr.map(docs, (doc, d): IndexedDoc => {
    const field = (text: string): Field => ({ text, tokens: tokenize(text) })
    const fields = [field(doc.title), field(doc.summary), field(doc.body)] as const
    const seen = new Set<string>()
    for (const f of FIELD_IDS) {
      const field = fields[f]
      totals[f] = totals[f] + field.tokens.length
      const positions = new Map<string, Array<number>>()
      for (const token of field.tokens) {
        append(positions, token.term, token.position)
        include(surfaces, bare(token.surface), token.term)
      }
      positions.forEach((at, term) => {
        append(postings, term, { doc: d, field: f, positions: at })
        seen.add(term)
      })
    }
    seen.forEach(term => docCount.set(term, (docCount.get(term) ?? 0) + 1))
    return { id: doc.id, date: doc.date, fields }
  })

  const n = Math.max(docs.length, 1)
  return {
    docs: indexed,
    postings,
    docCount,
    vocabulary: Arr.map(Array.from(surfaces), ([surface, terms]) => [surface, Array.from(terms)] as const),
    averageLength: [Math.max(totals[0] / n, 1), Math.max(totals[1] / n, 1), Math.max(totals[2] / n, 1)],
  }
}

export const postingsOf: {
  (term: string): (index: SearchIndex) => ReadonlyArray<Posting>
  (index: SearchIndex, term: string): ReadonlyArray<Posting>
} = dual(2, (index: SearchIndex, term: string): ReadonlyArray<Posting> => index.postings.get(term) ?? [])
