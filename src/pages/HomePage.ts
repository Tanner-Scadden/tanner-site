import type { Html } from '@effect/ui/html'
import { Array as Arr } from 'effect'

import { BIO, ELSEWHERE, OPEN_SOURCE, SITE_REPO_URL, WORK } from '#content/home'

import { PENS_START } from '../blueprint/webgpu/renderer.ts'
import { EggCounter } from '../eggs/components/QuestLog.ts'
import type { EggsState } from '../eggs/machines/Eggs.ts'
import { SiteRoute, href, restRoute } from '../routes.ts'
import { WorkDrawing } from '../work/mounts/WorkDrawing.ts'

// NOTE: the front page, at /. The thesis and the WebGPU credit are the two
// things on it that act like buttons; the page reports their clicks.
export const HomePage = <M>(
  h: Html.H<M>,
  options: {
    readonly eggs: EggsState
    readonly thesis: string
    readonly clickedThesis: M
    readonly clickedWebGpu: M
    readonly still: boolean
  },
) =>
  h.div
    .class('sheet')
    .children(
      TopBar(h, options.eggs),
      Hero(h, options.thesis, options.clickedThesis),
      Work(h, options.still),
      OpenSource(h),
      Outside(h),
      Footer(h, options.clickedWebGpu),
    )

// Enter and Space press a role=button, as they would a real one.
const pressed = <M>(message: M) => ({ key }: { readonly key: string }) =>
  key === 'Enter' || key === ' ' ? message : undefined

// NOTE: a section heading drawn like a drawing callout: a numbered bubble,
// the title, and a leader line out to the sheet edge.
const Label = <M>(h: Html.H<M>, n: number, text: string) =>
  h.h2
    .class('label')
    .children(
      h.i.attr('aria-hidden', 'true').children(String(n)),
      text,
      h.span.class('rule').attr('aria-hidden', 'true'),
    )

const TopBar = <M>(h: Html.H<M>, eggs: EggsState) =>
  h.div
    .class('top')
    .children(
      h.span('TANNER SCADDEN'),
      h.nav(
        h.a.attr('href', '#work').children('WORK'),
        h.a.attr('href', '#oss').children('OPEN SOURCE'),
        h.a.attr('href', '#outside').children('OUTSIDE WORK'),
      ),
      EggCounter(h, eggs),
    )

const Hero = <M>(h: Html.H<M>, thesis: string, clicked: M) =>
  h.header
    .class('hero')
    .children(
      h.h1('Tanner Scadden'),
      h.p.class('role').children('Product engineer'),
      h.p
        .class('thesis')
        .attrs({ role: 'button', tabindex: '0' })
        .on('click', clicked)
        .on('keydown', pressed(clicked), { preventDefault: true })
        .children(thesis),
      h.p.class('bio').children(BIO),
    )

const Step = <M>(h: Html.H<M>, title: string, text: string, out: boolean) =>
  h.div.class('step', out && 'out').children(h.small(title), h.p(text))

const Arrow = <M>(h: Html.H<M>) =>
  h.div.class('arr').attr('aria-hidden', 'true').children('→')

const Work = <M>(h: Html.H<M>, still: boolean) =>
  h.section
    .class('blk')
    .attr('id', 'work')
    .children(
      Label(h, 1, 'SELECTED WORK'),
      h.div.class('work').children(
        // NOTE: WebGPU drafts the boxes and runs a spark along the arrows.
        // Without it this canvas stays empty and the CSS borders show.
        h.canvas
          .class('work-gpu')
          .attr('aria-hidden', 'true')
          .onMount(WorkDrawing({ still })),
        ...Arr.map(WORK, job =>
          h.div
            .class('job')
            .children(
              h.div
                .class('meta')
                .children(
                  h.small(job.when),
                  h.strong(
                    h.a
                      .attrs({ href: job.href, target: '_blank', rel: 'noopener noreferrer' })
                      .children(job.name),
                  ),
                  h.small(job.role),
                ),
              h.div
                .class('flow')
                .children(
                  Step(h, 'PROBLEM', job.problem, false),
                  Arrow(h),
                  Step(h, 'APPROACH', job.approach, false),
                  Arrow(h),
                  Step(h, 'RESULT', job.result, true),
                ),
            ),
        ),
      ),
    )

const OpenSource = <M>(h: Html.H<M>) =>
  h.section
    .class('blk')
    .attr('id', 'oss')
    .children(
      Label(h, 2, 'OPEN SOURCE'),
      h.div.class('two').children(
        h.p
          .class('p')
          .children(
            "I love working on open source. If a tool I'm using has a bug or is missing something, I'd rather jump in and open a PR than hack around it.",
          ),
        h.ul
          .class('plain')
          .children(
            ...Arr.map(OPEN_SOURCE, project =>
              h.li(
                h.a
                  .attrs({
                    href: project.href,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                  })
                  .children(
                    h.span(project.name),
                    h.span.class('what').children(project.what),
                    h.span.attr('aria-hidden', 'true').children('↗'),
                  ),
              ),
            ),
          ),
      ),
    )

const Outside = <M>(h: Html.H<M>) =>
  h.section
    .class('blk')
    .attr('id', 'outside')
    .children(
      Label(h, 3, 'OUTSIDE WORK'),
      h.p
        .class('p')
        .children(
          "I've always played games, and for a few years I ",
          h.a.attr('href', href(restRoute)).children('played them professionally'),
          ': Arena of Valor with Allegiance, then Wild Rift with Sentinels, and made it to worlds three times. These days I mostly build them, sometimes with my family.',
        ),
      h.p
        .class('p')
        .children(
          "When I'm not at a keyboard, I'm usually hanging out with my wife Demi, our dog Teddy and our cat Rain.",
        ),
    )

const Footer = <M>(h: Html.H<M>, clickedWebGpu: M) =>
  h.footer
    .class('foot')
    .children(
      h.div(h.small('TANNER SCADDEN'), h.strong('Product engineer')),
      h.div(
        h.small('ELSEWHERE'),
        ...Arr.flatMap(ELSEWHERE, (link, i) => [
          i > 0 && ' · ',
          h.a.attr('href', link.href).children(link.label),
        ]),
      ),
      h.div(
        h.small('THIS SITE'),
        'Effect UI + ',
        h.span
          .class('egg')
          .attrs({ role: 'button', tabindex: '0', [PENS_START]: '' })
          .on('click', clickedWebGpu)
          .on('keydown', pressed(clickedWebGpu), { preventDefault: true })
          .children('WebGPU'),
        ' on Cloudflare · ',
        h.a
          .class('source')
          .attrs({ href: SITE_REPO_URL, target: '_blank', rel: 'noopener noreferrer' })
          .children('source ↗'),
      ),
      h.div.class('door-cell').children(
        h.a
          .class('door')
          .attr('href', href(SiteRoute.Manor()))
          .attr('aria-label', 'Open the hidden room')
          .children(h.small('DOOR D-13'), h.strong('Do not open')),
      ),
    )
