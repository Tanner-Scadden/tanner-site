import { Array as Arr, MutableHashMap, Number as Num, Option, Order, String as Str } from 'effect'
import { dual } from 'effect/Function'

import { distance, editsFor } from './fuzzy.ts'
import { type FieldId, type SearchIndex, postingsOf } from './index.ts'
import { type Atom, type Query, isEmpty, parse } from './query.ts'
import { bare, termOf } from './tokenize.ts'

// NOTE: running a query against the index. Each atom resolves to the terms
// it stands for, each with a weight: 1 for the word itself, less for a
// prefix completion and less again for a typo match, so exact hits always
// rank above near ones. Scores are BM25, summed across fields with a boost
// for each: a hit in the title counts three times one in the body.

export const K1 = 1.2
export const B = 0.75
export const BOOSTS: readonly [number, number, number] = [3, 2, 1]

// What a match through a prefix or a typo is worth, next to an exact one.
export const PREFIX_WEIGHT = 0.8
export const TYPO_WEIGHTS: Readonly<Record<number, number>> = { 1: 0.5, 2: 0.3 }

// Prefix matching starts at two letters, so one doesn't match everything.
const MIN_PREFIX = 2

export interface Expansion {
  readonly term: string
  readonly weight: number
}

// A matched word in a doc: its field and word position.
export interface Hit {
  readonly field: FieldId
  readonly position: number
}

interface Match {
  readonly score: number
  readonly hits: ReadonlyArray<Hit>
}

export interface Result {
  readonly id: string
  readonly date: string
  readonly score: number
  readonly hits: ReadonlyArray<Hit>
}

const idf = (index: SearchIndex, n: number): number => {
  const N = index.docs.length
  return Math.log(1 + (N - n + 0.5) / (n + 0.5))
}

// BM25's term frequency part, for `tf` hits in a field of `length` tokens.
const saturate = (index: SearchIndex, field: FieldId, tf: number, length: number): number =>
  (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * length) / index.averageLength[field]))

const docsWith = (index: SearchIndex, term: string): number =>
  Option.getOrElse(MutableHashMap.get(index.docCount, term), () => 0)

// The terms a word stands for. The word's own term if the index has it;
// for the word being typed, every word it begins too; and only if neither
// finds anything, the words within its edit budget.
export const expand: {
  (word: string, prefix: boolean): (index: SearchIndex) => ReadonlyArray<Expansion>
  (index: SearchIndex, word: string, prefix: boolean): ReadonlyArray<Expansion>
} = dual(3, (index: SearchIndex, word: string, prefix: boolean): ReadonlyArray<Expansion> => {
  const own = termOf(word)
  const exact: Array<Expansion> = docsWith(index, own) > 0 ? [{ term: own, weight: 1 }] : []
  const key = bare(word)
  const completions: Array<Expansion> = []
  if (prefix && key.length >= MIN_PREFIX) {
    const seen = new Set([own])
    for (const [surface, terms] of index.vocabulary) {
      if (!Str.startsWith(key)(surface)) continue
      for (const term of terms) {
        if (seen.has(term)) continue
        seen.add(term)
        completions.push({ term, weight: PREFIX_WEIGHT })
      }
    }
  }
  if (exact.length > 0 || completions.length > 0) return [...exact, ...completions]

  const budget = editsFor(key)
  if (budget === 0) return []
  const best = new Map<string, number>()
  for (const [surface, terms] of index.vocabulary) {
    const d = distance(key, surface, budget)
    if (d > budget) continue
    const weight = TYPO_WEIGHTS[d] ?? 0
    for (const term of terms) best.set(term, Math.max(best.get(term) ?? 0, weight))
  }
  return Arr.map(Array.from(best), ([term, weight]) => ({ term, weight }))
})

// Each doc a term is in, with its BM25 score and where it is.
const scoreTerm = (index: SearchIndex, term: string, weight: number): Map<number, Match> => {
  const out = new Map<number, Match>()
  const w = weight * idf(index, docsWith(index, term))
  for (const posting of postingsOf(index, term)) {
    const length = index.docs[posting.doc]!.fields[posting.field].tokens.length
    const score = w * BOOSTS[posting.field] * saturate(index, posting.field, posting.positions.length, length)
    const hits = Arr.map(posting.positions, position => ({ field: posting.field, position }))
    const was = out.get(posting.doc)
    out.set(posting.doc, was === undefined ? { score, hits } : { score: was.score + score, hits: [...was.hits, ...hits] })
  }
  return out
}

// A word: the best of its expansions in each doc, and every hit of them all.
const scoreWord = (index: SearchIndex, word: string, prefix: boolean): Map<number, Match> => {
  const out = new Map<number, Match>()
  for (const { term, weight } of expand(index, word, prefix)) {
    scoreTerm(index, term, weight).forEach((match, doc) => {
      const was = out.get(doc)
      out.set(
        doc,
        was === undefined ? match : { score: Math.max(was.score, match.score), hits: [...was.hits, ...match.hits] },
      )
    })
  }
  return out
}

// A phrase: its words at consecutive positions in one field. It scores as
// one term whose frequency is how often the whole phrase appears.
const scorePhrase = (index: SearchIndex, words: ReadonlyArray<string>): Map<number, Match> => {
  const terms = Arr.map(words, termOf)
  const lists = Arr.map(terms, term => postingsOf(index, term))
  const found = new Map<number, Array<{ field: FieldId; starts: Array<number> }>>()
  for (const first of lists[0] ?? []) {
    const rest = Arr.map(lists.slice(1), list =>
      Arr.findFirst(list, p => p.doc === first.doc && p.field === first.field).pipe(
        Option.map(p => new Set(p.positions)),
      ),
    )
    if (!Arr.every(rest, Option.isSome)) continue
    const sets = Arr.map(rest, set => Option.getOrThrow(set))
    const starts = Arr.filter(first.positions, at => Arr.every(sets, (set, i) => set.has(at + i + 1)))
    if (starts.length === 0) continue
    const list = found.get(first.doc) ?? []
    list.push({ field: first.field, starts })
    found.set(first.doc, list)
  }
  const w = idf(index, found.size)
  const out = new Map<number, Match>()
  found.forEach((fields, doc) => {
    let score = 0
    const hits: Array<Hit> = []
    for (const { field, starts } of fields) {
      const length = index.docs[doc]!.fields[field].tokens.length
      score += w * BOOSTS[field] * saturate(index, field, starts.length, length)
      for (const start of starts) for (let i = 0; i < terms.length; i++) hits.push({ field, position: start + i })
    }
    out.set(doc, { score, hits })
  })
  return out
}

const scoreAtom = (index: SearchIndex, atom: Atom): Map<number, Match> =>
  atom._tag === 'Word' ? scoreWord(index, atom.word, atom.prefix) : scorePhrase(index, atom.words)

// Highest score first, then the newest.
const byRank: Order.Order<Result> = Order.combine(
  Order.flip(Order.mapInput(Num.Order, (result: Result) => result.score)),
  Order.flip(Order.mapInput(Order.String, (result: Result) => result.date)),
)

export const run: {
  (query: Query): (index: SearchIndex) => ReadonlyArray<Result>
  (index: SearchIndex, query: Query): ReadonlyArray<Result>
} = dual(2, (index: SearchIndex, query: Query): ReadonlyArray<Result> => {
  if (isEmpty(query)) return []
  const excluded = new Set<number>()
  for (const atom of query.excluded) scoreAtom(index, atom).forEach((_, doc) => excluded.add(doc))

  // With nothing to find, only things to leave out, every other doc matches.
  let matched: Map<number, Match> | undefined =
    query.clauses.length === 0 ? new Map(Arr.map(index.docs, (_, d) => [d, { score: 0, hits: [] }] as const)) : undefined
  for (const clause of query.clauses) {
    const any = new Map<number, Match>()
    for (const atom of clause) {
      scoreAtom(index, atom).forEach((match, doc) => {
        const was = any.get(doc)
        any.set(doc, was === undefined ? match : { score: was.score + match.score, hits: [...was.hits, ...match.hits] })
      })
    }
    if (matched === undefined) matched = any
    else {
      const next = new Map<number, Match>()
      const so = matched
      any.forEach((match, doc) => {
        const was = so.get(doc)
        if (was !== undefined) next.set(doc, { score: was.score + match.score, hits: [...was.hits, ...match.hits] })
      })
      matched = next
    }
    if (matched.size === 0) return []
  }

  const results = Arr.map(
    Arr.filter(Array.from(matched ?? []), ([doc]) => !excluded.has(doc)),
    ([doc, match]): Result => ({ id: index.docs[doc]!.id, date: index.docs[doc]!.date, score: match.score, hits: match.hits }),
  )
  return Arr.sort(results, byRank)
})

export const search: {
  (input: string): (index: SearchIndex) => ReadonlyArray<Result>
  (index: SearchIndex, input: string): ReadonlyArray<Result>
} = dual(2, (index: SearchIndex, input: string): ReadonlyArray<Result> => run(index, parse(input)))
