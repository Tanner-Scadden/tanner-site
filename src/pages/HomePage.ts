import type { Html } from '@effect/ui/html'
import * as stylex from '@stylexjs/stylex'
import { Array as Arr } from 'effect'

import { Callout, Section, sheet } from '#components/Sheet'
import {
  ELSEWHERE,
  GREETING,
  OPEN_SOURCE,
  PERSONAL_LIFE,
  SIGN_OFF,
  SITE_REPO_URL,
  WELCOME,
} from '#content/home'

import { PENS_START } from '../blueprint/webgpu/renderer.ts'
import { EggCounter } from '../eggs/components/QuestLog.ts'
import { House } from '../house/components/House.ts'
import type { EggsState } from '../eggs/machines/Eggs.ts'
import { SiteRoute, href, restRoute } from '../routes.ts'
import { sx } from '../styles/sx.ts'
import { blueprint, fonts, media, widths } from '../styles/tokens.stylex.ts'
import { Work } from '../work/components/Work.ts'

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

  // The hero: a hello on one side, the house on the other. The hello keeps
  // its room on paper too.
  hero: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr) minmax(0, 1fr)',
      [media.narrow]: '1fr',
    },
    gap: { default: 48, [media.narrow]: 36 },
    alignItems: 'center',
    paddingTop: { default: 64, [media.narrow]: 36 },
    paddingBottom: { default: 56, [media.narrow]: 36 },
    paddingInline: { default: 40, [media.narrow]: 20 },
  },
  greeting: {
    fontWeight: 800,
    fontSize: 'clamp(30px, 3.6vw, 46px)',
    lineHeight: 1.05,
    fontStretch: widths.semi,
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

  // Open source, and the rest.
  two: {
    display: 'grid',
    gridTemplateColumns: { default: '1fr 1fr', [media.narrow]: '1fr' },
    gap: 40,
  },
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
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
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
    fontStretch: widths.wide,
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
    transitionProperty: 'border-color',
    transitionDuration: '.2s',
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
    WorkSection(h, options.still),
    OpenSource(h),
    Outside(h),
    Footer(h, options.clickedWebGpu),
  )

// Enter and Space press a role=button, as they would a real one.
const pressed = <M>(message: M) => ({ key }: { readonly key: string }) =>
  key === 'Enter' || key === ' ' ? message : undefined

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

const WorkSection = <M>(h: Html.H<M>, still: boolean) =>
  Section(h, 'work').children(Callout(h, 1, 'SELECTED WORK'), Work(h, still))

const OpenSource = <M>(h: Html.H<M>) =>
  Section(h, 'oss').children(
    Callout(h, 2, 'OPEN SOURCE'),
    sx(h.div, styles.two).children(
      sx(h.p, sheet.prose).children(
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
  Section(h, 'outside').children(
    Callout(h, 3, PERSONAL_LIFE),
    sx(h.p, sheet.prose).children(
      "I've always played games, and for a few years I ",
      h.a.attr('href', href(restRoute)).children('played them professionally'),
      ': Arena of Valor with Allegiance, then Wild Rift with Sentinels, and made it to worlds three times. These days I mostly build them, sometimes with my family.',
    ),
    sx(h.p, sheet.prose).children(
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
