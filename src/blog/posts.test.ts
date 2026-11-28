import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, String as Str } from 'effect'

import { beSomeoneWorthCalling } from '#content/posts/be-someone-worth-calling'

import { POSTS, minutesOf, readingMinutes } from './posts.ts'
import { postSeconds, postText } from './search/text.ts'

const words = (n: number): string => Arr.join(Arr.replicate('word', n), ' ')

describe('read estimate', () => {
  it('rounds up to the minute, and is never under one', () => {
    assert.strictEqual(readingMinutes(''), 1)
    assert.strictEqual(readingMinutes(words(1)), 1)
    assert.strictEqual(readingMinutes(words(230)), 1)
    assert.strictEqual(readingMinutes(words(231)), 2)
  })

  it('counts words, not the space between them', () => {
    assert.strictEqual(readingMinutes(`  ${words(230)}\n\n\t`), 1)
    assert.strictEqual(readingMinutes(Str.replace(/ /g, '\n')(words(231))), 2)
  })

  it('gives every post a whole number of minutes', () => {
    for (const post of POSTS) {
      const n = minutesOf(post)
      assert.isTrue(Number.isInteger(n) && n >= 1, `minutes of ${post.slug}`)
    }
  })

  it('counts how long the drawings play, the hero included', () => {
    const seconds = postSeconds(beSomeoneWorthCalling)
    assert.isTrue(seconds > 60 && seconds < 80, `seconds of drawings: ${seconds}`)
    const words = Arr.filter(Str.split(postText(beSomeoneWorthCalling), /\s+/), Str.isNonEmpty).length
    assert.strictEqual(minutesOf(beSomeoneWorthCalling), Math.ceil(words / 230 + seconds / 60))
  })
})
