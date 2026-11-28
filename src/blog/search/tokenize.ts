import { MutableHashMap, Option, String as Str } from 'effect'

import { stem } from './stem.ts'

export interface Token {
  readonly surface: string
  readonly term: string
  readonly position: number
  readonly start: number
  readonly end: number
}

const COMBINING = /\p{M}+/gu
const APOSTROPHES = /[\u2018\u2019\u02BC\uFF07]/g

export const fold = (text: string): string =>
  Str.replace(APOSTROPHES, "'")(Str.toLowerCase(Str.replace(COMBINING, '')(Str.normalize('NFKD')(text))))

const stems = MutableHashMap.empty<string, string>()

export const termOf = (surface: string): string =>
  Option.getOrElse(MutableHashMap.get(stems, surface), () => {
    const term = Str.replaceAll("'", '')(stem(surface))
    MutableHashMap.set(stems, surface, term)
    return term
  })

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
