// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect } from 'effect'

import { tokenize, tokenNodes } from './highlight.ts'

describe('code highlighting', () => {
  it.effect('colours tokens from the blueprint CSS variables', () =>
    Effect.gen(function* () {
      const lines = yield* tokenize({ code: "const a = 'b'\n// done", lang: 'ts' })
      assert.strictEqual(lines.length, 2)
      const keyword = Arr.findFirst(lines[0] ?? [], token => token.content === 'const')
      assert.isTrue(keyword._tag === 'Some')
      assert.include(keyword._tag === 'Some' ? keyword.value.color : '', 'var(--code-token-keyword')
    }),
  )

  it.effect('renders the same text it was given', () =>
    Effect.gen(function* () {
      const code = 'bun run dev\necho "hi"'
      const lines = yield* tokenize({ code, lang: 'bash' })
      const pre = document.createElement('code')
      pre.replaceChildren(...tokenNodes({ document, lines }))
      assert.strictEqual(pre.textContent, code)
    }),
  )
})
