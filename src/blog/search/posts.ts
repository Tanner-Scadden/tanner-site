import { Html } from '@effect/ui/html'
import { Array as Arr } from 'effect'

import type { Post } from '#domain/Post'

import type { Doc } from './index.ts'
import { plainText } from './text.ts'

const tags = Html.tags as unknown as Html.H<never>

export const postDocs = (posts: ReadonlyArray<Post>): ReadonlyArray<Doc> =>
  Arr.map(posts, post => ({
    id: post.slug,
    date: post.date,
    title: post.title,
    summary: post.summary,
    body: plainText(post.body(tags)),
  }))
