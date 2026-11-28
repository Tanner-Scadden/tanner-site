import type { View } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import { Array as Arr, Order, Schema, String as Str } from 'effect'

import type { EggId } from './Egg.ts'

export interface Post {
  readonly slug: string
  readonly title: string
  readonly date: string
  readonly summary: string
  readonly body: <M>(h: Html.H<M>) => View.Children<M, never>
  readonly hero?: <M>(h: Html.H<M>, found: (egg: EggId) => M) => View.Children<M, never>
  readonly source?: string
  readonly image?: { readonly path: string; readonly alt: string }
}

export const sourcePath = (post: Post): string => post.source ?? `src/content/posts/${post.slug}.ts`

export const PostSlug = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))

export const PostDate = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/))

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

export const formatDate = (date: string): string => {
  const [year, month, day] = Str.split(date, '-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`
}

export const sheetNo = (n: number): string => `B-${Str.padStart(2, '0')(String(n))}`

const newestFirst = Order.flip(Order.mapInput(Order.String, (post: Post) => post.date))

export const sortPosts = (posts: ReadonlyArray<Post>): ReadonlyArray<Post> =>
  Arr.sort(posts, newestFirst)
