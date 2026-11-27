import { Html } from '@effect/ui/html'
import { Array as Arr } from 'effect'

import type { Post } from '#domain/Post'

import type { Doc } from './index.ts'
import { plainText } from './text.ts'

// NOTE: the blog's posts as search docs.
//
// A body is a view, `h => [...]`, so reading its text means calling it with
// an `h`. It gets Html's own tag builders and nothing else: enough for the
// plain tags a post is written with, and for a component call, which only
// declares the child. Nothing renders or mounts, so an animated figure adds
// no text and starts no canvas. A body that reached for more of `h` (`h.id`,
// `h.lazy`) would throw here, and the posts test would catch it.
const tags = Html.tags as unknown as Html.H<never>

export const postDocs = (posts: ReadonlyArray<Post>): ReadonlyArray<Doc> =>
  Arr.map(posts, post => ({
    id: post.slug,
    date: post.date,
    title: post.title,
    summary: post.summary,
    body: plainText(post.body(tags)),
  }))
