import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import { Array as Arr, Order, Schema, String as Str } from 'effect'

// NOTE: a blog post. The body is an Effect UI view, written with the same `h`
// as every other page. Its plain tags (p, h2, ul, blockquote, code) come
// styled, so most posts need nothing else. See src/blog/components/Prose.ts
// for how, and for the few extra blocks.
export interface Post {
  // The URL: /blog/<slug>. Lowercase words joined by dashes.
  readonly slug: string
  readonly title: string
  // YYYY-MM-DD, the day it went up. Posts sort by this, newest first.
  readonly date: string
  // One or two sentences for the index.
  readonly summary: string
  readonly body: <M>(h: Html.H<M>) => View.Children<M, never>
}

export const PostSlug = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))

export const PostDate = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/))

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

// '2026-11-27' reads as 'NOV 27, 2026'. Read from the string, not a Date, so
// the day never shifts with the reader's time zone.
export const formatDate = (date: string): string => {
  const [year, month, day] = Str.split(date, '-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`
}

// Each post is a sheet in set B, numbered from the first one: B-01, B-02...
export const sheetNo = (n: number): string => `B-${Str.padStart(2, '0')(String(n))}`

const newestFirst = Order.flip(Order.mapInput(Order.String, (post: Post) => post.date))

export const sortPosts = (posts: ReadonlyArray<Post>): ReadonlyArray<Post> =>
  Arr.sort(posts, newestFirst)
