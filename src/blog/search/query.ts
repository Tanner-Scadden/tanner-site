import { Array as Arr, Option, Schema, String as Str } from 'effect'

import { tokenize } from './tokenize.ts'

export const Atom = Schema.TaggedUnion({
  Word: { word: Schema.String, prefix: Schema.Boolean },
  Phrase: { words: Schema.Array(Schema.String), prefix: Schema.Boolean },
})
export type Atom = typeof Atom.Type

export interface Query {
  readonly clauses: ReadonlyArray<ReadonlyArray<Atom>>
  readonly excluded: ReadonlyArray<Atom>
}

export const isEmpty = (query: Query): boolean => query.clauses.length === 0 && query.excluded.length === 0

const PIECES = /(-?)["“”]([^"“”]*)(["“”]?)|(\S+)/g

const atomOf = (text: string, prefix: boolean): Option.Option<Atom> => {
  const words = Arr.map(tokenize(text), token => token.surface)
  if (!Arr.isReadonlyArrayNonEmpty(words)) return Option.none()
  if (words.length === 1) return Option.some(Atom.cases.Word.make({ word: Arr.headNonEmpty(words), prefix }))
  return Option.some(Atom.cases.Phrase.make({ words, prefix }))
}

const unnegated = (text: string, negated: boolean): string => {
  if (negated) return Str.slice(1)(text)
  return text
}

export const parse = (input: string): Query => {
  const clauses: Array<Array<Atom>> = []
  const excluded: Array<Atom> = []
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
    const quotedText = Option.fromNullishOr(quoted)
    const negated = Option.match(quotedText, {
      onNone: () => Str.startsWith('-')(bareText) && bareText.length > 1,
      onSome: () => minus === '-',
    })
    const text = Option.getOrElse(quotedText, () => unnegated(bareText, negated))
    const open = Option.match(quotedText, { onNone: () => true, onSome: () => close === '' })
    const atom = atomOf(text, open && last && typing && !negated)
    Option.map(atom, a => {
      if (negated) {
        excluded.push(a)
        return
      }
      const joined = Option.filter(Arr.last(clauses), () => joinNext)
      if (Option.isSome(joined)) joined.value.push(a)
      else clauses.push([a])
    })
    joinNext = false
  })
  return { clauses, excluded }
}
