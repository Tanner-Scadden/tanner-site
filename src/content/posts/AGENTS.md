# Writing a blog post

Each post is a sheet in set B, numbered from the oldest: B-01, B-02...
Read this before you write or edit one.

## Before any prose

- Run the `blog-brainstorm` skill first. Agree on the angle and a brief
  with the author before you draft anything. Briefs live in
  `docs/posts/<date>-<slug>-brief.md`, which git ignores: they're working
  notes, so they stay on the author's machine and are never committed.

## The voice

- It's the author's post. Keep their voice: plain, direct, first person,
  short sentences. When they send you a paragraph, tighten it and fix the
  grammar. Don't rewrite it into yours.
- No em dashes anywhere in the copy.
- Use curly quotes and apostrophes (’ “ ”), never `\'` escapes.
- Don't name private people (teammates, coworkers, friends) unless the
  author says to. Public figures, books and companies are fine.
- When you quote a book or a post, keep it short and credit it: the title
  and the author.

## Adding a post

1. Write it in `src/content/posts/<slug>.ts` as a `Post` (see
   `src/domain/Post.ts`):

   ```ts
   import type { Post } from '#domain/Post'

   export const myPost: Post = {
     slug: 'my-post', // the URL: /blog/my-post
     title: 'My post',
     date: '2026-11-27', // YYYY-MM-DD, the day it goes up
     summary: 'One or two sentences for the index.',
     body: h => [h.p('Hello.')],
   }
   ```

2. Add it to `WRITING` in `src/content/blog.ts` while you write it. Drafts
   only show under `bun run dev`, and a build never ships their words.
3. Move it to `PUBLISHED` when it's ready. Order doesn't matter; the blog
   sorts by date, newest first.
4. Give it a share card, so a link to it shows the post and not just the
   site. The `blog-share-card` skill makes one from the post's own figure
   (`bun run card post <slug>`) and sets `image` on the `Post`. Without one it
   shares the site's card.

## What a body can use

The body gets an `h` whose plain tags already carry the post's styles (see
`proseTags` in `src/blog/components/Prose.ts`), so you never style
anything yourself.

- Text:
  - paragraphs are `h.p(...)`
  - section headings are `h.h2`, and smaller ones `h.h3`
  - `h.strong` is bold, set in gold, so use it for lead-ins like the
    habits list
  - `h.em` is italic, for titles and light emphasis
  - `h.code` is inline code
- Links: `h.a.attr('href', url).children('text')`. They open in a new tab,
  since they lead off the site. For a link to another page here, add
  `.attr('target', undefined)` so it opens in place.
- Lists: `h.ul` or `h.ol`, with an `h.li` for each item. Keep items short.
- Quotes: `h.blockquote(h.p('…'), h.p(h.em('Source')))`.
- A rule: `h.hr`.

From `src/blog/components/Prose.ts`:

- `Note(h, 'NOTE', h.p('…'))`: an aside, boxed with a label.
- `Code(h, { lang: 'ts', code, file? })`: a highlighted listing with a
  copy button. The tab shows `file` if given, else the language.
- `Figure(h, { src: '/blog/name.png', alt, caption? })`: an image. Put the
  file in `public/blog/`.

## Animated figures

`src/blog/animation/` is a kit for animated diagrams, and the figures
live in `src/blog/figures/`. `src/blog/figures/network/` is the worked
example.

- A `Scene` (`scene.ts`) only answers "what's on screen at time t", as
  lines, dots and rings in CSS px. So any moment can be scrubbed to, and
  the same answer paints on WebGPU or a 2D canvas.
- `makeAnimation(name, scene)` (`Animation.ts`) wraps a scene in a figure
  with play/pause, restart, a scrubber, the time, an INTERACT button when
  the scene takes interactions, and a caption. An empty caption hides the
  caption. Drop the result into a body:
  `NetworkFigure(h, { key: 'network' })`.
- Shared helpers are in `kit.ts`: the seeded `random`, `clamp01`,
  `smooth`, the sheet's colours with `rgba` and `mix`, and `worldOfAim`.
- Build the timeline once, from a seed, up front, then answer each frame
  from it.
- Keep motion calm. People and things should appear where they'll stay,
  not get shoved around.
- Reduced motion shows only the last frame, so it has to read on its own.
- Use the blueprint palette from `src/styles/tokens.stylex.ts`: the gold
  (`blueprint.hi`) for what matters, and line, dim and faint for the rest.
- Test it like `src/blog/figures/network/graph.test.ts`:
  - the same seed gives the same run
  - it stays inside its bounds and buffer sizes
  - it tells the story you meant

### INTERACT

Readers can add to a figure while it plays. Every figure that takes
interactions has the same button: INTERACT, with a tap icon, after the
time. The figure still tells its own story; the button adds to it.

- Give the scene `interact: { hint, settle, max }`. `hint` says what a
  press does, for the tooltip and screen readers ("Plant another seed").
  `settle` is how many seconds it takes to play out. `max` is the most a
  run takes, so the buffers still hold. Once a run has `max`, the button
  is disabled and a click on the drawing changes nothing.
- The kit records each press as the clock time it happened, and passes
  them all, in order, as the last argument to `shapesAt(time, width,
  height, pointer, interactions)`. Show only the ones up to `time`, so
  scrubbing back shows the world without them. Restart, a new variant and
  the next seed clear them.
- Work out what they do once per array with `rememberLast`, then answer
  frames from that, so each frame stays pure and cheap. The figures fold
  them into the timeline: `tearsOf` (network), `plantedIn` (forest),
  `withKicks` (team).
- Clicking the drawing interacts too, aimed there. `aim` is a 0 to 1
  fraction of the canvas, which is always 16:9, so convert it with the
  scene's projection at any 16:9 size. A press of the button has no aim,
  so the scene picks a sensible target.
- Pressing while paused applies at the paused time and plays on. Past the
  end, it goes in at the end, and the hold waits `settle` seconds for it
  to play out before the next run. Keep `shapesAt` answering past `end`,
  so a late press can play out. Under reduced motion the figure stays
  still: the press goes in `settle` seconds before the still frame, which
  repaints with it done.
- Decide whether it's a good or a bad interaction, and draw it that way.
  Bad ones use the post's red (`post.alarm`, `#ff6b61`), and only for the
  harm itself.
- Test that a press shows nothing before its time, that it does what you
  meant after, and that the bounds and buffer sizes hold at `max` presses,
  spread out and all at the same moment, in a `scene.test.ts` beside the
  scene, like each figure's.

## Its source is public

Every post ends with a link to its file on GitHub, so readers can see how
it's built. The link comes from the slug, so keep the file at
`src/content/posts/<slug>.ts`, or set `source` on the `Post` if it lives
elsewhere. A test fails if the file isn't there. Readers will follow the
imports into the figures too, so the code ships clean: no `NOTE` or `TODO`
comments, no notes to yourself, and no drafts or briefs in the repo.

## Before it goes up

Run `bun run typecheck`, `bun run lint`, `bun run test` and
`bun run build`, then look at the post under `bun run dev`. Check it at
phone width too.
