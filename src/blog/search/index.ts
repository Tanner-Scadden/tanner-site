import { Array as Arr } from 'effect'
import { dual } from 'effect/Function'

import type { Doc as DocSchema } from './schema.ts'
import { type Token, bare, tokenize } from './tokenize.ts'

// NOTE: the inverted index: each term to its postings, which say where it
// appears (doc, field, word positions). Three fields, title, summary and
// body, each with its own lengths for BM25. Prefix and typo matching run on
// the vocabulary of surface words, each pointing at the terms it was
// indexed under, so "vouc" finds "vouching" and "sentinals" finds
// "sentinels" before either is stemmed.
//
// The maps and sets here are native: building touches them once per word of
// every post, and a search once per posting, so they're the hot path.

export type FieldId = 0 | 1 | 2

// A post as the index takes it. `date` is YYYY-MM-DD: ties in score go to
// the newest.
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
  // Sorted, ascending.
  readonly positions: ReadonlyArray<number>
}

export interface SearchIndex {
  readonly docs: ReadonlyArray<IndexedDoc>
  readonly postings: ReadonlyMap<string, ReadonlyArray<Posting>>
  // How many docs each term appears in, in any field.
  readonly docCount: ReadonlyMap<string, number>
  // Each surface word, apostrophes dropped, and the terms it gives.
  readonly vocabulary: ReadonlyArray<readonly [string, ReadonlyArray<string>]>
  // The mean length of each field, in tokens.
  readonly averageLength: readonly [number, number, number]
}

export const build = (docs: ReadonlyArray<Doc>): SearchIndex => {
  const postings = new Map<string, Array<Posting>>()
  const docCount = new Map<string, number>()
  const surfaces = new Map<string, Set<string>>()
  const totals = [0, 0, 0]

  const indexed = Arr.map(docs, (doc, d): IndexedDoc => {
    const field = (text: string): Field => ({ text, tokens: tokenize(text) })
    const fields = [field(doc.title), field(doc.summary), field(doc.body)] as const
    const seen = new Set<string>()
    Arr.forEach(fields, (field, f) => {
      totals[f] = (totals[f] as number) + field.tokens.length
      const positions = new Map<string, Array<number>>()
      for (const token of field.tokens) {
        const at = positions.get(token.term)
        if (at === undefined) positions.set(token.term, [token.position])
        else at.push(token.position)
        const key = bare(token.surface)
        const terms = surfaces.get(key)
        if (terms === undefined) surfaces.set(key, new Set([token.term]))
        else terms.add(token.term)
      }
      positions.forEach((at, term) => {
        const posting: Posting = { doc: d, field: f as FieldId, positions: at }
        const list = postings.get(term)
        if (list === undefined) postings.set(term, [posting])
        else list.push(posting)
        seen.add(term)
      })
    })
    seen.forEach(term => docCount.set(term, (docCount.get(term) ?? 0) + 1))
    return { id: doc.id, date: doc.date, fields }
  })

  const n = Math.max(docs.length, 1)
  return {
    docs: indexed,
    postings,
    docCount,
    vocabulary: Arr.map(Array.from(surfaces), ([surface, terms]) => [surface, Array.from(terms)] as const),
    averageLength: [Math.max(totals[0]! / n, 1), Math.max(totals[1]! / n, 1), Math.max(totals[2]! / n, 1)],
  }
}

export const postingsOf: {
  (term: string): (index: SearchIndex) => ReadonlyArray<Posting>
  (index: SearchIndex, term: string): ReadonlyArray<Posting>
} = dual(2, (index: SearchIndex, term: string): ReadonlyArray<Posting> => index.postings.get(term) ?? [])
