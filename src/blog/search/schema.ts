import { Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/rpc'

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

export const SearchRpcs = /* @__PURE__ */ RpcGroup.make(
  Rpc.make('Search', { payload: { query: Schema.String }, success: Schema.Array(Found) }),
)
