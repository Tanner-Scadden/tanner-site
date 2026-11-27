import { Schema } from 'effect'

// NOTE: the search's data on the wire: the posts' text going in, and what a
// search found coming out.

export const Doc = Schema.Struct({
  id: Schema.String,
  date: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  body: Schema.String,
})

export const Docs = Schema.Array(Doc)

export const Part = Schema.Struct({ text: Schema.String, marked: Schema.Boolean })

export const Snippet = Schema.Struct({
  field: Schema.Literals(['summary', 'body']),
  parts: Schema.Array(Part),
})

export const Found = Schema.Struct({ id: Schema.String, snippet: Schema.Option(Snippet) })
export type Found = typeof Found.Type
