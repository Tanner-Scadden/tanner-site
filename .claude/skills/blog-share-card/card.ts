import { BunRuntime, BunServices } from '@effect/platform-bun'
import { Array as Arr, Console, Effect, FileSystem, Layer, Option, Schema, String as Str, pipe } from 'effect'
import { Argument, Command, Flag } from 'effect/cli'
import { Digest } from 'effect/crypto'
import { type Browser, type Locator, type Page, chromium } from 'playwright-core'

import { THESES } from '../../../src/content/home.ts'
import {
  ART,
  type Card,
  Cards,
  HOME_CARD,
  POST_KICKER,
  cardHtml,
  pngHashOf,
  stampOf,
} from '../../../src/seo/card.ts'

const CARDS_JSON = 'src/seo/cards.json'

class BrowserError extends Schema.TaggedError<BrowserError>()('BrowserError', { cause: Schema.Unknown }) {}
class NotDrawn extends Schema.TaggedError<NotDrawn>()('NotDrawn', { what: Schema.String }) {}

const use = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: cause => new BrowserError({ cause }) })

const browser = Effect.acquireRelease(
  use(() => chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] })),
  (b: Browser) => Effect.promise(() => b.close()),
)

const pause = (page: Page, ms: number) => use(() => page.waitForTimeout(ms))

const shootClear = (page: Page, canvas: Locator, what: string) =>
  Effect.gen(function* () {
    yield* use(() =>
      page.addStyleTag({
        content:
          '*, *::before, *::after { background: transparent !important; box-shadow: none !important; border-color: transparent !important }',
      }),
    )
    yield* use(() =>
      canvas.evaluate(mine => {
        for (const c of document.querySelectorAll('canvas')) if (c !== mine) c.style.visibility = 'hidden'
      }),
    )
    yield* pause(page, 150)
    const found = yield* use(() => canvas.boundingBox())
    const box = yield* Option.match(Option.fromNullishOr(found), {
      onNone: () => Effect.fail(new NotDrawn({ what })),
      onSome: Effect.succeed,
    })
    const png = yield* use(() => page.screenshot({ clip: box, omitBackground: true }))
    return { png, width: box.width, height: box.height }
  })

const CardsJson = Schema.fromJsonString(Cards, { space: 2 })
const decodeCards = Schema.decodeUnknownEffect(CardsJson)
const encodeCards = Schema.encodeEffect(CardsJson)

const record = (path: string, entry: Cards[string]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const cards = yield* fs.readFileString(CARDS_JSON).pipe(Effect.flatMap(decodeCards))
    const next = { ...cards, [path]: entry }
    const json = yield* encodeCards(next)
    yield* fs.writeFileString(CARDS_JSON, `${json}\n`)
    yield* Console.log(`Recorded ${path} in ${CARDS_JSON}`)
  })

const recordServed = (out: string, entry: Cards[string]) => {
  if (!Str.startsWith('public/')(out)) return Effect.void
  return record(Str.slice('public'.length)(out), entry)
}

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`

const render = (
  url: string,
  out: string,
  made: string,
  contents: (page: Page) => Effect.Effect<Card, BrowserError | NotDrawn>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const b = yield* browser
      const page = yield* use(() => b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 }))
      yield* use(() => page.goto(url, { waitUntil: 'networkidle' }))
      const card = yield* contents(page)
      const sheet = yield* use(() => b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 }))
      yield* use(() => sheet.setContent(cardHtml(card), { waitUntil: 'networkidle' }))
      yield* use(() => sheet.evaluate(() => document.fonts.ready))
      const png = yield* use(() => sheet.locator('.card').screenshot())
      const fs = yield* FileSystem.FileSystem
      yield* fs.writeFile(out, png)
      yield* Console.log(`Wrote ${out}`)
      const stamp = yield* stampOf(card)
      const hash = yield* pngHashOf(png)
      yield* recordServed(out, { made, stamp, png: hash })
    }),
  )

const url = Flag.String('url').pipe(
  Flag.withDescription('The dev server'),
  Flag.withDefault('http://localhost:5199'),
)
const out = Flag.String('out').pipe(Flag.withDescription('Where to write the card'), Flag.optional)

const outFlag = (path: Option.Option<string>): ReadonlyArray<string> =>
  Option.match(path, { onNone: () => [], onSome: given => [`--out ${given}`] })

const readTimeOf = (when: string) =>
  pipe(
    Str.split(when, ' · '),
    Arr.last,
    Option.filter(Str.endsWith('MIN READ')),
    Option.match({
      onNone: () => Effect.fail(new NotDrawn({ what: 'the read time' })),
      onSome: Effect.succeed,
    }),
  )

const post = Command.make(
  'post',
  {
    slug: Argument.String('slug').pipe(
      Argument.withDescription('The post, as in /blog/<slug>'),
      Argument.withSchema(Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))),
    ),
    figure: Flag.Int('figure').pipe(
      Flag.withDescription('Which figure, from 1 in page order, or 0 for a card with no art'),
      Flag.withDefault(1),
    ),
    seek: Flag.Finite('seek').pipe(Flag.withDescription('Where to scrub the figure to first, 0 to 1'), Flag.withDefault(1)),
    interact: Flag.Int('interact').pipe(Flag.withDescription('How many times to press INTERACT'), Flag.withDefault(0)),
    aim: Flag.String('aim').pipe(
      Flag.withDescription('Click the drawing here instead, as x,y fractions of its width and height'),
      Flag.withSchema(Schema.String.check(Schema.isPattern(/^[\d.]+,[\d.]+$/))),
      Flag.optional,
    ),
    wait: Flag.Int('wait').pipe(Flag.withDescription('Milliseconds to let it play before the shot'), Flag.withDefault(2600)),
    artScale: Flag.Finite('art-scale').pipe(
      Flag.withDescription('How big the art is, from 0 to 1, to keep a wide figure clear of the title'),
      Flag.withDefault(1),
    ),
    url,
    out,
  },
  Effect.fn('card.post')(function* (args) {
    const made = Arr.join(
      [
        `bun run card post ${args.slug} --figure ${args.figure} --seek ${args.seek} --interact ${args.interact}`,
        ...Option.match(args.aim, { onNone: () => [], onSome: aim => [`--aim ${aim}`] }),
        `--wait ${args.wait} --art-scale ${args.artScale}`,
        ...outFlag(args.out),
      ],
      ' ',
    )
    yield* render(`${args.url}/blog/${args.slug}`, Option.getOrElse(args.out, () => `public/og/${args.slug}.png`), made, page =>
      Effect.gen(function* () {
        const text = (selector: string) =>
          use(() => page.locator(selector).textContent()).pipe(
            Effect.map(found => Option.getOrElse(Option.fromNullishOr(found), () => '')),
          )
        const title = yield* text('article > header h1')
        const summary = yield* text('article > header h1 + p')
        const read = yield* readTimeOf(yield* text('article > header p:has(time)'))
        const figures = yield* use(() =>
          page.$$eval('figure:has(canvas)', all =>
            all.map((f, i) => `${i + 1}: ${f.querySelector('[aria-label^="Interact"]')?.getAttribute('aria-label') ?? 'figure'}`),
          ),
        )
        yield* Console.log(`Figures: ${Arr.join(figures, ' | ') || 'none'}`)
        if (args.figure <= 0) return { kicker: POST_KICKER, title, dek: summary, corner: read, art: Option.none() }

        const figure = page.locator('figure:has(canvas)').nth(args.figure - 1)
        yield* use(() => figure.scrollIntoViewIfNeeded())
        yield* pause(page, 800)
        const slider = figure.locator('input[type="range"]')
        if ((yield* use(() => slider.count())) > 0) {
          yield* use(() =>
            slider.evaluate((el: HTMLInputElement, seek: number) => {
              el.value = String(Math.round(Number(el.max) * seek))
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
            }, args.seek),
          )
        }
        yield* pause(page, 300)
        const canvas = figure.locator('canvas')
        const box = yield* use(() => canvas.boundingBox())
        const press = Option.match(args.aim, {
          onNone: () => use(() => figure.locator('button[aria-label^="Interact"]').click()),
          onSome: aim => {
            const [x, y] = Arr.map(Str.split(aim, ','), Number)
            return use(() => canvas.click({ position: { x: (box?.width ?? 0) * x, y: (box?.height ?? 0) * y } }))
          },
        })
        for (let k = 0; k < args.interact; k++) yield* press
        yield* pause(page, args.wait)
        yield* use(() => figure.locator('button[aria-label="Pause"]').click({ timeout: 500 })).pipe(Effect.ignore)
        const shot = yield* shootClear(page, canvas, `figure ${args.figure}`)
        return {
          kicker: POST_KICKER,
          title,
          dek: summary,
          corner: read,
          art: Option.some({ src: dataUrl(shot.png), width: ART.width * args.artScale, height: ART.height * args.artScale }),
        }
      }),
    )
  }),
).pipe(
  Command.withDescription('A post’s card: its title and summary beside one of its figures'),
  Command.withExamples([
    {
      command: 'card post be-someone-worth-calling --figure 2 --interact 1',
      description: 'The network after one bad interaction',
    },
  ]),
)

const home = Command.make(
  'home',
  {
    wait: Flag.Int('wait').pipe(Flag.withDescription('Milliseconds to let the house rise'), Flag.withDefault(4000)),
    url,
    out,
  },
  Effect.fn('card.home')(function* (args) {
    const made = Arr.join([`bun run card home --wait ${args.wait}`, ...outFlag(args.out)], ' ')
    yield* render(`${args.url}/`, Option.getOrElse(args.out, () => 'public/og/home.png'), made, page =>
      Effect.gen(function* () {
        yield* pause(page, args.wait)
        const shot = yield* shootClear(page, page.locator('figure[data-gpu] canvas'), 'the house')
        const scale = Math.min(640 / shot.width, 500 / shot.height)
        return {
          ...HOME_CARD,
          dek: THESES[0],
          art: Option.some({
            src: dataUrl(shot.png),
            width: Math.round(shot.width * scale),
            height: Math.round(shot.height * scale),
          }),
        }
      }),
    )
  }),
).pipe(Command.withDescription('The site’s card: the name, the line up top, and the house'))

Command.make('card').pipe(
  Command.withDescription('Render a 2400×1260 share card from the dev server'),
  Command.withSubcommands([post, home]),
  Command.run({ version: '1.0.0' }),
  Effect.provide(Layer.mergeAll(BunServices.layer, Digest.layerWebCrypto)),
  BunRuntime.runMain,
)
