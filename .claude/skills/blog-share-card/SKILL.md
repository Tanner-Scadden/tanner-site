---
name: blog-share-card
description: "Use when a blog post on this site needs its share card (the og:image / twitter:image shown when a link is posted): when the author asks for an OG image, social card, share image or link preview for a post, or a post is about to go up without one. Also when the site's own card is stale, say after the home page's copy or house changes. Renders a 2400×1260 card of the post's title and summary beside one of its own figures at a moment that tells the post's story, and wires it in."
---

# Blog share card

A post's share card is what people see before they click. It should look
like the site (the blueprint, Archivo and Space Mono, the gold) and show
the post's idea at a glance, using the post's own figure rather than new
art. `card.ts`, next to this file, does the rendering. Your job is to pick
the moment and wire the card in.

## 1. Pick the moment with the author

A figure's best frame for a card is rarely its first one. Look at the
post's figures and what each one is saying, then offer two or three
moments through the AskUserQuestion UI. For example:

- the finished run (`--seek 1`), when the end state is the point
- the end state after one INTERACT (`--interact 1 --wait <settle in ms>`),
  when the post is about what one action does, such as a network after
  one bad interaction, with the torn branch dimmed and pulled away
- the post's hero, when it has one: it's figure 1, has no controls and
  plays once, so give `--wait` long enough for it to finish. Be Someone
  Worth Calling uses its switchboard, lit after the call is answered,
  which takes about 15 seconds: `--wait 17500 --art-scale 0.85`
- a moment mid-interaction (`--wait` shorter than the settle), when the
  break itself is the story. It's more dramatic, but it can read as
  unfinished at thumbnail size
- no figure (`--figure 0`), when the post has none, or none reads small

Use the post's real title, summary and read time: the script reads them
from the page, so there's no new copy to write or approve. The read time
goes in the bottom right, so remake the card whenever any of the three
change.

## 2. Render it

Start the dev server if it isn't running (`bun run dev --port 5199`), then:

```sh
bun run card post <slug> --figure 2 --interact 1 --wait 2600
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--figure` | Which figure, counting from 1 in page order. `0` gives a card with no art. | `1` |
| `--seek` | Where to scrub to first, from 0 to 1. | `1` |
| `--interact` | How many times to press INTERACT. | `0` |
| `--aim x,y` | Click the drawing there instead of pressing the button, as fractions of its width and height. | none |
| `--wait` | Milliseconds to let it play before the shot. | `2600` |
| `--art-scale` | How big the art is, from 0 to 1. Shrink a wide figure until the title stops covering it. | `1` |
| `--out` | Where to write the card. | `public/og/<slug>.png` |
| `--url` | The dev server. | `http://localhost:5199` |

`bun run card --help`, or `bun run card post --help`, lists them too. The
script is an Effect CLI (`effect/cli`) run on Bun.

The script logs the post's figures by what their INTERACT does, so you can
check `--figure` points at the right one. It needs Google Chrome installed,
since it drives Chrome through `playwright-core`.

Open the PNG and look at it before showing anyone. Check that:

- the title doesn't cover the figure's focal point. If it does, try
  `--art-scale`: Be Someone Worth Calling's switchboard needs `0.85`
- the moment reads at small sizes: squint, or view it at 400px wide
- nothing from the page leaked in, such as the paper grid or controls

Re-render with different flags until it's right, then show the author the
image.

## 3. Wire it in

Set `image` on the post:

```ts
image: {
  path: '/og/<slug>.png',
  alt: '<Title>: <what the card shows, in plain words>.',
},
```

The alt text should describe the picture, not repeat the summary. The
build puts the card in `og:image`, `twitter:image`, both alt tags and the
JSON-LD. A test fails if the file isn't in `public/og/` or the alt is
empty.

## 4. Ship it

Follow the repo's rules: no em dashes in the alt text, curly apostrophes,
and no notes or scratch files committed. Run `bun run typecheck`,
`bun run lint`, `bun run test` and `bun run build`. Check that
`dist/blog/<slug>.html` names the card, then commit the PNG,
`src/seo/cards.json` and the post change together.

## Keeping cards current

Each time the script writes a card, it records it in `src/seo/cards.json`
by the path it's served at: the command that made it, a stamp, and the
PNG's sha256. The stamp is the sha256 of the card's layout
(`cardHtml` in `src/seo/card.ts`) filled in with its words: kicker, title,
summary and the read time or address in the corner. The art isn't part of
it.

`src/seo/card.test.ts` runs in CI. It fails when:

- a shipped card has no record. Make it with the script.
- the stamp no longer matches. The title, summary, read time or the card's
  layout changed since the card was made. Run the `made` command the
  failure prints, which reproduces the card with the same flags.
- the PNG isn't the one the script wrote. Don't edit cards by hand.
- `cards.json` names a card the site no longer ships. Delete that entry.

It can't see a change to a figure's drawing, so remake a card by hand
when the figure it shows changes.

## The site's own card

The home page, /blog and posts without a card share the site's card,
`public/og/home.png`. It shows the name, the line up top (`THESES[0]` in
`src/content/home.ts`) and the house. When any of those change, remake it:

```sh
bun run card home
```

Then update the alt text in both places it lives, `index.html` (both
`image:alt` tags) and `IMAGE` in `src/seo/head.ts`. A test fails if they
disagree. Link previews are cached by image URL, so if an old card needs
to stop showing, give the new one a new file name. Change it everywhere
`index.html` names it (Open Graph, Twitter and the JSON-LD) and in
`IMAGE`. A test fails if `index.html` names a card that isn't in
`public/`.
