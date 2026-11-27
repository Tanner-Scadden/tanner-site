import * as stylex from '@stylexjs/stylex'

// NOTE: every color, font and breakpoint the site uses lives here. Styles
// import these instead of writing values, so a page's palette is in one place.

// The blueprint: pale ink on blue paper. Printing turns it into black on
// white, so the page prints as a plain resume.
export const blueprint = stylex.defineVars({
  paper: { default: '#0f3b78', '@media print': '#fff' },
  line: { default: 'rgba(220, 235, 255, 0.9)', '@media print': '#111' },
  dim: { default: 'rgba(220, 235, 255, 0.64)', '@media print': '#555' },
  faint: { default: 'rgba(200, 222, 255, 0.14)', '@media print': '#ddd' },
  grid: 'rgba(200, 222, 255, 0.05)',
  hi: { default: '#ffd166', '@media print': '#111' },
  // The heavy rules between sections, lighter on paper.
  rule: { default: 'rgba(220, 235, 255, 0.9)', '@media print': '#bbb' },
  shadow: 'rgba(0, 0, 0, 0.35)',
})

export const fonts = stylex.defineConsts({
  mono: '"Space Mono", monospace',
  display: 'Archivo, sans-serif',
  pixel: 'Silkscreen, monospace',
  terminal: 'VT323, monospace',
  sans: 'Inter, system-ui, sans-serif',
})

// NOTE: `print` comes last wherever it's used, so on paper it wins over
// `narrow` (a printed page is narrower than 820px).
export const media = stylex.defineConsts({
  sheet: '@media (max-width: 1120px)',
  narrow: '@media (max-width: 820px)',
  phone: '@media (max-width: 640px)',
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
  print: '@media print',
})

// The Manor: the Munch Manor palette, and the outbreak's wave call uses it too.
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
  screen: '#140c10',
  wood: '#c98a2b',
})

// Rest: the playing days, a dark esports broadcast.
export const rest = stylex.defineConsts({
  night: '#07090d',
  text: '#e8edf5',
  muted: '#7c879b',
  red: '#ff3b4e',
  card: '#0e1219',
  edge: '#1d2431',
  gold: '#ffc24b',
})
