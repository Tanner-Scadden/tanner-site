import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option, Record as Rec, Schema, String as Str } from 'effect'

import { PUBLISHED } from '#content/blog'
import type { Post } from '#domain/Post'

import INDEX from '../../index.html?raw'
import { SITE, pagesOf, sitemap, withHead } from './head.ts'

const post = (slug: string, date: string, summary = 'A summary.'): Post => ({
  slug,
  title: `Post ${slug}`,
  date,
  summary,
  body: () => [],
})

const all = (html: string, re: RegExp): ReadonlyArray<string> =>
  Arr.map(Arr.fromIterable(Str.matchAll(re)(html)), m => m[1] ?? '')

const metaOf = (html: string, key: string): ReadonlyArray<string> =>
  all(html, new RegExp(`<meta ${key} content="([^"]*)" />`, 'g'))

const JsonLd = Schema.Struct({
  '@type': Schema.optional(Schema.String),
  headline: Schema.optional(Schema.String),
  datePublished: Schema.optional(Schema.String),
  image: Schema.optional(Schema.String),
  blogPost: Schema.optional(Schema.Array(Schema.Json)),
})
const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(JsonLd))
const jsonLdOf = (html: string): typeof JsonLd.Type =>
  Option.getOrElse(decodeJson(all(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)[0]), () => ({}))

const count = (html: string, re: RegExp): number => Arr.length(Arr.fromIterable(Str.matchAll(re)(html)))

describe('pagesOf', () => {
  it('has no blog pages without posts', () => {
    assert.deepStrictEqual(pagesOf([]), [])
  })

  it('writes /blog, then each post newest first, where Cloudflare serves them', () => {
    const pages = pagesOf([post('older', '2026-01-01'), post('newer', '2026-02-01')])
    assert.deepStrictEqual(Arr.map(pages, p => p.file), ['blog.html', 'blog/newer.html', 'blog/older.html'])
    assert.deepStrictEqual(Arr.map(pages, p => p.url), [`${SITE}/blog`, `${SITE}/blog/newer`, `${SITE}/blog/older`])
  })
})

describe('withHead', () => {
  const [blog, first] = pagesOf(PUBLISHED)
  const page = withHead(INDEX, first!)

  it('gives a post its own title, description and canonical URL', () => {
    const real = PUBLISHED[0]!
    assert.include(page, `<title>${real.title} · Tanner Scadden</title>`)
    assert.deepStrictEqual(metaOf(page, 'name="description"'), [real.summary])
    assert.include(page, `<link rel="canonical" href="${SITE}/blog/${real.slug}" />`)
  })

  it('shares it as an article', () => {
    const real = PUBLISHED[0]!
    assert.deepStrictEqual(metaOf(page, 'property="og:type"'), ['article'])
    assert.deepStrictEqual(metaOf(page, 'property="og:description"'), [real.summary])
    assert.deepStrictEqual(metaOf(page, 'name="twitter:description"'), [real.summary])
    assert.deepStrictEqual(metaOf(page, 'property="article:published_time"'), [real.date])
  })

  it('shares a post with its own card and alt text, where it has one', () => {
    const real = PUBLISHED[0]!
    assert.isDefined(real.image)
    const url = `${SITE}${real.image.path}`
    assert.deepStrictEqual(metaOf(page, 'property="og:image"'), [url])
    assert.deepStrictEqual(metaOf(page, 'name="twitter:image"'), [url])
    assert.deepStrictEqual(metaOf(page, 'property="og:image:alt"'), [real.image.alt])
    assert.deepStrictEqual(metaOf(page, 'name="twitter:image:alt"'), [real.image.alt])
    assert.strictEqual(jsonLdOf(page).image, url)
  })

  it('keeps the site card and its alt text for a post without one, and for /blog', () => {
    const [, plain] = pagesOf([post('plain', '2026-01-01')])
    for (const html of [withHead(INDEX, plain!), withHead(INDEX, blog!)]) {
      for (const key of ['property="og:image"', 'property="og:image:alt"', 'name="twitter:image"', 'name="twitter:image:alt"']) {
        assert.deepStrictEqual(metaOf(html, key), metaOf(INDEX, key), key)
      }
    }
  })

  it('points the site card at a file that ships, everywhere index.html names it', () => {
    const files = Arr.map(Rec.keys(import.meta.glob('/public/**/*.png', { query: '?url' })), Str.slice('/public'.length))
    const images = [
      ...metaOf(INDEX, 'property="og:image"'),
      ...metaOf(INDEX, 'name="twitter:image"'),
      Option.getOrElse(Option.fromNullishOr(jsonLdOf(INDEX).image), () => ''),
    ]
    assert.lengthOf(Arr.dedupe(images), 1)
    assert.include(files, Str.slice(SITE.length)(images[0]!))
  })

  it('describes it as a BlogPosting', () => {
    const ld = jsonLdOf(page)
    assert.strictEqual(ld['@type'], 'BlogPosting')
    assert.strictEqual(ld.headline, PUBLISHED[0]!.title)
    assert.strictEqual(ld.datePublished, PUBLISHED[0]!.date)
  })

  it('makes /blog a Blog listing its posts, and no article', () => {
    const html = withHead(INDEX, blog!)
    assert.deepStrictEqual(metaOf(html, 'property="og:type"'), ['website'])
    assert.deepStrictEqual(metaOf(html, 'property="article:published_time"'), [])
    const ld = jsonLdOf(html)
    assert.strictEqual(ld['@type'], 'Blog')
    assert.lengthOf(Option.getOrElse(Option.fromNullishOr(ld.blogPost), () => []), PUBLISHED.length)
  })

  it('keeps everything else in index.html, like the app script', () => {
    assert.include(page, '<script type="module" src="/src/main.ts"></script>')
    assert.strictEqual(count(page, /<meta /g), count(INDEX, /<meta /g) + 2)
  })

  it('escapes the copy, and never reads a $ as a pattern', () => {
    const [, tricky] = pagesOf([post('tricky', '2026-01-01', 'Raised $56,000 & said "hi" <3')])
    const html = withHead(INDEX, tricky!)
    assert.deepStrictEqual(metaOf(html, 'name="description"'), ['Raised $56,000 &amp; said &quot;hi&quot; &lt;3'])
    assert.include(html, '\\u003c3')
  })

  it('fails the build if index.html loses a tag it swaps', () => {
    assert.throws(() => withHead(Str.replace(/<link rel="canonical"[^>]*>/, '')(INDEX), first!))
  })
})

describe('sitemap', () => {
  it('lists the front page, the blog and every post', () => {
    const xml = sitemap([post('a', '2026-01-01'), post('b', '2026-03-01')])
    assert.deepStrictEqual(
      all(xml, /<loc>([^<]*)<\/loc>/g),
      [`${SITE}/`, `${SITE}/blog`, `${SITE}/blog/b`, `${SITE}/blog/a`],
    )
    assert.include(xml, `<loc>${SITE}/blog</loc>\n    <lastmod>2026-03-01</lastmod>`)
  })

  it('lists only the front page with no posts', () => {
    assert.strictEqual(count(sitemap([]), /<loc>/g), 1)
  })
})
