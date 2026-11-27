import { View } from '@effect/ui'
import { Array as Arr, String as Str } from 'effect'

// NOTE: a post's body is a view, so its plain text comes from walking the
// nodes the view builds, the same nodes the post page renders. Nothing
// mounts: no DOM, no canvas, no listener. A child component, such as an
// animated figure, is only a Child node here and adds nothing, since its
// view belongs to it and never runs.
//
// A block element starts and ends a line, so words in two blocks never run
// together (a Note's label and its first word, say), and a phrase can't cross
// from one to the next (see `tokenize`). Inline ones (a, em, strong, code...)
// join their text in place. Controls and what's hidden from a screen reader
// are chrome, not prose: a button, anything `aria-hidden`, and anything
// marked `data-search="skip"` add nothing.

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

const textOf = (node: View.Node<unknown, unknown>): string => {
  switch (node._tag) {
    case 'Text':
      return node.text
    case 'Element': {
      if (skipped(node)) return ''
      const inner = Arr.join(Arr.map(node.children, textOf), '')
      return INLINE.has(node.tag) ? inner : `\n${inner}\n`
    }
    case 'Child':
    case 'Outlet':
      return ''
  }
}

// The plain text of a body, one line per block.
export const plainText = (body: ReadonlyArray<View.Input<unknown, unknown>>): string =>
  Str.trim(Str.replace(/[ \t]*\n\s*/g, '\n')(Arr.join(Arr.map(View.children(body), textOf), '')))
