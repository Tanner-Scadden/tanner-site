import type { RoomId } from '#domain/Room'

export const MUNCH_MANOR_URL = 'https://munchmanor.com'

export const ROOM_NAMES: Record<RoomId, string> = {
  parlour: 'PARLOUR',
  trophy: 'TROPHY ROOM',
  workshop: 'WORKSHOP',
}

export const ROOM_TAGS: Record<RoomId, string> = {
  parlour: 'THE GAME',
  trophy: 'WHERE IT CAME FROM',
  workshop: "HOW IT'S BUILT",
}

export const RATTLES_SAYS: Record<RoomId, string> = {
  parlour:
    "Oh! A visitor. Most people stay on the drawings. This is Munch Manor, his game. Have a look around, just don't touch anything sticky.",
  trophy:
    "These aren't his trophies. They're the games that made this one. He talks about them a lot more than the real ones.",
  workshop:
    "This is where Munch Manor gets built. I run the shop. Try the machine: same seed, same run, every time. Same zombies too, sorry.",
}

export const RATTLES_UPSET = 'STOP CUTTING ME OFF!'

export const PARLOUR_SAYS: ReadonlyArray<string> = [
  'Munch Manor is a goofy, gory pixel zombie shooter that runs in a browser tab. You and up to three friends hold a haunted manor through 8 waves of the dead, then face Uncle Chunk. Try not to get eaten.',
  "There's nothing to install. Send a link and you're playing together in a minute, on a laptop or on your phone.",
]

export interface Fact {
  readonly label: string
  readonly value: string
}

export const PARLOUR_FACTS: ReadonlyArray<Fact> = [
  { label: 'PLAYERS', value: 'Up to 4' },
  { label: 'INSTALL', value: 'None' },
  { label: 'RUNS ON', value: 'Any browser' },
  { label: 'COSTS', value: 'Free' },
]

export const TROPHY_SAYS: ReadonlyArray<string> = [
  'I grew up playing Zombie Estate II and Call of Duty Zombies with friends. Munch Manor is me trying to bring that feeling back: a quick game you can start with friends from anywhere.',
  "It's a family project, built for playing with family and friends.",
  "It's also my excuse to learn. I wanted to dive deeper into Effect, Foldkit and Alchemy.",
]

export interface Plaque {
  readonly name: string
  readonly note: string
}

export const SHELF: ReadonlyArray<Plaque> = [
  { name: 'ZOMBIE ESTATE II', note: 'Where it started' },
  { name: 'COD ZOMBIES', note: 'Round after round with friends' },
  { name: 'EFFECT', note: 'The excuse to learn' },
]

export const TROPHY_REST = 'Looking for my actual trophies? They live over here.'

export const WORKSHOP_SAYS: ReadonlyArray<string> = [
  'Munch Manor is a deterministic simulation. The server runs the same game as every player, step for step, so everyone agrees on what happened, even on a phone with a bad connection. Any run can be replayed from its seed.',
  "The machine up top is a tiny version of the idea, using the game's own crew and zombies: four survivors, four waves and a seed. Replay it as many times as you like. Every shot lands the same way and the run hash never changes. Pick a new seed and you get a whole new run.",
]

export const WORKSHOP_STACK = 'TypeScript and Effect, on Cloudflare.'
