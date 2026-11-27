import { Rpc, RpcGroup } from 'effect/rpc'
import { Schema } from 'effect'

import { Found } from './schema.ts'

// NOTE: what the page and the search worker say to each other. The page
// sends every post's plain text once, as the worker's initial message (see
// `Docs`); the worker builds the index from it and answers each search with
// the matching posts, best first, and the snippet to show under each.

export const SearchRpcs = RpcGroup.make(
  Rpc.make('Search', { payload: { query: Schema.String }, success: Schema.Array(Found) }),
)
