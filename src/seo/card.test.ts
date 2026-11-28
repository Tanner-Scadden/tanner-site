import { assert, describe, layer } from '@effect/vitest'
import { Array as Arr, Effect, Option, Record as Rec, Result, String as Str } from 'effect'
import { Digest } from 'effect/crypto'
import { Base64 } from 'effect/encoding'

import { BLOG, PUBLISHED } from '#content/blog'
import { THESES } from '#content/home'

import INDEX from '../../index.html?raw'
import { minutesOf } from '../blog/posts.ts'
import { type CardText, Cards, HOME_CARD, POST_KICKER, pngHashOf, stampOf } from './card.ts'
import CARDS_JSON from './cards.json'
import { SITE } from './head.ts'

const CARDS: Cards = CARDS_JSON

const PNGS = Rec.mapKeys(
  import.meta.glob<string>('/public/og/*.png', { query: '?inline', import: 'default', eager: true }),
  Str.slice('/public'.length),
)

const bytesOf = (dataUrl: string): Uint8Array =>
  Result.getOrThrow(Base64.decode(Str.slice(Str.indexOf(',')(dataUrl).pipe(Option.getOrElse(() => -1)) + 1)(dataUrl)))

const homePath = Str.slice(SITE.length)(
  Arr.fromIterable(Str.matchAll(/<meta property="og:image" content="([^"]*)" \/>/g)(INDEX))[0]?.[1] ?? '',
)

const expected: ReadonlyArray<readonly [string, CardText]> = [
  [homePath, { ...HOME_CARD, dek: THESES[0] }],
  ...Arr.flatMap(PUBLISHED, post =>
    Option.match(Option.fromNullishOr(post.image), {
      onNone: () => [],
      onSome: image => [
        [
          image.path,
          { kicker: POST_KICKER, title: post.title, dek: post.summary, corner: BLOG.read(minutesOf(post)) },
        ] as const,
      ],
    }),
  ),
]

layer(Digest.layerWebCrypto)('share cards', it => {
  for (const [path, text] of expected) {
    describe(path, () =>
      Option.match(Rec.get(CARDS, path), {
        onNone: () =>
          it('was made by the card script', () => {
            assert.fail(`${path} isn't in src/seo/cards.json. Make it with \`bun run card\`.`)
          }),
        onSome: made => {
          it.effect('says what the page says now', () =>
            Effect.gen(function* () {
              const stamp = yield* stampOf(text)
              assert.strictEqual(
                made.stamp,
                stamp,
                `${path} is out of date: its words, read time or layout changed. Make it again with \`${made.made}\`.`,
              )
            }),
          )

          it.effect('is the PNG the card script wrote', () =>
            Effect.gen(function* () {
              const png = Rec.get(PNGS, path)
              assert.isTrue(Option.isSome(png), `${path} isn't in public/og.`)
              const hash = yield* png.pipe(Option.getOrThrow, bytesOf, pngHashOf)
              assert.strictEqual(
                made.png,
                hash,
                `${path} isn't the PNG the card script recorded. Make it again with \`${made.made}\`.`,
              )
            }),
          )
        },
      }),
    )
  }

  it('records only cards the site ships', () => {
    assert.sameMembers(
      Rec.keys(CARDS),
      Arr.map(expected, ([path]) => path),
    )
  })
})
