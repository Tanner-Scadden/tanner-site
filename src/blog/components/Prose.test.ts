import { View } from '@effect/ui'
import { assert, describe, it } from '@effect/vitest'
import { tags } from '../search/text.ts'
import { proseTags } from './Prose.ts'

const h = proseTags(tags)

const attrsOf = (link: ReturnType<typeof h.a>) => View.build(link, []).attrs

describe('proseTags', () => {
  it('opens a link in a new tab, away from the post', () => {
    const attrs = attrsOf(h.a.attr('href', 'https://example.com/').children('a book'))
    assert.strictEqual(attrs['target'], '_blank')
    assert.strictEqual(attrs['rel'], 'noopener noreferrer')
  })

  it('opens a link back into the site in place when it drops the target', () => {
    // oxlint-disable-next-line effect/noNullish -- @effect/ui's attr drops an attribute only when given undefined
    const attrs = attrsOf(h.a.attr('href', '/blog').attr('target', undefined).children('the blog'))
    assert.notProperty(attrs, 'target')
  })
})
