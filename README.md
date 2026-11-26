# tanner-site

My personal site. Effect UI on Cloudflare, deployed with Alchemy.

```sh
bun install
bun run dev        # http://localhost:5173
bun run typecheck
bun run test
bun run build
```

## Pages

| Path | Page |
| --- | --- |
| `/` | The front page |
| `/manor`, `/manor/trophy`, `/manor/workshop` | The Manor and its rooms (egg) |
| `/rest` | Playing days gallery (egg) |
| anything else | Sheet not found |

Routes are defined in `src/routes.ts`. Build links with `SiteRoute.print`; never write a path by hand.
Escape on a hidden page goes back to `/`. Opening a hidden page straight from its
URL still counts its egg. The deployed Worker serves `index.html` for every path
(`notFoundHandling: 'single-page-application'`), so deep links work.

## Easter eggs

Seven of them, counted in the top bar and saved in localStorage:

1. Door D-13 in the footer opens the Manor (`/manor`).
2. "played them professionally", or typing `rest`, opens the playing days gallery (`/rest`).
3. The Konami code sends the horde.
4. Clicking the thesis line simplifies it.
5. `tanner.hello()` in devtools.
6. Printing the page (it prints as a plain resume).
7. "WebGPU" in the footer turns on the drafting pens.

Gallery photos go in `public/worlds/`; set each slot's `photo` in `src/content.ts`.

## WebGPU

The blueprint grid behind the page is drawn by WebGPU (`src/gpu/`). It bends
slightly around a mouse cursor, and the drafting pens egg runs a compute shader
that moves about a thousand pens along the grid lines. Frames only render while
something moves. Without WebGPU the canvas stays empty and the CSS grid on
`body` shows through; with reduced motion on, nothing animates.

- `shaders.ts`: the WGSL (background, simulation, pens)
- `renderer.ts`: the imperative WebGPU driver
- `Blueprint.ts`: the Effect UI mount that owns the renderer's lifetime

## Deploy

Live at https://tannerscadden.com (the `prod` stage; www redirects to it).
Other stages only get a workers.dev URL.

```sh
cd infra && bun install
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bun alchemy deploy --stage prod
```

Never put tokens in the repo or in `VITE_` variables, and don't connect Cloudflare Workers Builds.
