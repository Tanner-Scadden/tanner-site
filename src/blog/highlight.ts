import { Array as Arr, Effect, Option, Schema } from 'effect'
import type { HighlighterCore, ThemedToken } from 'shiki/core'

export const CodeLang = Schema.Literals(['ts', 'tsx', 'js', 'json', 'bash', 'css', 'html'])
export type CodeLang = typeof CodeLang.Type

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

const loadShikiCore = () => import('shiki/core')
const loadRegexEngine = () => import('shiki/engine/javascript')
const loadTypescript = () => import('shiki/langs/typescript.mjs')
const loadTsx = () => import('shiki/langs/tsx.mjs')
const loadJavascript = () => import('shiki/langs/javascript.mjs')
const loadJson = () => import('shiki/langs/json.mjs')
const loadShell = () => import('shiki/langs/shellscript.mjs')
const loadCss = () => import('shiki/langs/css.mjs')
const loadHtml = () => import('shiki/langs/html.mjs')

const loadHighlighter = Effect.gen(function* () {
  const [{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }] =
    yield* Effect.all([attempt(loadShikiCore), attempt(loadRegexEngine)], {
      concurrency: 'unbounded',
    })
  return yield* attempt(
    (): Promise<HighlighterCore> =>
      createHighlighterCore({
        themes: [createCssVariablesTheme({ name: THEME, variablePrefix: '--code-', fontStyle: true })],
        langs: [
          loadTypescript(),
          loadTsx(),
          loadJavascript(),
          loadJson(),
          loadShell(),
          loadCss(),
          loadHtml(),
        ],
        engine: createJavaScriptRegexEngine(),
      }),
  )
})

const highlighter = Effect.runSync(Effect.cached(loadHighlighter))

export const tokenize = ({
  code,
  lang,
}: {
  readonly code: string
  readonly lang: CodeLang
}): Effect.Effect<ReadonlyArray<ReadonlyArray<ThemedToken>>, HighlightUnavailable> =>
  Effect.map(highlighter, h => h.codeToTokensBase(code, { lang: SHIKI_LANG[lang], theme: THEME }))

const ITALIC = 1
const BOLD = 2

const lineBreak = (document: Document, index: number): ReadonlyArray<Node> => {
  if (index === 0) return []
  return [document.createTextNode('\n')]
}

export const tokenNodes = ({
  document,
  lines,
}: {
  readonly document: Document
  readonly lines: ReadonlyArray<ReadonlyArray<ThemedToken>>
}): ReadonlyArray<Node> =>
  Arr.flatMap(lines, (line, i) => [
    ...lineBreak(document, i),
    ...Arr.map(line, token => {
      const span = document.createElement('span')
      span.textContent = token.content
      const color = Option.fromNullishOr(token.color)
      if (Option.isSome(color)) span.style.color = color.value
      const style = token.fontStyle ?? 0
      if ((style & ITALIC) !== 0) span.style.fontStyle = 'italic'
      if ((style & BOLD) !== 0) span.style.fontWeight = '700'
      return span
    }),
  ])
