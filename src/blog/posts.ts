import { Array as Arr, Option, String as Str } from 'effect'

import { DRAFTS, PUBLISHED } from '#content/blog'
import { type Post, sheetNo, sortPosts } from '#domain/Post'

import { postSeconds, postText } from './search/text.ts'

export const POSTS: ReadonlyArray<Post> = sortPosts([...PUBLISHED, ...DRAFTS])

export const BLOG_OPEN: boolean = POSTS.length > 0

export const isDraft = (post: Post): boolean =>
  Arr.some(DRAFTS, draft => draft.slug === post.slug)

export const findPost = (slug: string): Option.Option<Post> =>
  Arr.findFirst(POSTS, post => post.slug === slug)

export const sheetOf = (post: Post): string =>
  sheetNo(POSTS.length - Arr.findFirstIndex(POSTS, p => p.slug === post.slug).pipe(Option.getOrElse(() => 0)))

export interface Neighbours {
  readonly newer: Option.Option<Post>
  readonly older: Option.Option<Post>
}

export const neighboursOf = (post: Post): Neighbours => {
  const i = Arr.findFirstIndex(POSTS, p => p.slug === post.slug).pipe(Option.getOrElse(() => -1))
  return { newer: Arr.get(POSTS, i - 1), older: Arr.get(POSTS, i + 1) }
}

const WORDS_PER_MINUTE = 230

const wordMinutes = (text: string): number =>
  Arr.filter(Str.split(text, /\s+/), Str.isNonEmpty).length / WORDS_PER_MINUTE

const wholeMinutes = (minutes: number): number => Math.max(1, Math.ceil(minutes))

export const readingMinutes = (text: string): number => wholeMinutes(wordMinutes(text))

export const minutesOf = (post: Post): number => wholeMinutes(wordMinutes(postText(post)) + postSeconds(post) / 60)
