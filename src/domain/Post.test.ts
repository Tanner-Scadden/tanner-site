import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Record as Rec, Schema, String as Str } from 'effect'

import { DRAFTS, PUBLISHED } from '#content/blog'

import { type Post, PostDate, PostSlug, formatDate, sheetNo, sortPosts, sourcePath } from './Post.ts'

const ALL_POSTS = [...PUBLISHED, ...DRAFTS]

const post = (slug: string, date: string): Post => ({
  slug,
  title: slug,
  date,
  summary: '',
  body: () => [],
})

describe('posts', () => {
  it('every post has a URL-safe slug, a real date and a title', () => {
    for (const post of ALL_POSTS) {
      assert.isTrue(Schema.is(PostSlug)(post.slug), `slug of ${post.slug}`)
      assert.isTrue(Schema.is(PostDate)(post.date), `date of ${post.slug}`)
      assert.isNotEmpty(post.title)
    }
  })

  it('every post links to a file that exists in the repo', () => {
    // Every module under src, keyed by its path from the repo root.
    const files = Arr.map(Rec.keys(import.meta.glob('/src/**/*.ts')), Str.slice(1))
    for (const post of ALL_POSTS) {
      assert.include(files, sourcePath(post), `source of ${post.slug}`)
    }
    assert.strictEqual(sourcePath(post('my-post', '2026-01-01')), 'src/content/posts/my-post.ts')
    assert.strictEqual(sourcePath({ ...post('moved', '2026-01-01'), source: 'src/x.ts' }), 'src/x.ts')
  })

  it('no two posts share a slug', () => {
    const slugs = Arr.map(ALL_POSTS, post => post.slug)
    assert.strictEqual(Arr.dedupe(slugs).length, slugs.length)
  })

  it('the blog lists posts newest first', () => {
    const posts = [post('old', '2026-01-02'), post('newest', '2026-12-01'), post('new', '2026-11-27')]
    assert.deepStrictEqual(Arr.map(sortPosts(posts), p => p.slug), ['newest', 'new', 'old'])
  })

  it('dates and sheet numbers read like a drawing', () => {
    assert.strictEqual(formatDate('2026-11-27'), 'NOV 27, 2026')
    assert.strictEqual(formatDate('2027-01-05'), 'JAN 5, 2027')
    assert.strictEqual(sheetNo(3), 'B-03')
  })
})
