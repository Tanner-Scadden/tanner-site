import { ELSEWHERE, type Link } from './home.ts'
import { MUNCH_MANOR_URL } from './manor.ts'

// NOTE: what `tanner.hello()` prints in the console. The art is ANSI Shadow.
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
  "Thanks for poking around. I'm Tanner, and I build engines",
  "out of other people's rules. Say hi anytime:",
]

// The value `tanner.hello()` returns, shown last in the console.
export const HELLO = 'gg, thanks for stopping by'
