import { ELSEWHERE, type Link } from './home.ts'
import { MUNCH_MANOR_URL } from './manor.ts'

export const HELLO_ART: ReadonlyArray<string> = [
  '██╗  ██╗██╗██╗',
  '██║  ██║██║██║',
  '███████║██║██║',
  '██╔══██║██║╚═╝',
  '██║  ██║██║██╗',
  '╚═╝  ╚═╝╚═╝╚═╝',
]

export const HELLO_LINKS: ReadonlyArray<Link> = [
  ...ELSEWHERE,
  { label: 'play', href: MUNCH_MANOR_URL },
]

export const HELLO_NOTE: ReadonlyArray<string> = [
  "Thanks for poking around. I'm Tanner, and I like to build",
  'things. Say hi anytime:',
]

export const HELLO = 'gg, thanks for stopping by'
