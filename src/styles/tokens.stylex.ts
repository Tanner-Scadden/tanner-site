import * as stylex from '@stylexjs/stylex'

// NOTE: every color, font and breakpoint the site uses lives here. Styles
// import these instead of writing values, so each page's palette is in one
// place and the linter can check every value.

// Each page's paper. The head reads these too, for the browser's
// theme-color, so they're constants rather than variables.
export const paper = stylex.defineConsts({
  blueprint: '#0f3b78',
  manor: '#141022',
  rest: '#07090d',
})

// The blueprint: pale ink on blue paper. Printing turns it into black on
// white, so the page prints as a plain resume.
export const blueprint = stylex.defineVars({
  paper: { default: '#0f3b78', '@media print': '#fff' },
  line: { default: 'rgba(220, 235, 255, 0.9)', '@media print': '#111' },
  dim: { default: 'rgba(220, 235, 255, 0.64)', '@media print': '#555' },
  faint: { default: 'rgba(200, 222, 255, 0.14)', '@media print': '#ddd' },
  grid: 'rgba(200, 222, 255, 0.05)',
  hi: { default: '#ffd166', '@media print': '#111' },
  // The gold, washed over a hovered room.
  wash: 'rgba(255, 209, 102, 0.06)',
  // The heavy rules between sections, lighter on paper.
  rule: { default: 'rgba(220, 235, 255, 0.9)', '@media print': '#bbb' },
  shadow: 'rgba(0, 0, 0, 0.35)',
  focus: '#fff',
})

export const fonts = stylex.defineConsts({
  mono: '"Space Mono", monospace',
  display: 'Archivo, sans-serif',
  pixel: 'Silkscreen, monospace',
  terminal: 'VT323, monospace',
  sans: 'Inter, system-ui, sans-serif',
  // A post's body.
  reading: 'Archivo, system-ui, sans-serif',
})

// Archivo's widths: the display type is set wide.
export const widths = stylex.defineConsts({
  normal: '100%',
  hint: '104%',
  slight: '108%',
  semi: '112%',
  wide: '115%',
  widest: '125%',
})

// A blog post's body: a deeper panel of the blueprint, with brighter ink,
// and its code listings. Printing turns it into black on white too.
export const post = stylex.defineVars({
  paper: { default: '#0b3166', '@media print': 'transparent' },
  ink: { default: '#e9f1ff', '@media print': '#111' },
  inkDim: { default: 'rgba(220, 235, 255, 0.72)', '@media print': '#555' },
  rule: { default: 'rgba(200, 222, 255, 0.22)', '@media print': '#ccc' },
  bright: { default: '#fff', '@media print': '#111' },
  tint: 'rgba(200, 222, 255, 0.1)',
  codePaper: { default: '#072553', '@media print': 'transparent' },
  codeGrid: { default: 'rgba(200, 222, 255, 0.06)', '@media print': 'transparent' },
  copied: '#9be3b0',
  failed: '#ff8a80',
  // Harm, in a blog animation.
  alarm: '#ff6b61',
})

// Shiki's token colors, for the code listings.
export const syntax = stylex.defineConsts({
  comment: 'rgba(200, 222, 255, 0.5)',
  keyword: '#ffd166',
  string: '#9be3b0',
  constant: '#ffb38a',
  function: '#8cc8ff',
  punctuation: 'rgba(220, 235, 255, 0.62)',
})

// NOTE: queries that share a property never overlap. A printed page is
// narrower than 820px, so where a style also has a `print` value, it uses
// the screen-only `narrowScreen` and `sheetScreen`, and paper gets `print`
// alone.
export const media = stylex.defineConsts({
  sheetScreen: '@media screen and (max-width: 1120px)',
  narrow: '@media (max-width: 820px)',
  narrowScreen: '@media screen and (max-width: 820px)',
  phone: '@media (max-width: 640px)',
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
  print: '@media print',
})

// The Manor: Munch Manor's palette.
export const manor = stylex.defineConsts({
  night: '#141022',
  ink: '#1c1426',
  plum: '#3b2a4a',
  plumLit: '#4a3459',
  cream: '#f3e6c8',
  pale: '#f7f0c6',
  lilac: '#bfb2d6',
  gold: '#f3c14b',
  green: '#7ce36b',
  purple: '#8a5bd6',
  red: '#e8443a',
  wood: '#c98a2b',
  // The rooms, while the Manor is broken.
  broken: '#2a0d14',
  shadow: '#000',
})

// Munch Manor's arcade screen: the Workshop board, and the outbreak HUD
// that drops over the front page.
export const arcade = stylex.defineConsts({
  screen: '#140c10',
  text: '#f4f1de',
  panel: '#1c1622',
  muted: '#b8c2b0',
  alarm: '#ff6b5e',
  alarmHi: '#ffe066',
  meter: '#24401a',
  callShadow: '#10240a',
  doorway: '#0b0614',
  tile: '#33264a',
  tileDark: '#2c2040',
  muzzle: '#fff1a8',
  tracer: '#ffd23f',
  held: '#9be36a',
  scanline: 'rgba(0, 0, 0, 0.16)',
})

// Rest: the playing days, a dark esports broadcast.
export const rest = stylex.defineConsts({
  night: '#07090d',
  text: '#e8edf5',
  muted: '#7c879b',
  steel: '#6f7a8f',
  white: '#fff',
  red: '#ff3b4e',
  card: '#0e1219',
  edge: '#1d2431',
  gold: '#ffc24b',
  shade: 'rgba(0, 0, 0, 0.85)',
  shadow: 'rgba(0, 0, 0, 0.5)',
})
