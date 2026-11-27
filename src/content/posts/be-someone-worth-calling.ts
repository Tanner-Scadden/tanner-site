import type { Post } from '#domain/Post'

import { ForestFigure } from '../../forest/scene.ts'
import { NetworkFigure } from '../../network/scene.ts'
import { TeamFigure } from '../../team/scene.ts'

export const beSomeoneWorthCalling: Post = {
  slug: 'be-someone-worth-calling',
  title: 'Be Someone Worth Calling',
  date: '2026-11-27',
  summary:
    'The best turns in your career will come from people vouching for you in rooms you’re not in.',
  body: h => [
    h.p('My call to join Sentinels came after I’d thought I was done playing.'),
    h.p(
      'A few years earlier, I got really into Arena of Valor. I played constantly, and the people I played with became friends. When we lost, I looked at what I could have done better. When we won, I gave my teammates the credit.',
    ),
    h.p(
      'Eventually, people noticed. We got signed, won NA twice, and I played at worlds twice. When I went to be a software engineer full time, I figured that chapter was closed.',
    ),
    h.p(
      'About two years later, a teammate from those days reached out. Sentinels was putting together a Wild Rift team, they needed an ADC, and would I want to play again? Saying yes was easy.',
    ),
    h.p(
      'I hadn’t pitched myself to anyone. An old teammate vouched for me in a room I wasn’t in, because of how I’d shown up in Arena of Valor.',
    ),
    h.p(
      'Almost every big turn in my life has started with a call like that, and I don’t think that’s special to me. You’ll get them too. You can’t ask for them. You can only be someone worth calling.',
    ),

    h.h2('Choose the team over being right'),
    h.p(
      'Being worth calling isn’t only about how you perform as an IC. It’s about what the team is like with you on it.',
    ),
    h.p(
      'Team harmony takes months to build and a moment to lose. At all three worlds events I went to, we had subs come with us. The synergy we’d built all season wasn’t there, and hours of practice only made the team more disgruntled. We stopped being one team, and that showed on stage.',
    ),
    h.p(
      'I’ve broken that harmony myself. After a heated game, or in the middle of an incident, it’s easy to let your frustration slip and take it out on others. It might feel righteous in that moment, but people remember it long after.',
    ),
    TeamFigure(h, { key: 'team' }),
    h.p(
      'One person can set the tone for a whole team, for better or worse. Bring in the wrong one, and people start working around them instead of with them, and the whole team gets slower and less fun. Don’t be that person, and don’t hire them.',
    ),
    h.p('People rarely remember who was right. They remember how you made them feel.'),

    h.h2('Trust what you’ve built'),
    h.p('Being worth calling matters most when you take a risk.'),
    h.p(
      'In 2021 I took a leap of faith and started my own thing with no clients lined up, trusting I’d figure it out with a little help from the universe.',
    ),
    h.p(
      'Funny enough, it did, that same week. An engineer I’d worked with, and hadn’t really talked to in almost a year, heard I was going out on my own and gave me a call. That call became my first contract, Webaholics.',
    ),
    h.p(
      'More calls followed. Some people wanted to build something together, and others wanted to introduce me to someone who did. For a few years I contracted on nothing but word of mouth from friends who’d worked with me before.',
    ),
    h.p(
      'Those calls even led to founding a company. It was my first time helping with sales and getting feedback straight from customers, and it made me a much more well-rounded engineer.',
    ),
    h.p(
      'If you’ve been useful to people, you have a safety net you can’t see. Sometimes you have to jump to find out it’s there.',
    ),
    NetworkFigure(h, { key: 'network' }),

    h.h2('How to be someone worth calling'),
    h.p(
      h.strong('Understand the problems.'),
      ' Talk to customers, watch session replays, and dig through your data. The more of the picture you see, the better the solutions you’ll come up with.',
    ),
    h.p(
      h.strong('Build with intent.'),
      ' Build for a better user experience, a better developer or agent experience, or a real return for the org. Push your knowledge however you can along the way, and don’t settle for the status quo.',
    ),
    h.p(
      h.strong('Be intentional about how you communicate.'),
      ' The first sentence decides how the rest gets read, so make it count. When you need something from someone, lead with what you need, then give them the context to act on it. ',
      h.a.attr('href', 'https://www.smartbrevity.com/').children('Smart Brevity'),
      ' is a whole book on doing this well.',
    ),
    h.p(
      h.strong('Be the first to jump in.'),
      ' Fix problems as you find them. Answer the question in Slack. Be the person people come to by default. If you’re not sure where to start, mirror the top performers on your team. If there isn’t one, join a team that has one.',
    ),
    h.p(
      h.strong('Give back to open source.'),
      ' Maintaining open source is thankless. Maintainers hear far more complaints than thanks, and AI has made that ten times worse. When a tool you use has a bug or is missing something, open a ',
      h.em('high-quality'),
      ' PR.',
    ),
    h.p(
      h.strong('See the cup half full.'),
      ' Things will break, deals will fall through, and launches will slip. Look for what you can still do, not who to blame. People want to work with someone who makes the hard days lighter.',
    ),
    h.p(
      h.strong('Believe in yourself.'),
      ' Except for physics, every ceiling is one you put there yourself. When you’re stuck, borrow George Mack’s evil twin from ',
      h.a.attr('href', 'https://www.highagency.com/').children('High Agency'),
      ': what would a version of you with ten times the agency do here?',
    ),
    h.p(
      h.strong('Be picky about who and what you spend your time with.'),
      ' Surround yourself with people who have high standards and the same level of ambition. Like Arnold says in ',
      h.a.attr('href', 'https://beusefulbook.com/').children(h.em('Be Useful')),
      ', nobody is self-made.',
    ),

    h.h2('The calls keep coming'),
    h.p(
      'I still get calls. People I’ve worked with asking if I’m open to something new, or if I’d want to found a company with them. The network grows with the career. It happens naturally.',
    ),
    h.p(
      'In ',
      h.a.attr('href', 'https://sunilpai.dev/posts/collecting-favours').children('collecting favours'),
      ', Sunil Pai writes about a fundraiser that brought in $56,000 in two weeks, and says the money really took fifteen years to raise. That’s how these calls work: years to earn, one phone call to arrive.',
    ),
    h.p(
      'Arnold’s book is named after what his dad used to tell him: “Be useful, Arnold.” Be useful. Be kind. Chase the dream. Enjoy the journey. Give your best even when nobody’s keeping score.',
    ),
    h.blockquote(
      h.p('Unless someone like you cares a whole awful lot, nothing is going to get better. It’s not.'),
      h.p(h.em('The Lorax'), ', Dr. Seuss'),
    ),
    ForestFigure(h, { key: 'forest' }),
  ],
}
