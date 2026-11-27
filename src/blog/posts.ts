import { Array as Arr, Option } from 'effect'

import { DRAFTS, PUBLISHED } from '#content/blog'
import { type Post, sheetNo, sortPosts } from '#domain/Post'

// NOTE: the posts this build shows, newest first. DRAFTS is empty in a build.
export const POSTS: ReadonlyArray<Post> = sortPosts([...PUBLISHED, ...DRAFTS])

// NOTE: the blog only exists once there's something on it. Until a post is
// in PUBLISHED, a build answers /blog and every post with Sheet not found
// and the home page has no link to it. Under `bun run dev` drafts count, so
// you can write and preview there.
export const BLOG_OPEN: boolean = POSTS.length > 0

export const isDraft = (post: Post): boolean =>
  Arr.some(DRAFTS, draft => draft.slug === post.slug)

export const findPost = (slug: string): Option.Option<Post> =>
  Arr.findFirst(POSTS, post => post.slug === slug)

// The oldest post is sheet B-01.
export const sheetOf = (post: Post): string =>
  sheetNo(POSTS.length - Arr.findFirstIndex(POSTS, p => p.slug === post.slug).pipe(Option.getOrElse(() => 0)))

// The posts either side of this one.
export const neighboursOf = (
  post: Post,
): { readonly newer: Option.Option<Post>; readonly older: Option.Option<Post> } => {
  const i = Arr.findFirstIndex(POSTS, p => p.slug === post.slug).pipe(Option.getOrElse(() => -1))
  return { newer: Arr.get(POSTS, i - 1), older: Arr.get(POSTS, i + 1) }
}
