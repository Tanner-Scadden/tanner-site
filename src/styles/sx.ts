import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'

// What `stylex.props` takes: a style (static, or a dynamic one called with
// its values), a marker, or `false`/`null`/`undefined` to skip it.
export type Sx = stylex.StyleXArray<
  | stylex.CompiledStyles
  | Readonly<[stylex.CompiledStyles, stylex.InlineStyles]>
  | stylex.StyleXMarker
  | boolean
  | null
  | undefined
>

interface Styled<E> {
  style(style: Html.Style): E
}

export const sx = <E extends Styled<E>>(
  builder: { class(...tokens: ReadonlyArray<Html.ClassToken>): E },
  ...styles: ReadonlyArray<Sx>
): E => {
  const { className, style } = stylex.props(...styles)
  const classed = builder.class(className)
  return style === undefined ? classed : classed.style(style as Html.Style)
}

// The class tokens alone, for the document's <html> and <body>.
export const classOf = (...styles: ReadonlyArray<Sx>): string =>
  stylex.props(...styles).className ?? ''
