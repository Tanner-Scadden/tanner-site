import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr, Option, Record, String as Str } from 'effect'

export type Sx = stylex.StyleXArray<
  | stylex.CompiledStyles
  | Readonly<[stylex.CompiledStyles, stylex.InlineStyles]>
  | stylex.StyleXMarker
  | boolean
>

interface Styled<E> {
  style(style: Html.Style): E
}

type CustomProperty = `--${string}`

const isCustomProperty = (
  entry: readonly [string, string | number],
): entry is readonly [CustomProperty, string | number] =>
  Str.startsWith('--')(entry[0])

const toHtmlStyle = (
  inline: Readonly<Record<string, string | number>>,
): Html.Style =>
  Record.fromEntries(
    Arr.map(
      Arr.filter(Record.toEntries(inline), isCustomProperty),
      ([property, value]) => [property, String(value)] as const,
    ),
  )

export const sx = <E extends Styled<E>>(
  builder: { class(...tokens: ReadonlyArray<Html.ClassToken>): E },
  ...styles: ReadonlyArray<Sx>
): E => {
  const { className, style } = stylex.props(...styles)
  const classed = builder.class(className)
  return Option.match(Option.fromNullishOr(style), {
    onNone: () => classed,
    onSome: inline => classed.style(toHtmlStyle(inline)),
  })
}

export const classOf = (...styles: ReadonlyArray<Sx>): string =>
  stylex.props(...styles).className ?? ''
