---
name: blog-brainstorm
description: "Use before writing any blog post for this site: when the author wants to write a post, has an idea or topic for one, asks to brainstorm or outline a post, or asks you to start drafting. Finds out what the post is really for and what only the author can say, explores angles widely, then agrees on an angle and a brief before any prose gets written."
---

# Blog Brainstorm

You are very good at writing. You write the post you believe the author
wants, and that belief is usually thinner than it feels. A fluent draft
of the wrong post is worse than no draft: it anchors them to your angle
and your voice. This skill is for finding out what the post is actually
for, and why, before any of it gets written.

People often haven't finished working out what they want to say. Good
questions help them think it through. Once you understand why they're
writing it and who it's for, you can make the hundred small calls (what
to cut, what to open with, how technical to get) the way they would.

The flow has four parts:

1. **Interview:** one question at a time, until you know the why, the
   reader, the takeaway, and what only they can say.
2. **Diverge:** go wide on angles, with no judging.
3. **Converge:** agree on criteria, score, shortlist, and let them pick.
4. **Brief and gate:** write the brief, get it approved, and only then
   write prose.

Built on the `brainstorming` skill in
[obra/superpowers](https://github.com/obra/superpowers) (MIT, Jesse
Vincent) for the interview and the gate, and the diverge/converge
approach in
[mohitagw15856/pm-claude-skills](https://github.com/mohitagw15856/pm-claude-skills)
for the angles.

## First: What Do You Actually Know?

Before you reply, ask yourself: what do I know about this post, and why
they want to write it?

- **Everything that matters is already there** (a full outline, notes
  with a clear thesis and an angle, "turn this thread into a post").
  Echo it back in a few lines, flag anything missing, and go straight to
  the brief.
- **Something non-trivial is missing.** Start the interview.

Before you write any of the post, you must, in order:

1. Show the angles and have them pick one (see Diverge and Converge).
2. Write the brief (see The Brief).
3. Get their approval of the brief.

Writing the post itself is a separate step, after approval.

## Look Before You Ask

Dig in before your first message. Read what they pointed at: notes,
links, a PR, a thread, code they want to write about. Read the posts
already on the site (`src/content/posts/`, listed in
`src/content/blog.ts`) so you know their voice, what they've already
covered, and what a post here looks like. If the post is about something
in this repo or another one, read that code. Never ask what the material
already answers.

## 1. Interview

### Your first message

Move the post forward with one of these:

- **They've said a lot** (notes, a rough outline, a clear topic and
  reason): aim for about 200 words. Echo the post back in your own
  words: what it's about, who it's for, and why they're writing it, as
  far as they've said. Add what you found that bears on it: a related
  post already on the site, a detail in the code that changes the story,
  a well-known take they'd be arguing with. End with one line inviting
  corrections. Then, if they haven't said why they're writing it, ask
  about that: one open question, with nothing to pick from.
- **They haven't** (just a topic, "I want to write about X"): one open
  question about the biggest thing still unsettled. Say why you're
  asking, i.e. what the answer would change about the post. For "a post
  about Effect": "If this is for people deciding whether to try it, I'd
  lead with one before-and-after; if it's for people already using it,
  that's a different post. Who do you picture reading this?"

How the message ends depends on whether they asked to brainstorm:

- **They asked for it:** end there.
- **They didn't** (they asked for a draft): end with a one-line offer to
  skip ahead, like "Or if you'd rather I just take a first pass, say so."
  If they take it, this skill is done: state the angle and audience
  you're assuming in one line, then write.

That's the whole message.

### The conversation

Ask a question only when the answer would change the post and neither
they nor the material answers it. Otherwise, state your call and your
reason as a proposal they can correct. Ask one question at a time, in
plain language. You never need to quote this skill to them.

**Get them describing.** Until you know why they're writing it, ask
open questions with no example answers attached. Their own words carry
the voice and intent your options can't. Once you know why, when a
decision has nameable choices, sketch each concretely with what it
trades off and which you'd pick. When they say "what do you think?",
propose something concrete.

**Ground to cover.** This is territory, not a script. Never read these
out as a list:

- the one thing a reader should walk away with
- who the reader is, and what they already know
- why now: what happened that made this worth writing
- what only they can say: the story, the mistake, the number, the
  opinion nobody else has. A post without this is a summary of the docs.
- what it's arguing with: the common take, the thing they used to believe
- anti-goals: what would make it a failure even if it's well written
  (too long, a tutorial when they wanted an opinion, a rant)
- what's out of scope, saved for another post

**Make every question specific.** Build each one on their last answer,
the way a sharp editor would: "You said the migration took a week, but
the fix was one line. Is the post about the line, or about the week?"

**Do recon.** Once you have some grounding and looking further would
help, go look: the code, the commit history, the docs they're reacting
to, what's already been written on the topic. Say what you looked for
and what you found, especially if the obvious version of the post
already exists.

**Play it back.** As soon as you understand one part well enough to
describe it (who it's for and why, say, or the takeaway), describe it
back in a short paragraph, then return to questions about the next
part. Only what they said goes in as theirs. Anything you filled in
goes in as your proposal, with your reason. End each chunk by asking
what's wrong or missing.

The interview is done when you can state the reader, the takeaway, why
now, and what only they can say, and they've agreed with your playback.

## 2. Diverge

In a message of its own, go wide: 15 to 20 angles. The first eight or
so are the ones anyone would write; get them out of the way fast. The
non-obvious ones come after. Switch strategies instead of rewording, and
use at least five of these:

- **Story:** what happened, in order, and what they learned
- **Contrarian:** the common advice, and why it was wrong here
- **Teardown:** one concrete thing, taken apart
- **How-to:** the steps, for someone about to do the same thing
- **What I got wrong:** the mistake as the spine
- **Inversion:** how to make the problem worse, flipped
- **Extremes:** the 300-word version, the definitive version
- **Transplant:** how another field deals with the same problem
- **Combination:** two earlier angles forced together

Each angle gets a working title and one line on the thesis. Group them
by strategy. Keep a weird tail: two or three should make them slightly
uncomfortable. A list with no strange ideas didn't explore.

**No judging in this message.** No "the strongest is", no ranking, no
asides about which you like. Judgment kills range. End by asking which
ones grab them and whether any are missing.

## 3. Converge

In the next message, propose three or four criteria before you look at
the list again, tied to what they told you in the interview. Good
defaults:

- **Theirs:** uses what only they can say
- **Reader fit:** lands for the reader you agreed on
- **Takeaway:** delivers the one thing a reader should leave with
- **Fresh:** isn't already done better elsewhere

Let them adjust the criteria. Then score every angle coarsely with ✅,
➖ or ❌ per criterion. Anything finer is false precision.

Shortlist three, plus one labeled **wildcard**: the high-variance pick
that might be the best post or might not work. For each, give the
working title, the thesis, the opening, and what it trades off.
Recommend one and say why, then ask which they want.

Keep the rejects. Each gets a line: the criterion it failed and what
would bring it back ("good as its own post once the migration is
done"). They go in the brief, so a good idea isn't lost.

## 4. The Brief

Once they've picked an angle, write a brief that a good writer could
draft the post from without going back to them:

- **Working title** and a one-or-two-sentence **summary** (it becomes the
  post's `summary` on the index)
- **Slug** (lowercase words joined by dashes)
- **Reader:** who, and what they already know
- **Takeaway:** the one thing they should leave with
- **Angle:** the one they picked, the criteria, the shortlist, and why
  this one
- **Hook:** how it opens
- **Outline:** section headings, each with a line on what it has to do
- **Their material:** the stories, numbers, code and opinions to use, in
  their words where they gave them
- **Anti-goals and out of scope**
- **Length and tone**
- **Open calls:** anything you decided yourself, marked as yours
- **Reject ledger:** the angles not taken, why, and what would revive them

Save it to `docs/posts/YYYY-MM-DD-<slug>-brief.md` and say where it is.
Their preferences override that location.

<HARD-GATE>
No post prose gets written until they approve the brief. That includes
"just the intro", a sample paragraph, and a draft "to react to".
Reading, recon and the brief itself are fine.

One exception: if they opted out of the questions, the skill is done
and the gate goes with it.

Once the brief is approved, write the post as a new file in
`src/content/posts/`, starting from the style guide post, and register
it in `src/content/blog.ts`.
</HARD-GATE>

## Red Flags

| Thought | Reality |
|---------|---------|
| "I'll start by suggesting some topics" | Options steer. Get them describing first. The angles come after the interview. |
| "I'll write a quick draft so they have something to react to" | A draft anchors them to your angle and your voice. Brief first. |
| "I'll fill in the audience and tone" | Fine. Say them out loud. A default they never heard is one they couldn't reject. |
| "The topic is clear, so the post is clear" | The topic isn't the post. Find the takeaway and what only they can say. |
| "Ten good angles is plenty" | Ten polished angles is a search result. Push past them, and keep the weird ones. |
| "This one's obviously best, I'll say so while listing" | No judging while diverging. Criteria first, then score. |
| "I'll pick criteria after seeing the list" | Then they'll bend to bless a favorite. Criteria first. |
| "The rejects are noise" | The reject ledger is half the value. Keep it in the brief. |
| "They said 'sounds good' to the idea" | Approval covers what you showed them. A brief you haven't written isn't approved. |
