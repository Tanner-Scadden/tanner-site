import type { Html } from '@effect/ui/html'
import { Array as Arr } from 'effect'

import { EGG_HINTS, EGG_NAMES } from '#content/eggs'
import { EGG_COUNT, EggId } from '#domain/Egg'

import type { EggsState } from '../machines/Eggs.ts'

// NOTE: the EGGS counter in the top bar. Hovering or focusing it opens the
// quest log: found eggs by name, hidden ones as a hint.
export const EggCounter = <M>(h: Html.H<M>, eggs: EggsState) =>
  h.span
    .class('eggs', eggs.found.length > 0 && 'got')
    .attrs({ tabindex: '0', 'aria-describedby': 'quest-log' })
    .children(`EGGS ${eggs.found.length}/${EGG_COUNT}`, QuestLog(h, eggs))

const QuestLog = <M>(h: Html.H<M>, eggs: EggsState) =>
  h.div
    .class('log')
    .attrs({ id: 'quest-log', role: 'tooltip' })
    .children(
      h.div
        .class('log-head')
        .children(
          eggs._tag === 'AllFound'
            ? 'ALL FOUND. THANKS FOR LOOKING AROUND.'
            : `QUEST LOG · ${eggs.found.length} OF ${EGG_COUNT} FOUND`,
        ),
      h.ol(
        ...Arr.map(EggId.literals, egg =>
          eggs.found.includes(egg)
            ? h.li.class('done').children(h.b('✓'), h.span(EGG_NAMES[egg]))
            : h.li(h.b('?'), h.span(h.em('???'), h.small(EGG_HINTS[egg]))),
        ),
      ),
    )
