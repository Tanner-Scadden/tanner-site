import { Effect, Option, Schema, String as Str, pipe } from 'effect'
import { Digest } from 'effect/crypto'

export interface CardText {
  readonly kicker: string
  readonly title: string
  readonly dek: string
  readonly corner: string
}

export interface Art {
  readonly src: string
  readonly width: number
  readonly height: number
  readonly centre?: number
}

export interface Card extends CardText {
  readonly art: Option.Option<Art>
}

export const POST_KICKER = 'TANNER SCADDEN · BLOG'

export const HOME_CARD = {
  kicker: 'SOFTWARE ENGINEER',
  title: 'Tanner Scadden',
  corner: 'TANNERSCADDEN.COM',
} as const

export const ART = { width: 720, height: 405 } as const

export const CROPPED = { height: 570, centre: 850 } as const

const artHtml = ({ src, width, height, centre }: Art): string =>
  Option.match(Option.fromNullishOr(centre), {
    onNone: () =>
      `<img class="art" src="${src}" style="width:${width}px;height:${height}px;top:${56 + (ART.height - height) / 2}px">`,
    onSome: middle =>
      `<img class="art" src="${src}" style="width:${width}px;height:${height}px;top:${(630 - height) / 2}px;right:auto;left:${middle - width / 2}px">`,
  })

const escape = (text: string) =>
  pipe(text, Str.replaceAll('&', '&amp;'), Str.replaceAll('<', '&lt;'), Str.replaceAll('>', '&gt;'))

const textWidth = (card: Card): number =>
  Option.match(card.art, { onNone: () => 1000, onSome: () => 560 })

export const cardHtml = (card: Card) => `<!doctype html>
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
  .corner{position:absolute;right:72px;bottom:62px;font-family:'Space Mono',monospace;font-weight:700;font-size:16px;letter-spacing:.22em;color:#ffd166}
</style></head>
<body><div class="card">
  ${Option.match(card.art, { onNone: () => '', onSome: artHtml })}
  <div class="frame"></div>
  <div class="text">
    <div class="kicker">${escape(card.kicker)}</div>
    <h1>${escape(card.title)}</h1>
    <div class="dek">${escape(card.dek)}</div>
  </div>
  <div class="corner">${escape(card.corner)}</div>
</div></body></html>`

const sha256 = (bytes: Uint8Array): Effect.Effect<string, never, Digest.Digest> =>
  Effect.gen(function* () {
    const digest = yield* Digest.Digest
    return yield* digest.digestHex(Digest.sha256, bytes)
  })

export const stampOf = (text: CardText): Effect.Effect<string, never, Digest.Digest> =>
  sha256(new TextEncoder().encode(cardHtml({ ...text, art: Option.none() })))

export const pngHashOf = (png: Uint8Array): Effect.Effect<string, never, Digest.Digest> => sha256(png)

export const CardRecord = Schema.Struct({
  made: Schema.String,
  stamp: Schema.String,
  png: Schema.String,
})
export const Cards = Schema.Record(Schema.String, CardRecord)
export type Cards = typeof Cards.Type
