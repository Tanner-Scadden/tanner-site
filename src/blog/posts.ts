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

// An adult reads about 230 words a minute.
const WORDS_PER_MINUTE = 230

// The minutes a body of text takes to read, unrounded.
const wordMinutes = (text: string): number =>
  Arr.filter(Str.split(text, /\s+/), Str.isNonEmpty).length / WORDS_PER_MINUTE

// Rounded up to the minute, and never less than one.
const wholeMinutes = (minutes: number): number => Math.max(1, Math.ceil(minutes))

// The minutes a body of text takes to read.
export const readingMinutes = (text: string): number => wholeMinutes(wordMinutes(text))

// How long the post takes to read, and to watch its drawings play.
export const minutesOf = (post: Post): number => wholeMinutes(wordMinutes(postText(post)) + postSeconds(post) / 60)
