import { Array as Arr, Effect, Schema } from 'effect'
import type { HighlighterCore, ThemedToken } from 'shiki/core'

// NOTE: syntax highlighting for code blocks, with Shiki. It loads the first
// time a post shows code, so the rest of the site never downloads it. The
// colours are CSS variables (--code-token-*), set by the Code block in
// Prose.ts from the syntax tokens, so the theme lives with the rest of the
// blueprint.

export const CodeLang = Schema.Literals(['ts', 'tsx', 'js', 'json', 'bash', 'css', 'html'])
export type CodeLang = typeof CodeLang.Type

// What each language is called on the code block's tab.
export const LANG_NAMES: Record<CodeLang, string> = {
  ts: 'TYPESCRIPT',
  tsx: 'TSX',
  js: 'JAVASCRIPT',
  json: 'JSON',
  bash: 'SHELL',
  css: 'CSS',
  html: 'HTML',
}

const SHIKI_LANG: Record<CodeLang, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  json: 'json',
  bash: 'shellscript',
  css: 'css',
  html: 'html',
}

const THEME = 'blueprint'

export class HighlightUnavailable extends Schema.TaggedError<
  HighlightUnavailable,
  { readonly brand: unique symbol }
>()('HighlightUnavailable', { cause: Schema.Unknown }) {}

const attempt = <A>(load: () => Promise<A>) =>
  Effect.tryPromise({ try: load, catch: cause => HighlightUnavailable.make({ cause }) })

const loadHighlighter = Effect.gen(function* () {
  const [{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }] =
    yield* Effect.all([attempt(() => import('shiki/core')), attempt(() => import('shiki/engine/javascript'))], {
      concurrency: 'unbounded',
    })
  return yield* attempt(
    (): Promise<HighlighterCore> =>
      createHighlighterCore({
        themes: [createCssVariablesTheme({ name: THEME, variablePrefix: '--code-', fontStyle: true })],
        langs: [
          import('shiki/langs/typescript.mjs'),
          import('shiki/langs/tsx.mjs'),
          import('shiki/langs/javascript.mjs'),
          import('shiki/langs/json.mjs'),
          import('shiki/langs/shellscript.mjs'),
          import('shiki/langs/css.mjs'),
          import('shiki/langs/html.mjs'),
        ],
        engine: createJavaScriptRegexEngine(),
      }),
  )
})

// Loaded once and shared by every code block.
const highlighter = Effect.runSync(Effect.cached(loadHighlighter))

export const tokenize = ({
  code,
  lang,
}: {
  readonly code: string
  readonly lang: CodeLang
}): Effect.Effect<ReadonlyArray<ReadonlyArray<ThemedToken>>, HighlightUnavailable> =>
  Effect.map(highlighter, h => h.codeToTokensBase(code, { lang: SHIKI_LANG[lang], theme: THEME }))

// Shiki's font style is a bit set: 1 italic, 2 bold, 4 underline.
const ITALIC = 1
const BOLD = 2

// One span per token, and a newline between lines.
export const tokenNodes = ({
  document,
  lines,
}: {
  readonly document: Document
  readonly lines: ReadonlyArray<ReadonlyArray<ThemedToken>>
}): ReadonlyArray<Node> =>
  Arr.flatMap(lines, (line, i) => [
    ...(i > 0 ? [document.createTextNode('\n')] : []),
    ...Arr.map(line, token => {
      const span = document.createElement('span')
      span.textContent = token.content
      if (token.color !== undefined) span.style.color = token.color
      const style = token.fontStyle ?? 0
      if ((style & ITALIC) !== 0) span.style.fontStyle = 'italic'
      if ((style & BOLD) !== 0) span.style.fontWeight = '700'
      return span
    }),
  ])
