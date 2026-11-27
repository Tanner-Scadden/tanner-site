import type { EggId } from '#domain/Egg'

export const EGG_NAMES: Record<EggId, string> = {
  manor: 'The Manor',
  worlds: 'Playing days',
  thesis: 'Simplified',
  konami: 'The horde',
  console: 'Devtools',
  print: 'Paper copy',
  gpu: 'Drafting pens',
  teddy: 'Play time',
}

// NOTE: hover hints for the EGGS counter, like a quest log. Each one points
// at where to look without giving the egg away.
export const EGG_HINTS: Record<EggId, string> = {
  manor: 'Every blueprint has a door. Check the bottom corner.',
  worlds: 'Read about my personal life. One phrase leads somewhere.',
  thesis: 'The big line up top could be simpler. Give it a click.',
  konami: 'Old games had a secret code. It starts ↑ ↑ ↓ ↓.',
  console: 'Developers, open your tools. Someone left a note.',
  print: 'Some things only show up on paper.',
  gpu: 'Look at what this site is built with. One of them can draw.',
  teddy: 'Someone in the house wants to play. Go say hi.',
}
