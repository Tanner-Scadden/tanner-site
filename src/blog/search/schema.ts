import { Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/rpc'

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

// NOTE: what the page and the search worker say to each other. The page
// sends every post's plain text once, as the worker's initial message (see
// `Docs`); the worker builds the index from it and answers each search with
// the matching posts, best first, and the snippet to show under each.
export const SearchRpcs = /* @__PURE__ */ RpcGroup.make(
  Rpc.make('Search', { payload: { query: Schema.String }, success: Schema.Array(Found) }),
)
