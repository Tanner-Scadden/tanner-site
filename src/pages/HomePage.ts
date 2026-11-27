import { Mount } from '@effect/ui'
import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr } from 'effect'

import { sheet } from '#components/Sheet'
import {
  ELSEWHERE,
  GREETING,
  HOUSE,
  OPEN_SOURCE,
  PERSONAL_LIFE,
  SIGN_OFF,
  SITE_REPO_URL,
  WELCOME,
  WORK,
} from '#content/home'

import { PENS_START } from '../blueprint/webgpu/renderer.ts'
import { EggCounter } from '../eggs/components/QuestLog.ts'
import { HouseDrawing } from '../house/mounts/HouseDrawing.ts'
import type { EggsState } from '../eggs/machines/Eggs.ts'
import { SiteRoute, href, restRoute } from '../routes.ts'
import { houseMarker, workMarker } from '../styles/markers.stylex.ts'
import { sx } from '../styles/sx.ts'
import { blueprint, fonts, media } from '../styles/tokens.stylex.ts'
import { WorkDrawing } from '../work/mounts/WorkDrawing.ts'

// NOTE: the GPU drawings mark their containers with `data-gpu`. While the
// house is drawn, its CSS walls step aside and the labels wait for the
// pens; while the work list is drawn, the CSS step borders step aside.
const styles = stylex.create({
  // The top bar.
  top: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    position: { default: null, [media.phone]: 'relative' },
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: blueprint.rule,
    paddingBlock: 10,
    paddingInline: 18,
    fontSize: 11,
    letterSpacing: '.14em',
  },
  nav: { display: { default: null, [media.print]: 'none' } },
  navLink: {
    color: { default: blueprint.line, ':hover': blueprint.hi },
    textDecoration: 'none',
    marginLeft: { default: 14, ':first-child': 0 },
  },

  // Section headings read like drawing callouts: a numbered bubble, the
  // title, and a leader line out to a tick.
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 26,
    fontFamily: fonts.mono,
    fontWeight: 400,
    fontSize: 13,
    lineHeight: 1,
    letterSpacing: '.18em',
    color: blueprint.line,
  },
  bubble: {
    display: 'inline-grid',
    placeItems: 'center',
    flex: 'none',
    width: 30,
    height: 30,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: blueprint.line,
    borderRadius: '50%',
    fontStyle: 'normal',
    fontSize: 12,
    letterSpacing: 0,
    color: blueprint.hi,
  },
  leader: {
    flex: 1,
    minWidth: 24,
    position: 'relative',
    height: 1,
    backgroundColor: blueprint.dim,
    '::after': {
      content: '""',
      position: 'absolute',
      right: 0,
      top: -4,
      width: 1,
      height: 9,
      backgroundColor: blueprint.dim,
    },
  },

  // The hero: a hello on one side, the house on the other.
  hero: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr) minmax(0, 1fr)',
      [media.narrow]: '1fr',
    },
    gap: { default: 48, [media.narrow]: 36 },
    alignItems: 'center',
    // The hello keeps its room on paper too.
    paddingTop: { default: 64, [media.narrow]: 36 },
    paddingBottom: { default: 56, [media.narrow]: 36 },
    paddingInline: { default: 40, [media.narrow]: 20 },
  },
  greeting: {
    fontWeight: 800,
    fontSize: 'clamp(30px, 3.6vw, 46px)',
    lineHeight: 1.05,
    fontStretch: '112%',
    textTransform: 'none',
  },
  thesis: {
    marginTop: 28,
    paddingLeft: 18,
    borderLeftWidth: 2,
    borderLeftStyle: 'solid',
    borderLeftColor: blueprint.hi,
    fontSize: 17,
    maxWidth: 520,
    userSelect: 'none',
    outlineStyle: { default: null, ':focus-visible': 'dashed' },
    outlineOffset: { default: null, ':focus-visible': 4 },
  },
  welcome: { marginTop: 18, maxWidth: 520, color: blueprint.dim },

  // The floor plan: each room is a section of the page. The canvas bleeds
  // past the figure, so the risen walls and the pets on the back rooms
  // have room to stand.
  house: {
    position: 'relative',
    isolation: 'isolate',
    margin: 0,
    display: { default: null, [media.print]: 'none' },
  },
  houseCanvas: {
    position: 'absolute',
    inset: { default: -40, [media.narrow]: -16 },
    width: { default: 'calc(100% + 80px)', [media.narrow]: 'calc(100% + 32px)' },
    height: { default: 'calc(100% + 80px)', [media.narrow]: 'calc(100% + 32px)' },
    zIndex: -1,
    pointerEvents: 'none',
    display: { default: 'none', [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'block' },
  },
  // The labels fade in once the pens have drawn the walls.
  pencilled: {
    opacity: { default: 1, [stylex.when.ancestor('[data-gpu="on"][data-drafting]', houseMarker)]: 0 },
    transitionProperty: 'opacity',
    transitionDuration: { default: '.6s', [media.reducedMotion]: '0s' },
    transitionTimingFunction: 'ease-out',
  },
  sheetNo: {
    display: 'block',
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: '.16em',
    color: blueprint.dim,
    marginBottom: 8,
  },
  // The renderer tips the plan into 3D with the walls, from its own corner.
  plan: {
    display: 'grid',
    gridTemplateColumns: '150fr 55fr 75fr',
    gridTemplateRows: '1.3fr 1fr',
    aspectRatio: '28 / 19',
    borderWidth: 2.5,
    borderStyle: 'solid',
    borderColor: { default: blueprint.line, [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'transparent' },
    position: 'relative',
    transformOrigin: { default: null, [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: '0 0' },
    willChange: { default: null, [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'transform' },
    // The front door: a gap in the bottom wall.
    '::after': {
      content: '""',
      position: 'absolute',
      bottom: -3,
      left: '28%',
      width: 30,
      height: 4,
      backgroundColor: blueprint.paper,
      display: { default: 'block', [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'none' },
    },
  },
  room: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: 8,
    textAlign: 'center',
    color: 'inherit',
    textDecoration: 'none',
    borderStyle: 'solid',
    borderWidth: 0,
    borderColor: { default: blueprint.line, [stylex.when.ancestor('[data-gpu="on"]', houseMarker)]: 'transparent' },
    transition: 'color .15s, background-color .15s',
  },
  roomLink: {
    color: { default: 'inherit', ':hover': blueprint.hi, ':focus-visible': blueprint.hi },
    backgroundColor: {
      default: null,
      ':hover': 'rgba(255, 209, 102, .06)',
      ':focus-visible': 'rgba(255, 209, 102, .06)',
    },
    outlineStyle: { default: null, ':focus-visible': 'dashed' },
    outlineOffset: { default: null, ':focus-visible': -4 },
  },
  roomWork: { gridColumn: 1, borderRightWidth: 1.5, borderBottomWidth: 1.5 },
  roomOss: { gridColumn: '2 / 4', borderBottomWidth: 1.5 },
  roomOutside: {
    gridColumn: '1 / 3',
    borderRightWidth: 1.5,
    justifyContent: 'flex-start',
    paddingTop: 14,
  },
  locked: { gridColumn: 3, color: blueprint.hi },
  roomName: { fontSize: { default: 12, [media.narrow]: 10 }, letterSpacing: '.08em' },
  roomNote: { fontSize: 8, letterSpacing: '.12em', color: blueprint.hi },

  // A section of the sheet.
  block: {
    paddingBlock: { default: 44, [media.narrow]: 36, [media.print]: 16 },
    paddingInline: { default: 40, [media.narrow]: 20, [media.print]: 0 },
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: blueprint.rule,
    breakInside: { default: null, [media.print]: 'avoid' },
  },

  // Selected work. WebGPU draws each job's outlines, and the first time a
  // job comes into view a wave runs through it, round each border and along
  // each arrow. Without it, or once the device is lost, the CSS borders are
  // all there is.
  work: { position: 'relative', isolation: 'isolate' },
  workCanvas: {
    position: 'absolute',
    inset: -16,
    width: 'calc(100% + 32px)',
    height: 'calc(100% + 32px)',
    zIndex: -1,
    pointerEvents: 'none',
    display: { default: 'none', [stylex.when.ancestor('[data-gpu="on"]', workMarker)]: 'block', [media.print]: 'none' },
  },
  job: {
    display: 'grid',
    gridTemplateColumns: { default: '200px 1fr', [media.narrow]: '1fr' },
    gap: { default: 28, [media.narrow]: 12 },
    paddingBlock: 30,
    borderBottomWidth: 1,
    borderBottomStyle: 'dashed',
    borderBottomColor: blueprint.faint,
  },
  lastJob: { borderBottomStyle: 'none', paddingBottom: 0 },
  jobNote: {
    display: 'block',
    fontSize: 10.5,
    letterSpacing: '.16em',
    color: blueprint.dim,
  },
  jobName: {
    display: 'block',
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: 19,
    lineHeight: 1.1,
    fontStretch: '115%',
    textTransform: 'uppercase',
    marginBlock: 4,
  },
  jobLink: {
    color: { default: 'inherit', ':hover': blueprint.hi, ':focus-visible': blueprint.hi },
    textDecoration: 'none',
    transition: 'color .15s',
  },
  flow: {
    display: 'grid',
    gridTemplateColumns: { default: '1fr 24px 1fr 24px .8fr', [media.narrow]: '1fr' },
    alignItems: 'stretch',
  },
  step: {
    borderWidth: 1,
    borderStyle: 'solid',
    // On paper there's no GPU drawing, so the CSS borders come back.
    borderColor: {
      default: blueprint.rule,
      [stylex.when.ancestor('[data-gpu="on"]', workMarker)]: 'transparent',
      [media.print]: blueprint.rule,
    },
    paddingBlock: 14,
    paddingInline: 16,
  },
  result: {
    borderColor: {
      default: blueprint.hi,
      [stylex.when.ancestor('[data-gpu="on"]', workMarker)]: 'transparent',
      [media.print]: blueprint.rule,
    },
  },
  stepTitle: {
    display: 'block',
    fontSize: 10,
    letterSpacing: '.16em',
    color: blueprint.dim,
    marginBottom: 6,
  },
  stepText: { fontSize: 13 },
  resultText: { color: blueprint.hi },
  arrow: {
    display: 'grid',
    placeItems: 'center',
    color: blueprint.dim,
    transform: { default: null, [media.narrow]: 'rotate(90deg)' },
    height: { default: null, [media.narrow]: 22 },
  },

  // Open source, and the rest.
  two: {
    display: 'grid',
    gridTemplateColumns: { default: '1fr 1fr', [media.narrow]: '1fr' },
    gap: 40,
  },
  prose: { color: blueprint.dim, maxWidth: 640, marginBottom: 14 },
  projects: { listStyle: 'none' },
  project: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    paddingBlock: 10,
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: blueprint.faint,
    fontSize: 13,
  },
  projectLink: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    flex: 1,
    color: { default: blueprint.line, ':hover': blueprint.hi, ':focus-visible': blueprint.hi },
    textDecoration: 'none',
  },
  projectWhat: { marginLeft: 'auto', color: blueprint.dim, textAlign: 'right' },
  projectArrow: {
    color: { default: blueprint.dim, [stylex.when.ancestor(':hover')]: blueprint.hi },
    textAlign: 'right',
  },

  // The footer: the sheet's title block.
  foot: {
    display: 'grid',
    gridTemplateColumns: { default: '1.2fr 1fr 1fr 1fr', [media.narrow]: '1fr 1fr' },
  },
  cell: {
    paddingBlock: 14,
    paddingInline: 18,
    borderColor: blueprint.rule,
    borderStyle: 'solid',
    borderWidth: 0,
    borderRightWidth: { default: 1, ':last-child': 0 },
    borderBottomWidth: { default: 0, [media.narrow]: 1 },
  },
  doorCell: { display: { default: null, [media.print]: 'none' } },
  footNote: {
    display: 'block',
    fontSize: 10,
    letterSpacing: '.16em',
    color: blueprint.dim,
  },
  footTitle: {
    fontFamily: fonts.display,
    fontWeight: 800,
    fontSize: 15,
    fontStretch: '115%',
    textTransform: 'uppercase',
  },
  footTitleDoor: { color: { default: null, [stylex.when.ancestor(':hover')]: blueprint.hi } },
  source: { color: blueprint.hi, whiteSpace: 'nowrap' },
  door: {
    cursor: 'pointer',
    color: 'inherit',
    textDecoration: 'none',
    display: 'block',
    width: '100%',
    outlineOffset: { default: null, ':focus-visible': 4 },
  },
  // An egg looks like the words around it.
  egg: {
    cursor: 'pointer',
    color: 'inherit',
    textDecoration: 'none',
    borderBottomWidth: 1,
    borderBottomStyle: 'dotted',
    borderBottomColor: { default: 'transparent', ':hover': blueprint.dim },
    transition: 'border-color .2s',
  },
})

// NOTE: the front page, at /. The thesis and the WebGPU credit are the two
// things on it that act like buttons; the page reports their clicks, and
// when Teddy gets someone to play.
export const HomePage = <M>(
  h: Html.H<M>,
  options: {
    readonly eggs: EggsState
    readonly thesis: string
    readonly clickedThesis: M
    readonly clickedWebGpu: M
    readonly playedWithTeddy: M
    readonly still: boolean
  },
) =>
  sx(h.div, sheet.sheet).children(
    TopBar(h, options.eggs),
    Hero(h, options),
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
  sx(h.h2, styles.label).children(
    sx(h.i, styles.bubble).attr('aria-hidden', 'true').children(String(n)),
    text,
    sx(h.span, styles.leader).attr('aria-hidden', 'true'),
  )

// A section of the sheet, with its callout.
const Block = <M>(h: Html.H<M>, id: string) =>
  sx(h.section, styles.block).attr('id', id)

const TopBar = <M>(h: Html.H<M>, eggs: EggsState) =>
  sx(h.div, styles.top).children(
    h.span('TANNER SCADDEN'),
    sx(h.nav, styles.nav).children(
      sx(h.a, styles.navLink).attr('href', '#work').children('WORK'),
      sx(h.a, styles.navLink).attr('href', '#oss').children('OPEN SOURCE'),
      sx(h.a, styles.navLink).attr('href', '#outside').children(PERSONAL_LIFE),
    ),
    EggCounter(h, eggs),
  )

const Hero = <M>(
  h: Html.H<M>,
  {
    thesis,
    clickedThesis: clicked,
    playedWithTeddy,
    still,
  }: {
    readonly thesis: string
    readonly clickedThesis: M
    readonly playedWithTeddy: M
    readonly still: boolean
  },
) =>
  sx(h.header, sheet.hero, styles.hero).children(
    h.div(
      sx(h.h1, sheet.title, styles.greeting).children(GREETING),
      sx(h.p, styles.thesis)
        .attrs({ role: 'button', tabindex: '0' })
        .on('click', clicked)
        .on('keydown', pressed(clicked), { preventDefault: true })
        .children(thesis),
      sx(h.p, styles.welcome).children(WELCOME),
    ),
    House(h, still, playedWithTeddy),
  )

const ROOM_STYLES = {
  work: styles.roomWork,
  oss: styles.roomOss,
  outside: styles.roomOutside,
}

// NOTE: the renderer finds each room by its `data-room`, to measure it.
const Room = <M>(
  h: Html.H<M>,
  name: 'work' | 'oss' | 'outside',
  target: string,
) =>
  sx(h.a, styles.room, styles.roomLink, ROOM_STYLES[name])
    .attrs({ href: target, 'data-room': name })
    .children(sx(h.b, styles.roomName, styles.pencilled).children(HOUSE.rooms[name].name))

// NOTE: a floor plan of the page. Each room jumps to its section. With
// WebGPU the walls are drafted in and Teddy and Rain move in; without it the
// CSS walls show and the house is empty. The renderer marks the figure with
// `data-gpu` and finds the plan by `data-plan`.
const House = <M>(h: Html.H<M>, still: boolean, played: M) =>
  sx(h.figure, styles.house, houseMarker).children(
    sx(h.canvas, styles.houseCanvas)
      .attr('aria-hidden', 'true')
      .onMount(HouseDrawing({ still }).pipe(Mount.map((): M => played))),
    sx(h.small, styles.sheetNo, styles.pencilled)
      .attr('aria-hidden', 'true')
      .children(HOUSE.sheet),
    sx(h.nav, styles.plan)
      .attrs({ 'aria-label': 'Floor plan of this page', 'data-plan': '' })
      .children(
        Room(h, 'work', '#work'),
        Room(h, 'oss', '#oss'),
        Room(h, 'outside', '#outside'),
        sx(h.div, styles.room, styles.locked)
          .attrs({ 'data-room': 'locked', 'aria-hidden': 'true' })
          .children(
            sx(h.b, styles.roomName, styles.pencilled).children(HOUSE.rooms.locked.name),
            sx(h.small, styles.roomNote, styles.pencilled).children(HOUSE.rooms.locked.note),
          ),
      ),
  )

// NOTE: the renderer finds each step by `data-step`, to draw round it.
const Step = <M>(h: Html.H<M>, title: string, text: string, result: boolean) =>
  sx(h.div, styles.step, result && styles.result)
    .attr('data-step', '')
    .children(
      sx(h.small, styles.stepTitle).children(title),
      sx(h.p, styles.stepText, result && styles.resultText).children(text),
    )

const Arrow = <M>(h: Html.H<M>) =>
  sx(h.div, styles.arrow).attr('aria-hidden', 'true').children('→')

// NOTE: the renderer marks the list with `data-gpu` and finds each job by
// `data-job`.
const Work = <M>(h: Html.H<M>, still: boolean) =>
  Block(h, 'work').children(
    Label(h, 1, 'SELECTED WORK'),
    sx(h.div, styles.work, workMarker).children(
      // NOTE: WebGPU draws the boxes and runs a wave round them and along
      // the arrows. Without it this canvas stays empty and the CSS borders show.
      sx(h.canvas, styles.workCanvas)
        .attr('aria-hidden', 'true')
        .onMount(WorkDrawing({ still })),
      ...Arr.map(WORK, (job, i) =>
        sx(h.div, styles.job, i === WORK.length - 1 && styles.lastJob)
          .attrs({ 'data-job': '', ...(job.wave === undefined ? {} : { 'data-wave': job.wave }) })
          .children(
            h.div(
              sx(h.small, styles.jobNote).children(job.when),
              sx(h.strong, styles.jobName).children(
                sx(h.a, styles.jobLink)
                  .attrs({ href: job.href, target: '_blank', rel: 'noopener noreferrer' })
                  .children(job.name),
              ),
              sx(h.small, styles.jobNote).children(job.role),
            ),
            sx(h.div, styles.flow).children(
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
  Block(h, 'oss').children(
    Label(h, 2, 'OPEN SOURCE'),
    sx(h.div, styles.two).children(
      sx(h.p, styles.prose).children(
        "I love working on open source. If a tool I'm using has a bug or is missing something, I'd rather jump in and open a PR than hack around it.",
      ),
      sx(h.ul, styles.projects).children(
        ...Arr.map(OPEN_SOURCE, project =>
          sx(h.li, styles.project).children(
            sx(h.a, styles.projectLink, stylex.defaultMarker())
              .attrs({ href: project.href, target: '_blank', rel: 'noopener noreferrer' })
              .children(
                h.span(project.name),
                sx(h.span, styles.projectWhat).children(project.what),
                sx(h.span, styles.projectArrow).attr('aria-hidden', 'true').children('↗'),
              ),
          ),
        ),
      ),
    ),
  )

const Outside = <M>(h: Html.H<M>) =>
  Block(h, 'outside').children(
    Label(h, 3, PERSONAL_LIFE),
    sx(h.p, styles.prose).children(
      "I've always played games, and for a few years I ",
      h.a.attr('href', href(restRoute)).children('played them professionally'),
      ': Arena of Valor with Allegiance, then Wild Rift with Sentinels, and made it to worlds three times. These days I mostly build them, sometimes with my family.',
    ),
    sx(h.p, styles.prose).children(
      "When I'm not at a keyboard, I'm usually hanging out with my wife Demi, our dog Teddy and our cat Rain.",
    ),
  )

const Footer = <M>(h: Html.H<M>, clickedWebGpu: M) =>
  sx(h.footer, styles.foot).children(
    sx(h.div, styles.cell).children(
      sx(h.small, styles.footNote).children('TANNER SCADDEN'),
      sx(h.strong, styles.footTitle).children(SIGN_OFF),
    ),
    sx(h.div, styles.cell).children(
      sx(h.small, styles.footNote).children('ELSEWHERE'),
      ...Arr.flatMap(ELSEWHERE, (link, i) => [
        i > 0 && ' · ',
        h.a.attr('href', link.href).children(link.label),
      ]),
    ),
    sx(h.div, styles.cell).children(
      sx(h.small, styles.footNote).children('THIS SITE'),
      'Effect UI + ',
      sx(h.span, styles.egg)
        .attrs({ role: 'button', tabindex: '0', [PENS_START]: '' })
        .on('click', clickedWebGpu)
        .on('keydown', pressed(clickedWebGpu), { preventDefault: true })
        .children('WebGPU'),
      ' on Cloudflare · ',
      sx(h.a, styles.source)
        .attrs({ href: SITE_REPO_URL, target: '_blank', rel: 'noopener noreferrer' })
        .children('source ↗'),
    ),
    sx(h.div, styles.cell, styles.doorCell).children(
      sx(h.a, styles.door, stylex.defaultMarker())
        .attr('href', href(SiteRoute.Manor()))
        .attr('aria-label', 'Open the hidden room')
        .children(
          sx(h.small, styles.footNote).children('DOOR D-13'),
          sx(h.strong, styles.footTitle, styles.footTitleDoor).children('Do not open'),
        ),
    ),
  )
