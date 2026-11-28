import type { Post } from '#domain/Post'

import { CallingHero } from '../../blog/figures/calling/scene.ts'
import { ForestFigure } from '../../blog/figures/forest/scene.ts'
import { NetworkFigure } from '../../blog/figures/network/scene.ts'
import { TeamFigure } from '../../blog/figures/team/scene.ts'

export const beSomeoneWorthCalling: Post = {
  slug: 'be-someone-worth-calling',
  title: 'Be Someone Worth Calling',
  date: '2026-11-27',
  summary: 'The best opportunities come from people who vouch for you.',
  image: {
    path: '/og/be-someone-worth-calling.png',
    alt: 'Be Someone Worth Calling: an old telephone switchboard with gold cords running up to its jacks and their lamps lit.',
  },
  hero: h => [CallingHero(h, { key: 'calling' })],
  body: h => [
    h.p('The call to join Sentinels came after I thought I was done playing.'),
    h.p(
      'A few years earlier I was really focused on Arena of Valor. I played more than I’d like to admit, and the people I played with became friends.',
    ),
    h.p('We signed with Allegiance, got paid to play full time, and made it to Worlds twice. After the second tournament, I set my sights on becoming a software engineer full time, thinking I was done with gaming.'),
    h.p(
      'Two years later, one of those same teammates reached out. Sentinels was putting together a Wild Rift team and they needed another player.',
    ),
    h.p(
      'I didn’t have to pitch myself. That teammate vouched for me, and the rest of the teammates were already aware of my reputation.',
    ),
    h.p(
      'Almost every big opportunity has started with a phone call I didn’t expect. The best bet is to keep showing up.',
    ),

    h.h2('Becoming someone worth calling'),
    h.p(
      h.strong('Know the problem.'),
      ' Talk to customers, watch session replays, and dig through the data.',
    ),
    h.p(
      h.strong('Lead with what you need.'),
      ' The first sentence decides how the rest gets read. Chris Fenning’s ',
      h.a.attr('href', 'https://www.amazon.com/dp/B08MWYZPCR').children(h.em('The First Minute')),
      ' covers it well.',
    ),
    h.p(
      h.strong('Be the first to jump in.'),
      ' Be the person people come to because they know it’ll get done.',
    ),
    h.p(
      h.strong('Control what you can.'),
      ' Most of what breaks isn’t up to you. What you do next is.',
    ),
    h.p(
      h.strong('Believe in yourself.'),
      ' Some of our ceilings are ones we put there ourselves. Read George Mack’s ',
      h.a.attr('href', 'https://www.highagency.com/').children(h.em('High Agency')),
      '.',
    ),
    h.p(
      h.strong('Choose your people.'),
      ' Surround yourself with people who have high standards. As Arnold Schwarzenegger says in ',
      h.a.attr('href', 'https://beusefulbook.com/').children(h.em('Be Useful')),
      ', nobody is self-made.',
    ),
    h.p(
      h.strong('Never keep score.'),
      ' Volunteer, buy someone a coffee, open a ',
      h.em('high-quality'),
      ' PR. The Dalai Lama calls it ',
      h.a.attr('href', 'https://www.britannica.com/biography/A-Call-to-Compassion-1053585').children('wise selfishness'),
      '.',
    ),

    NetworkFigure(h, { key: 'network' }),

    h.h2('Win together over being right'),
    h.p(
      'I’ve made the mistake of breaking team harmony more times than I can count. After a heated game, or in the middle of an incident, it’s easy to take your frustration out on the people around you. It might feel righteous in the moment, but they’ll remember it long after.',
    ),
    h.p(
      'One person can set the tone for a whole team, for better or worse. Bring in the wrong person, and people start working around them instead of with them. Everyone slows down. Don’t be that person.',
    ),
    h.p('People forget who was right. They remember how you made them feel.'),
    TeamFigure(h, { key: 'team' }),

    h.h2('It takes time'),
    h.p(
      'My first real job was in customer success at a solar company, getting customers from a signed contract to panels on their roof. My accounts got there faster than anyone else’s. I wasn’t in tech yet, and I wasn’t thinking long term. I was just excited to not work in fast food.',
    ),
    h.p(
      'Years later, after a dev bootcamp, I posted that I was looking for work. One of that company’s founders had started something new, remembered my work, and reached out. That became my first engineering job: Solo.',
    ),
    h.p(
      'A few years in, I took a leap of faith and started my own company with no clients lined up. I was betting that the people I’d worked with would remember how I showed up.',
    ),
    h.p(
      'It paid off that same week. An engineer from Solo, who’d left a year before me, heard I was going out on my own and gave me a call. That call became my first contract, Webaholics.',
    ),
    h.p(
      'More calls followed. Some of my contacts wanted to build projects together, and others wanted to introduce me to their network. All of my work came from people who’d worked with me before. Some led to partnerships that turned into new startups.',
    ),
    h.p('Other people did the vouching. They got me into rooms I’d never have reached alone.'),
    h.p(
      'Sunil Pai describes the same thing in ',
      h.a.attr('href', 'https://sunilpai.dev/posts/collecting-favours').children('collecting favours'),
      '. He writes about a fundraiser that brought in $56,000 in two weeks, and says the money really took fifteen years to raise.',
    ),
    h.p(
      'If you’ve been useful to people, you have a safety net you can’t see. Sometimes you have to jump to find out it’s there.',
    ),
    h.p(
      'Schwarzenegger’s book is named after what his dad used to tell him: “Be useful, Arnold.” Give your best even when nobody’s keeping score. That’s what people remember when they’re deciding who to call.',
    ),
    h.p('You don’t control when the call comes. You control whether you’re someone worth calling.'),
    h.blockquote(
      h.p('Unless someone like you cares a whole awful lot, nothing is going to get better. It’s not.'),
      h.p(h.em('The Lorax'), ', Dr. Seuss'),
    ),
    ForestFigure(h, { key: 'forest' }),
  ],
}
