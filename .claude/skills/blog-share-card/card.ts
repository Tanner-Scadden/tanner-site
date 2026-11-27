// Renders a share card, 1200 by 630, on the blueprint: a post's title and
// summary beside one of its figures at a chosen moment, into
// public/og/<slug>.png, or with --home, the site's own card beside the
// house, into public/og/home.png. Run against the dev server, so the drawing is
// the real one, by the real painter:
//
//   bun run dev --port 5199
//   bun run card <slug> [--figure 1] [--seek 1] [--interact 0] [--aim x,y] [--wait 2600]
//   bun run card --home [--wait 4000]
//
// --figure  which figure on the page, from 1, or 0 for a card with no art
// --seek    where to scrub the figure to first, 0 to 1
// --interact  how many times to press INTERACT, or click the drawing with --aim
// --aim     where to click the drawing, as fractions of its width and height
// --wait    milliseconds to let it play before the shot
// --url     the dev server, http://localhost:5199 by default
import { parseArgs } from 'node:util'

import { Effect, Option, Schema } from 'effect'
import { type Browser, type Locator, type Page, chromium } from 'playwright-core'

import { THESES } from '../../../src/content/home.ts'

const Args = Schema.Struct({
  home: Schema.Boolean,
  slug: Schema.optional(Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))),
  figure: Schema.NumberFromString,
  seek: Schema.NumberFromString,
  interact: Schema.NumberFromString,
  aim: Schema.optional(Schema.String.check(Schema.isPattern(/^[\d.]+,[\d.]+$/))),
  wait: Schema.optional(Schema.NumberFromString),
  url: Schema.String,
  out: Schema.optional(Schema.String),
})
type Args = typeof Args.Type

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    home: { type: 'boolean', default: false },
    figure: { type: 'string', default: '1' },
    seek: { type: 'string', default: '1' },
    interact: { type: 'string', default: '0' },
    aim: { type: 'string' },
    wait: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:5199' },
    out: { type: 'string' },
  },
})

class Usage extends Schema.TaggedError<Usage>()('Usage', { message: Schema.String }) {}

const browser = Effect.acquireRelease(
  Effect.promise(() => chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] })),
  (b: Browser) => Effect.promise(() => b.close()),
)

const pause = (page: Page, ms: number) => Effect.promise(() => page.waitForTimeout(ms))

// What's drawn in `canvas`, and anything laid over it, on a clear
// background: no page paper, no other canvas, no controls.
const shootClear = (page: Page, canvas: Locator) =>
  Effect.gen(function* () {
    yield* Effect.promise(() =>
      page.addStyleTag({
        content:
          '*, *::before, *::after { background: transparent !important; box-shadow: none !important; border-color: transparent !important }',
      }),
    )
    yield* Effect.promise(() =>
      canvas.evaluate(mine => {
        for (const c of document.querySelectorAll('canvas')) if (c !== mine) c.style.visibility = 'hidden'
      }),
    )
    yield* pause(page, 150)
    const box = yield* Effect.promise(() => canvas.boundingBox())
    if (box === null) return yield* new Usage({ message: 'The drawing isn’t on the page.' })
    return yield* Effect.promise(() => page.screenshot({ clip: box, omitBackground: true }))
  })

// A post's figure at the moment asked for.
const shootFigure = (page: Page, args: Args) =>
  Effect.gen(function* () {
    const figure = page.locator('figure:has(canvas)').nth(args.figure - 1)
    yield* Effect.promise(() => figure.scrollIntoViewIfNeeded())
    yield* pause(page, 800)
    const slider = figure.locator('input[type="range"]')
    yield* Effect.promise(() =>
      slider.evaluate((el: HTMLInputElement, seek: number) => {
        el.value = String(Math.round(Number(el.max) * seek))
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }, args.seek),
    )
    yield* pause(page, 300)
    const canvas = figure.locator('canvas')
    const box = yield* Effect.promise(() => canvas.boundingBox())
    for (let k = 0; k < args.interact; k++) {
      yield* Option.match(Option.fromNullishOr(args.aim), {
        onNone: () => Effect.promise(() => figure.locator('button[aria-label^="Interact"]').click()),
        onSome: aim => {
          const [x, y] = aim.split(',').map(Number)
          return Effect.promise(() =>
            canvas.click({ position: { x: (box?.width ?? 0) * x!, y: (box?.height ?? 0) * y! } }),
          )
        },
      })
    }
    yield* pause(page, args.wait ?? 2600)
    yield* Effect.promise(() => figure.locator('button[aria-label="Pause"]').click({ timeout: 500 }).catch(() => {}))
    return yield* shootClear(page, canvas)
  })

interface Card {
  readonly kicker: string
  readonly title: string
  readonly dek: string
  readonly art: Option.Option<{ readonly src: string; readonly width: number; readonly height: number }>
}

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

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
  .text{position:absolute;left:78px;top:78px;bottom:78px;width:${Option.isSome(card.art) ? 560 : 1000}px;display:flex;flex-direction:column}
  .kicker{font-family:'Space Mono',monospace;font-weight:700;font-size:20px;letter-spacing:.18em;color:#ffd166}
  h1{margin:22px 0 0;font-weight:900;font-stretch:125%;font-size:70px;line-height:.95;letter-spacing:.01em;text-transform:uppercase;color:#cfe0f6;text-shadow:0 2px 24px #0f3b78,0 0 40px #0f3b78}
  .dek{margin-top:auto;max-width:600px;display:flex;gap:16px;font-family:'Space Mono',monospace;font-size:22px;line-height:1.4;color:rgba(220,235,255,.9)}
  .dek::before{content:'';flex:0 0 3px;background:#ffd166}
  .site{position:absolute;right:72px;bottom:62px;font-family:'Space Mono',monospace;font-weight:700;font-size:16px;letter-spacing:.22em;color:#ffd166}
</style></head>
<body><div class="card">
  ${Option.match(card.art, {
    onNone: () => '',
    onSome: ({ src, width, height }) => `<img class="art" src="${src}" style="width:${width}px;height:${height}px">`,
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

// A post's card, from its page: its title, its summary, and its figure.
const postCard = (page: Page, args: Args, slug: string) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => page.goto(`${args.url}/blog/${slug}`, { waitUntil: 'networkidle' }))
    const title = yield* Effect.promise(() => page.locator('article > header h1').innerText())
    const summary = yield* Effect.promise(() => page.locator('article > header > p').first().innerText())
    // The post's figures in page order, named by what INTERACT does, so it's
    // easy to tell which number is which.
    const figures = yield* Effect.promise(() =>
      page.$$eval('figure:has(canvas)', all =>
        all.map((f, i) => `${i + 1}: ${f.querySelector('[aria-label^="Interact"]')?.getAttribute('aria-label') ?? 'figure'}`),
      ),
    )
    yield* Effect.log(`Figures: ${figures.join(' | ') || 'none'}`)
    const art =
      args.figure > 0
        ? Option.some({ src: dataUrl(yield* shootFigure(page, args)), width: 720, height: 405 })
        : Option.none()
    return { kicker: 'TANNER SCADDEN · BLOG', title, dek: summary, art } satisfies Card
  })

// The site's card: who it is, the line up top, and the house, risen.
const homeCard = (page: Page, args: Args) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => page.goto(`${args.url}/`, { waitUntil: 'networkidle' }))
    yield* pause(page, args.wait ?? 4000)
    const house = page.locator('figure[data-gpu] canvas')
    const png = yield* shootClear(page, house)
    const box = yield* Effect.promise(() => house.boundingBox())
    // As big as fits beside the title, keeping its shape.
    const scale = Math.min(640 / (box?.width ?? 1), 500 / (box?.height ?? 1))
    const art = Option.some({
      src: dataUrl(png),
      width: Math.round((box?.width ?? 0) * scale),
      height: Math.round((box?.height ?? 0) * scale),
    })
    return { kicker: 'SOFTWARE ENGINEER', title: 'Tanner Scadden', dek: THESES[0], art } satisfies Card
  })

const program = Effect.gen(function* () {
  const args = yield* Schema.decodeUnknownEffect(Args)({ ...values, slug: positionals[0] })
  if (!args.home && args.slug === undefined) {
    return yield* new Usage({ message: 'Name a post, bun run card <slug>, or make the site’s card with --home.' })
  }
  const b = yield* browser
  const page = yield* Effect.promise(() => b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 }))
  const card = args.home ? yield* homeCard(page, args) : yield* postCard(page, args, args.slug!)
  const out = args.out ?? (args.home ? 'public/og/home.png' : `public/og/${args.slug}.png`)

  const sheet = yield* Effect.promise(() => b.newPage({ viewport: { width: 1200, height: 630 } }))
  yield* Effect.promise(() => sheet.setContent(cardHtml(card), { waitUntil: 'networkidle' }))
  yield* Effect.promise(() => sheet.evaluate(() => document.fonts.ready))
  yield* Effect.promise(() => sheet.locator('.card').screenshot({ path: out }))
  yield* Effect.log(`Wrote ${out}`)
})

Effect.runPromise(Effect.scoped(program))
