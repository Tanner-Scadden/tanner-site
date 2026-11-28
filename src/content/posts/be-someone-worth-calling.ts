import type { Post } from '#domain/Post'

import { ForestFigure } from '../../blog/figures/forest/scene.ts'
import { NetworkFigure } from '../../blog/figures/network/scene.ts'
import { TeamFigure } from '../../blog/figures/team/scene.ts'

export const beSomeoneWorthCalling: Post = {
  slug: 'be-someone-worth-calling',
  title: 'Be Someone Worth Calling',
  date: '2026-11-27',
  summary: 'The best opportunities come from people who vouch for you. Be someone they’d call.',
  image: {
    path: '/og/be-someone-worth-calling.png',
    alt: 'Be Someone Worth Calling: a network of people around you, with one branch torn away after a bad interaction.',
  },
  body: h => [
    h.p('The call to join Sentinels came after I thought I was done playing.'),
    h.p(
      'A few years earlier, I got really into Arena of Valor. I played constantly, and the people I played with became friends. When we lost, I looked at what I could have done better. When we won, I tried to give my teammates the credit.',
    ),
    h.p('We got signed and made it to worlds twice. After the 2nd tournament, I went to be a software engineer full time, thinking I was done.'),
    h.p(
      'About two years later, a teammate from those days reached out. Sentinels was putting together a Wild Rift team and they needed another player.',
    ),
    h.p(
      'I didn’t have to pitch myself. That same teammate vouched for me, and the rest of the team already knew how I’d shown up in Arena of Valor.',
    ),
    h.p(
      'Almost every big turn in my life has started with a call like that. Your best bet is to keep showing up, and your network will grow from there.',
    ),

    h.h2('How to be someone worth calling'),
    h.p(
      h.strong('Know the problem.'),
      ' Talk to customers, watch session replays, and dig through data. The more of the picture you see, the better the solutions you’ll come up with.',
    ),
    h.p(
      h.strong('Lead with what you need.'),
      ' The first sentence decides how the rest gets read, so make it count. ',
      h.a.attr('href', 'https://www.smartbrevity.com/').children('Smart Brevity'),
      ' is a whole book on doing this well.',
    ),
    h.p(
      h.strong('Be the first to jump in.'),
      ' Answer the question in Slack. Fix problems as you find them. Be the person people come to because they know it’ll get done.',
    ),
    h.p(
      h.strong('Keep the cup half full.'),
      ' Things will break, deals will fall through, and launches will slip. Look for what you can still do. Find the bright side, and crack a joke. People want to work with someone who makes the hard days lighter.',
    ),
    h.p(
      h.strong('Believe in yourself.'),
      ' Your ceiling is one you put there yourself. When you’re stuck, ask what a version of you with ten times the agency would do. George Mack’s ',
      h.a.attr('href', 'https://www.highagency.com/').children(h.em('High Agency')),
      ' is built on that question. If you haven’t read it, do.',
    ),
    h.p(
      h.strong('Choose your people.'),
      ' Your mother was right. Surround yourself with people who have high standards and the same level of ambition. Like Arnold Schwarzenegger says in ',
      h.a.attr('href', 'https://beusefulbook.com/').children(h.em('Be Useful')),
      ', nobody is self-made.',
    ),
    h.p(
      h.strong('Never keep score.'),
      ' Volunteer at a meetup. Buy someone a coffee. When a tool you use has a bug or is missing something, open a ',
      h.em('high-quality'),
      ' PR. Sometimes giving is the most selfish thing you can do. The Dalai Lama calls it ',
      h.a.attr('href', 'https://www.britannica.com/biography/A-Call-to-Compassion-1053585').children('wise selfishness'),
      '.',
    ),

    NetworkFigure(h, { key: 'network' }),

    h.h2('Win together over being right'),
    h.p('Being worth calling is also about what the team is like with you on it.'),
    h.p(
      'I’ve broken team harmony myself. After a heated game, or in the middle of an incident, it’s easy to take your frustration out on the people around you. It might feel righteous in the moment, but they’ll remember it long after.',
    ),
    h.p(
      'One person can set the tone for a whole team, for better or worse. Bring in the wrong one, and people start working around them instead of with them. Everyone slows down. Don’t be that person.',
    ),
    h.p('People forget who was right. They remember how you made them feel.'),
    TeamFigure(h, { key: 'team' }),

    h.h2('Betting on your network'),
    h.p(
      'In 2021 I took a leap of faith and started my own thing with no clients lined up. I didn’t have a plan. I was betting that the people who knew my work would remember me.',
    ),
    h.p(
      'It paid off that same week. An engineer I’d worked with, and hadn’t really talked to in almost a year, heard I was going out on my own and gave me a call. That call became my first contract, Webaholics.',
    ),
    h.p(
      'More calls followed. Some people wanted to build something together, and others introduced me to someone who did. For a few years, all my work came from people who’d worked with me before. Some of those calls even led to founding a company.',
    ),
    h.p('I didn’t build any of that on my own. Other people did the vouching.'),
    h.p(
      'If you’ve been useful to people, you have a safety net you can’t see. Sometimes you have to jump to find out it’s there.',
    ),

    h.h2('Years to earn, one call to arrive'),
    h.p(
      'In ',
      h.a.attr('href', 'https://sunilpai.dev/posts/collecting-favours').children('collecting favours'),
      ', Sunil Pai writes about a fundraiser that brought in $56,000 in two weeks, and says the money really took fifteen years to raise.',
    ),
    h.p(
      'Arnold’s book is named after what his dad used to tell him: “Be useful, Arnold.” Give your best even when nobody’s keeping score. That’s what people remember when they’re deciding who to call.',
    ),
    h.p('You don’t control when the call comes. You control whether you’re someone worth calling.'),
    h.blockquote(
      h.p('Unless someone like you cares a whole awful lot, nothing is going to get better. It’s not.'),
      h.p(h.em('The Lorax'), ', Dr. Seuss'),
    ),
    ForestFigure(h, { key: 'forest' }),
  ],
}
