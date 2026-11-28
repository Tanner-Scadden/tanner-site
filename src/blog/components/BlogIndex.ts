import { Component, UiSchema } from '@effect/ui'
import { Html, HtmlCommand, HtmlSubscription } from '@effect/ui/html'
import { Array as Arr, Option, Result, Schema } from 'effect'
import { AsyncResult } from 'effect/reactivity'

import { POSTS } from '../posts.ts'
import type { Found } from '../search/schema.ts'
import { SearchPosts, SearchPostsLive } from '../search/SearchPosts.ts'
import { AllPosts, NoMatch, Register, ResultCount, type Row, SearchBar } from './Register.ts'

const SearchInput = Html.ref('BlogIndex.search', 'input')

const Message = UiSchema.TaggedEnum({ Searched: { query: Schema.String }, PressedSlash: {} })

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

const searchable = (query: string): boolean => /[\p{L}\p{N}]/u.test(query)

const BlogIndexNoDeps = Html.component({
  name: 'BlogIndex',
  model: Schema.Struct({ query: Schema.String }),
  message: Message,
  queries: {
    found: {
      query: SearchPosts,
      args: ({ model }) =>
        Option.getOrUndefined(Option.map(Option.liftPredicate(model.query, searchable), query => ({ query }))),
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
    const rows = Option.map(
      AsyncResult.match(h.queries.found, {
        onInitial: () => h.previous.found,
        onFailure: () => Option.none(),
        onSuccess: ({ value }) => Option.some(value),
      }),
      rowsOf,
    )
    const shown = Option.filter(rows, () => searching)
    return h.div(
      SearchBar(h, input =>
        input.ref(SearchInput).on('input', ({ value }) => Message.Searched({ query: value })),
      ),
      ResultCount(h, Option.map(shown, list => list.length)),
      Option.match(shown, {
        onNone: () => AllPosts(h),
        onSome: list => Arr.match(list, { onEmpty: () => NoMatch(h), onNonEmpty: found => Register(h, found) }),
      }),
    )
  },
})

export const BlogIndex = BlogIndexNoDeps.pipe(Component.provide(SearchPostsLive))
