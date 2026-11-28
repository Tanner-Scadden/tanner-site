import { Option } from 'effect'

import { makeAnimation } from '../../animation/Animation.ts'
import { worldOfAim } from '../../animation/kit.ts'
import { type Interaction, type Scene, rememberLast } from '../../animation/scene.ts'
import {
  MAX_PRESSES,
  SETTLE,
  SWITCHBOARD_DOTS,
  SWITCHBOARD_LINES,
  buildSwitchboard,
  switchboardMarks,
  withReader,
} from './switchboard.ts'
import { projection } from './world.ts'

const worldOf = worldOfAim(projection)

export const callingScene: Scene = {
  variants: [
    {
      id: 'switchboard',
      label: 'SWITCHBOARD',
      caption:
        'Every cord is someone who knows your work. Enough of them, and a call you never expected will come.',
      tone: 'hi',
    },
  ],
  run: (_variant, seed) => {
    const board = buildSwitchboard(seed)
    const cords = rememberLast((interactions: ReadonlyArray<Interaction>) => withReader(board, interactions, worldOf))
    return {
      end: board.end,
      marksAt: (time, width, height, pointer, interactions, held = Option.none()) =>
        switchboardMarks(board, cords(interactions), time, width, height, pointer, held),
    }
  },
  maxLines: SWITCHBOARD_LINES,
  maxDots: SWITCHBOARD_DOTS,
  interact: { hint: 'Grab a cord by its end and pull it out, or plug it in somewhere else', settle: SETTLE, max: MAX_PRESSES },
  drag: true,
  once: true,
}

export const CallingHero = makeAnimation('CallingHero', callingScene, { hero: true })
