import { Array as Arr } from 'effect'

import type { Post } from '#domain/Post'

import type { Doc } from './index.ts'
import { postText } from './text.ts'

export const postDocs = (posts: ReadonlyArray<Post>): ReadonlyArray<Doc> =>
  Arr.map(posts, post => ({
    id: post.slug,
    date: post.date,
    title: post.title,
    summary: post.summary,
    body: postText(post),
  }))
