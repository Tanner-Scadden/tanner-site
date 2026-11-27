import { Component, UiSchema } from '@effect/ui'
import { Html, HtmlCommand, HtmlSubscription } from '@effect/ui/html'
import { Array as Arr, Option, Result, Schema } from 'effect'
import { AsyncResult } from 'effect/reactivity'

import { POSTS } from '../posts.ts'
import type { Found } from '../search/schema.ts'
import { SearchPosts, SearchPostsLive } from '../search/SearchPosts.ts'
import { AllPosts, NoMatch, Register, ResultCount, type Row, SearchBar } from './Register.ts'

// NOTE: /blog's register, with a full-text search over every post (see
// src/blog/search/). An empty search shows every post, newest first; a
// search shows what it found, best first, with the matching part of each.
// `/` jumps to the search box. The page loads this module on its own (see
// BlogPage.ts), so the search and its query code stay off every other page.
// Until a search has answered, or if it fails, every post shows, so the
// register is never blank.

const SearchInput = Html.ref('BlogIndex.search', 'input')

const Message = UiSchema.TaggedEnum({ Searched: { query: Schema.String }, PressedSlash: {} })

// The posts a search found, in its order, each with its snippet.
const rowsOf = (found: ReadonlyArray<Found>): ReadonlyArray<Row> =>
  Arr.filterMap(found, ({ id, snippet }) =>
    Result.fromOption(
      Option.map(
        Arr.findFirst(POSTS, post => post.slug === id),
        (post): Row => ({ post, snippet }),
      ),
      () => id,
    ),
  )

// A search is only a search with a letter or digit in it: a query of just
// punctuation or spaces finds no words, so it shows every post.
const searchable = (query: string): boolean => /[\p{L}\p{N}]/u.test(query)

const BlogIndexNoDeps = Html.component({
  name: 'BlogIndex',
  model: Schema.Struct({ query: Schema.String }),
  message: Message,
  queries: {
    found: {
      query: SearchPosts,
      args: ({ model }) => (searchable(model.query) ? { query: model.query } : undefined),
    },
  },
}).make({
  init: () => ({ query: '' }),
  update: {
    Searched: ($, { query }) => $.evolve({ query: () => query }),
    PressedSlash: $ => $.run(HtmlCommand.focus(SearchInput, () => Component.noop)),
  },
  subscriptions: () => [HtmlSubscription.shortcuts([{ key: '/', message: Message.PressedSlash() }])],
  view: (h, model) => {
    const searching = searchable(model.query)
    // While a search runs, the last results stay up.
    const rows = Option.map(
      AsyncResult.match(h.queries.found, {
        onInitial: () => h.previous.found,
        onFailure: () => Option.none(),
        onSuccess: ({ value }) => Option.some(value),
      }),
      rowsOf,
    )
    return h.div(
      SearchBar(h, input =>
        input.ref(SearchInput).on('input', ({ value }) => Message.Searched({ query: value })),
      ),
      ResultCount(h, searching ? Option.map(rows, list => list.length) : Option.none()),
      !searching
        ? AllPosts(h)
        : Option.match(rows, {
            onNone: () => AllPosts(h),
            onSome: list => (list.length === 0 ? NoMatch(h) : Register(h, list)),
          }),
    )
  },
})

export const BlogIndex = BlogIndexNoDeps.pipe(Component.provide(SearchPostsLive))
