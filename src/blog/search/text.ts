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
      if (INLINE.has(element.tag)) return inner
      return `\n${inner}\n`
    },
    Child: () => '',
    Outlet: () => '',
  })

export const plainText = (body: ReadonlyArray<View.Input<unknown, unknown>>): string =>
  Str.trim(Str.replace(/[ \t]*\n\s*/g, '\n')(Arr.join(Arr.map(View.children(body), textOf), '')))

// oxlint-disable-next-line effect/noAs, effect/noChainedTypeAssertions -- @effect/ui builds an Html.H only inside a component render; Html.tags is its runtime tag set, typed as a loose record
export const tags = Html.tags as unknown as Html.H<never>

export const postText = (post: Post): string => plainText(post.body(tags))

interface Timed {
  readonly seconds: () => number
}

const isTimed = (component: unknown): component is Timed =>
  Predicate.hasProperty(component, 'seconds') && Predicate.isFunction(component.seconds)

const playsFor = (node: View.Child<unknown, unknown>): number => {
  if (isTimed(node.component)) return Number(node.component.seconds())
  return 0
}

const secondsOf = (node: View.Node<unknown, unknown>): number =>
  Match.valueTags(node, {
    Child: playsFor,
    Element: ({ children }) => Num.sumAll(Arr.map(children, secondsOf)),
    Text: () => 0,
    Outlet: () => 0,
  })

export const postSeconds = (post: Post): number =>
  Num.sumAll(Arr.map(View.children([...post.body(tags), ...(post.hero?.(tags) ?? [])]), secondsOf))
