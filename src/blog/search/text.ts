import { View } from '@effect/ui'
import { Html } from '@effect/ui/html'
import { Array as Arr, Match, Number as Num, Predicate, String as Str } from 'effect'

import type { Post } from '#domain/Post'

const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'cite',
  'code',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
])

const skipped = (node: View.Element<unknown, unknown>): boolean =>
  node.tag === 'button' || node.attrs['aria-hidden'] === 'true' || node.attrs['data-search'] === 'skip'

const textOf = (node: View.Node<unknown, unknown>): string =>
  Match.valueTags(node, {
    Text: ({ text }) => text,
    Element: element => {
      if (skipped(element)) return ''
      const inner = Arr.join(Arr.map(element.children, textOf), '')
      return INLINE.has(element.tag) ? inner : `\n${inner}\n`
    },
    Child: () => '',
    Outlet: () => '',
  })

// The plain text of a body, one line per block.
export const plainText = (body: ReadonlyArray<View.Input<unknown, unknown>>): string =>
  Str.trim(Str.replace(/[ \t]*\n\s*/g, '\n')(Arr.join(Arr.map(View.children(body), textOf), '')))

// Only Html's tag builders: enough to read a body without mounting it.
const tags = Html.tags as unknown as Html.H<never>

// The plain text of a post's body.
export const postText = (post: Post): string => plainText(post.body(tags))

// A figure that says how long it plays, in seconds.
const playsFor = (node: View.Child<unknown, unknown>): number =>
  Predicate.hasProperty(node.component, 'seconds') && Predicate.isFunction(node.component.seconds)
    ? Number(node.component.seconds())
    : 0

const secondsOf = (node: View.Node<unknown, unknown>): number =>
  Match.valueTags(node, {
    Child: playsFor,
    Element: ({ children }) => Num.sumAll(Arr.map(children, secondsOf)),
    Text: () => 0,
    Outlet: () => 0,
  })

// How long a post's drawings play, its hero's too, in seconds.
export const postSeconds = (post: Post): number =>
  Num.sumAll(Arr.map(View.children([...post.body(tags), ...(post.hero?.(tags) ?? [])]), secondsOf))
