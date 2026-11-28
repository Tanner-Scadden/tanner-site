import { makeAnimation } from '../../animation/Animation.ts'
import { type Interaction, type Scene, rememberLast } from '../../animation/scene.ts'
import {
  MAX_PRESSES,
  PHONE_DOTS,
  PHONE_LINES,
  SETTLE,
  buildPhone,
  foundEgg,
  phoneMarks,
  withReader,
} from './phone.ts'

export const callingScene: Scene = {
  variants: [
    {
      id: 'phone',
      label: 'THE CALL',
      caption: '',
      description: 'A phone fills with contacts, faster as the list grows, until one of the oldest calls.',
      tone: 'hi',
    },
  ],
  run: (_variant, seed) => {
    const phone = buildPhone(seed)
    const calls = rememberLast((interactions: ReadonlyArray<Interaction>) => withReader(phone, interactions))
    return {
      end: phone.end,
      marksAt: (time, width, height, _pointer, interactions) =>
        phoneMarks(phone, calls(interactions), time, width, height),
      foundEgg: interactions => foundEgg(calls(interactions)),
    }
  },
  maxLines: PHONE_LINES,
  maxDots: PHONE_DOTS,
  interact: { hint: 'Answer the call, or decline it', settle: SETTLE, max: MAX_PRESSES },
  once: true,
}

export const CallingHero = makeAnimation('CallingHero', callingScene, { hero: true })
