import { BunRuntime, BunServices } from '@effect/platform-bun'
import { Array as Arr, Console, Effect, FileSystem, Option, Schema, String as Str, pipe } from 'effect'
import { Argument, Command, Flag } from 'effect/cli'
import { type Browser, type Locator, type Page, chromium } from 'playwright-core'

import { THESES } from '../../../src/content/home.ts'

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

interface Card {
  readonly kicker: string
  readonly title: string
  readonly dek: string
  readonly art: Option.Option<{ readonly src: string; readonly width: number; readonly height: number }>
}

const ART = { width: 720, height: 405 } as const

const escape = (text: string) =>
  pipe(text, Str.replaceAll('&', '&amp;'), Str.replaceAll('<', '&lt;'), Str.replaceAll('>', '&gt;'))

const textWidth = (card: Card): number =>
  Option.match(card.art, { onNone: () => 1000, onSome: () => 560 })

const cardHtml = (card: Card) => `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;background:#0f3b78}
  .card{position:relative;width:1200px;height:630px;overflow:hidden;background:#0f3b78;
    background-image:linear-gradient(rgba(200,222,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(200,222,255,.05) 1px,transparent 1px),
    linear-gradient(rgba(200,222,255,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(200,222,255,.12) 1px,transparent 1px);
    background-size:24px 24px,24px 24px,120px 120px,120px 120px;font-family:Archivo,sans-serif}
  .frame{position:absolute;inset:32px;border:2px solid rgba(220,235,255,.75)}
  .frame::after{content:'';position:absolute;inset:5px;border:1px solid rgba(220,235,255,.4)}
  .art{position:absolute;right:46px;top:56px}
  .text{position:absolute;left:78px;top:78px;bottom:78px;width:${textWidth(card)}px;display:flex;flex-direction:column}
  .kicker{font-family:'Space Mono',monospace;font-weight:700;font-size:20px;letter-spacing:.18em;color:#ffd166}
  h1{margin:22px 0 0;font-weight:900;font-stretch:125%;font-size:70px;line-height:.95;letter-spacing:.01em;text-transform:uppercase;color:#cfe0f6;text-shadow:0 2px 24px #0f3b78,0 0 40px #0f3b78}
  .dek{margin-top:auto;max-width:600px;display:flex;gap:16px;font-family:'Space Mono',monospace;font-size:22px;line-height:1.4;color:rgba(220,235,255,.9)}
  .dek::before{content:'';flex:0 0 3px;background:#ffd166}
  .site{position:absolute;right:72px;bottom:62px;font-family:'Space Mono',monospace;font-weight:700;font-size:16px;letter-spacing:.22em;color:#ffd166}
</style></head>
<body><div class="card">
  ${Option.match(card.art, {
    onNone: () => '',
    onSome: ({ src, width, height }) =>
      `<img class="art" src="${src}" style="width:${width}px;height:${height}px;top:${56 + (ART.height - height) / 2}px">`,
  })}
  <div class="frame"></div>
  <div class="text">
    <div class="kicker">${escape(card.kicker)}</div>
    <h1>${escape(card.title)}</h1>
    <div class="dek">${escape(card.dek)}</div>
  </div>
  <div class="site">TANNERSCADDEN.COM</div>
</div></body></html>`

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`

const render = (url: string, out: string, contents: (page: Page) => Effect.Effect<Card, BrowserError | NotDrawn>) =>
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
    }),
  )

const url = Flag.String('url').pipe(
  Flag.withDescription('The dev server'),
  Flag.withDefault('http://localhost:5199'),
)
const out = Flag.String('out').pipe(Flag.withDescription('Where to write the card'), Flag.optional)

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
    yield* render(`${args.url}/blog/${args.slug}`, Option.getOrElse(args.out, () => `public/og/${args.slug}.png`), page =>
      Effect.gen(function* () {
        const title = yield* use(() => page.locator('article > header h1').innerText())
        const summary = yield* use(() => page.locator('article > header p').first().innerText())
        const figures = yield* use(() =>
          page.$$eval('figure:has(canvas)', all =>
            all.map((f, i) => `${i + 1}: ${f.querySelector('[aria-label^="Interact"]')?.getAttribute('aria-label') ?? 'figure'}`),
          ),
        )
        yield* Console.log(`Figures: ${Arr.join(figures, ' | ') || 'none'}`)
        if (args.figure <= 0) return { kicker: 'TANNER SCADDEN · BLOG', title, dek: summary, art: Option.none() }

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
          kicker: 'TANNER SCADDEN · BLOG',
          title,
          dek: summary,
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
    yield* render(`${args.url}/`, Option.getOrElse(args.out, () => 'public/og/home.png'), page =>
      Effect.gen(function* () {
        yield* pause(page, args.wait)
        const shot = yield* shootClear(page, page.locator('figure[data-gpu] canvas'), 'the house')
        const scale = Math.min(640 / shot.width, 500 / shot.height)
        return {
          kicker: 'SOFTWARE ENGINEER',
          title: 'Tanner Scadden',
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
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
)
