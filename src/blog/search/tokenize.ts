import { Array as Arr, MutableHashMap, Option, String as Str } from 'effect'

import { stem } from './stem.ts'

// NOTE: text into terms. Words come from Unicode word boundaries, so
// "you’re", "e-mail" and "café" split the way a reader would. Each word is
// folded (NFKD, combining marks dropped, lowercased, curly apostrophes made
// straight) and then stemmed, so "Running", "runs" and "run" are one term.
// A token keeps where it sat in the source, for highlighting, and its word
// position, for phrases.

export interface Token {
  // The folded word as written: "you're", "running".
  readonly surface: string
  // The stem it's indexed under: "run".
  readonly term: string
  // Its word position. A line break skips one, so a phrase never runs from
  // one paragraph into the next.
  readonly position: number
  // Where it sits in the source text, [start, end).
  readonly start: number
  readonly end: number
}

const COMBINING = /\p{M}+/gu
const APOSTROPHES = /[\u2018\u2019\u02BC\uFF07]/g

// "Café", "CAFE" and "café" all fold to "cafe", and "you’re" to "you're".
export const fold = (text: string): string =>
  Str.replace(APOSTROPHES, "'")(Str.toLowerCase(Str.replace(COMBINING, '')(Str.normalize('NFKD')(text))))

// A folded word's indexed term: its stem, with any apostrophe the stemmer
// left dropped, so "don't" and "dont" meet. Words repeat a lot, so each is
// stemmed once.
const stems = MutableHashMap.empty<string, string>()

export const termOf = (surface: string): string =>
  Option.getOrElse(MutableHashMap.get(stems, surface), () => {
    const term = Str.replaceAll("'", '')(stem(surface))
    MutableHashMap.set(stems, surface, term)
    return term
  })

// A surface form's apostrophes dropped, for prefix and typo matching.
export const bare = (surface: string): string => Str.replaceAll("'", '')(surface)

const segmenter = new Intl.Segmenter('en', { granularity: 'word' })

export const tokenize = (text: string): ReadonlyArray<Token> => {
  const tokens: Array<Token> = []
  let position = 0
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike !== true) {
      if (Str.includes('\n')(segment.segment)) position++
      continue
    }
    // A leading or trailing apostrophe is a quote mark, not part of the word.
    const surface = Str.replace(/^'+|'+$/g, '')(fold(segment.segment))
    if (surface === '') continue
    tokens.push({
      surface,
      term: termOf(surface),
      position,
      start: segment.index,
      end: segment.index + segment.segment.length,
    })
    position++
  }
  return tokens
}

// Just the terms, for a query word.
export const terms = (text: string): ReadonlyArray<string> => Arr.map(tokenize(text), token => token.term)
