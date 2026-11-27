import { Array as Arr, Option, String as Str } from 'effect'

import { tokenize } from './tokenize.ts'

export type Atom =
  | { readonly _tag: 'Word'; readonly word: string; readonly prefix: boolean }
  | { readonly _tag: 'Phrase'; readonly words: ReadonlyArray<string>; readonly prefix: boolean }

export interface Query {
  // Every clause must match. A clause matches when any of its atoms does.
  readonly clauses: ReadonlyArray<ReadonlyArray<Atom>>
  // No result may match any of these.
  readonly excluded: ReadonlyArray<Atom>
}

export const isEmpty = (query: Query): boolean => query.clauses.length === 0 && query.excluded.length === 0

// A quoted phrase, with its minus and closing quote if any, or a bare word.
const PIECES = /(-?)["“”]([^"“”]*)(["“”]?)|(\S+)/g

// The folded words of some text, as an atom: a word, a phrase, or nothing.
const atomOf = (text: string, prefix: boolean): Option.Option<Atom> => {
  const words = Arr.map(tokenize(text), token => token.surface)
  return words.length === 0
    ? Option.none()
    : words.length === 1
      ? Option.some({ _tag: 'Word', word: words[0] as string, prefix })
      : Option.some({ _tag: 'Phrase', words, prefix })
}

export const parse = (input: string): Query => {
  const clauses: Array<Array<Atom>> = []
  const excluded: Array<Atom> = []
  // Still typing the last word: no space after it yet.
  const typing = input.length > 0 && !/\s$/.test(input)
  let joinNext = false
  const pieces = Array.from(Str.matchAll(PIECES)(input))
  Arr.forEach(pieces, (piece, i) => {
    const [, minus, quoted, close, bareWord] = piece
    const last = i === pieces.length - 1
    if (bareWord === 'OR') {
      joinNext = clauses.length > 0
      return
    }
    const bareText = bareWord ?? ''
    const negated = quoted !== undefined ? minus === '-' : Str.startsWith('-')(bareText) && bareText.length > 1
    const text = quoted ?? (negated ? Str.slice(1)(bareText) : bareText)
    // A closed quote is done; an open one, or a bare word, may still be typed.
    const open = quoted === undefined || close === ''
    const atom = atomOf(text, open && last && typing && !negated)
    Option.map(atom, a => {
      if (negated) excluded.push(a)
      else if (joinNext && clauses.length > 0) (clauses[clauses.length - 1] as Array<Atom>).push(a)
      else clauses.push([a])
    })
    joinNext = false
  })
  return { clauses, excluded }
}
