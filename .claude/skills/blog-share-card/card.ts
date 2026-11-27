// Renders a post's share card, 1200 by 630, into public/og/<slug>.png: the
// post's title and summary on the blueprint, beside one of its figures at
// a chosen moment. Run against the dev server, so the figure is the real
// one, drawn by the real painter:
//
//   bun run dev --port 5199
//   bun run card <slug> [--figure 1] [--seek 1] [--interact 0] [--aim x,y] [--wait 2600]
//
// --figure  which figure on the page, from 1, or 0 for a card with no art
// --seek    where to scrub the figure to first, 0 to 1
// --interact  how many times to press INTERACT, or click the drawing with --aim
// --aim     where to click the drawing, as fractions of its width and height
// --wait    milliseconds to let it play before the shot
// --url     the dev server, http://localhost:5199 by default
import { parseArgs } from 'node:util'

import { Effect, Option, Schema } from 'effect'
import { type Browser, type Page, chromium } from 'playwright-core'

const Args = Schema.Struct({
  slug: Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  figure: Schema.NumberFromString,
  seek: Schema.NumberFromString,
  interact: Schema.NumberFromString,
  aim: Schema.optional(Schema.String.check(Schema.isPattern(/^[\d.]+,[\d.]+$/))),
  wait: Schema.NumberFromString,
  url: Schema.String,
  out: Schema.String,
})

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    figure: { type: 'string', default: '1' },
    seek: { type: 'string', default: '1' },
    interact: { type: 'string', default: '0' },
    aim: { type: 'string' },
    wait: { type: 'string', default: '2600' },
    url: { type: 'string', default: 'http://localhost:5199' },
    out: { type: 'string' },
  },
})

const browser = Effect.acquireRelease(
  Effect.promise(() => chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] })),
  (b: Browser) => Effect.promise(() => b.close()),
)

const pause = (page: Page, ms: number) => Effect.promise(() => page.waitForTimeout(ms))

// The figure at the moment asked for, on a clear background, as PNG bytes.
const shootFigure = (page: Page, args: typeof Args.Type) =>
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
    yield* pause(page, args.wait)
    yield* Effect.promise(() => figure.locator('button[aria-label="Pause"]').click({ timeout: 500 }).catch(() => {}))
    // Only the figure's own drawing: no page background, no paper canvas.
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
    return yield* Effect.promise(() => canvas.screenshot({ omitBackground: true }))
  })

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const cardHtml = (title: string, summary: string, art: Option.Option<string>) => `<!doctype html>
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
  .art{position:absolute;right:46px;top:56px;width:720px;height:405px}
  .text{position:absolute;left:78px;top:78px;bottom:78px;width:${Option.isSome(art) ? 560 : 1000}px;display:flex;flex-direction:column}
  .kicker{font-family:'Space Mono',monospace;font-weight:700;font-size:20px;letter-spacing:.18em;color:#ffd166}
  h1{margin:22px 0 0;font-weight:900;font-stretch:125%;font-size:70px;line-height:.95;letter-spacing:.01em;text-transform:uppercase;color:#cfe0f6;text-shadow:0 2px 24px #0f3b78,0 0 40px #0f3b78}
  .dek{margin-top:auto;max-width:600px;display:flex;gap:16px;font-family:'Space Mono',monospace;font-size:22px;line-height:1.4;color:rgba(220,235,255,.9)}
  .dek::before{content:'';flex:0 0 3px;background:#ffd166}
  .site{position:absolute;right:72px;bottom:62px;font-family:'Space Mono',monospace;font-weight:700;font-size:16px;letter-spacing:.22em;color:#ffd166}
</style></head>
<body><div class="card">
  ${Option.match(art, { onNone: () => '', onSome: src => `<img class="art" src="${src}">` })}
  <div class="frame"></div>
  <div class="text">
    <div class="kicker">TANNER SCADDEN · BLOG</div>
    <h1>${escape(title)}</h1>
    <div class="dek">${escape(summary)}</div>
  </div>
  <div class="site">TANNERSCADDEN.COM</div>
</div></body></html>`

const program = Effect.gen(function* () {
  const args = yield* Schema.decodeUnknownEffect(Args)({
    ...values,
    slug: positionals[0],
    out: values.out ?? `public/og/${positionals[0]}.png`,
  })
  const b = yield* browser
  const page = yield* Effect.promise(() =>
    b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 }),
  )
  yield* Effect.promise(() => page.goto(`${args.url}/blog/${args.slug}`, { waitUntil: 'networkidle' }))
  // The title and summary as the post shows them.
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
      ? Option.some(`data:image/png;base64,${(yield* shootFigure(page, args)).toString('base64')}`)
      : Option.none<string>()

  const card = yield* Effect.promise(() => b.newPage({ viewport: { width: 1200, height: 630 } }))
  yield* Effect.promise(() => card.setContent(cardHtml(title, summary, art), { waitUntil: 'networkidle' }))
  yield* Effect.promise(() => card.evaluate(() => document.fonts.ready))
  yield* Effect.promise(() => card.locator('.card').screenshot({ path: args.out }))
  yield* Effect.log(`Wrote ${args.out}`)
})

Effect.runPromise(Effect.scoped(program))
