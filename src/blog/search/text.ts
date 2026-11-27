import { View } from '@effect/ui'
import { Array as Arr, String as Str } from 'effect'

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
