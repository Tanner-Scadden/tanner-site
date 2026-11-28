import { Html } from '@effect/ui/html'
import { HtmlScene } from '@effect/ui/html/testing'
import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Option, Schema } from 'effect'

import { Code, Note } from '../components/Prose.ts'
import { POSTS } from '../posts.ts'
import { distance } from './fuzzy.ts'
import { type Doc, build } from './index.ts'
import { postDocs } from './posts.ts'
import { Atom, parse } from './query.ts'
import { expand, search } from './search.ts'
import { type Snippet, snippetOf } from './snippet.ts'
import { stem } from './stem.ts'
import { plainText } from './text.ts'
import { fold, tokenize } from './tokenize.ts'

const terms = (text: string): ReadonlyArray<string> => Arr.map(tokenize(text), token => token.term)

const doc = (id: string, fields: Partial<Doc> = {}): Doc => ({
  id,
  date: '2026-01-01',
  title: '',
  summary: '',
  body: '',
  ...fields,
})

const ids = (index: ReturnType<typeof build>, query: string) => Arr.map(search(index, query), r => r.id)

describe('tokenize', () => {
  it('splits on word boundaries and keeps where each word was', () => {
    const tokens = tokenize('Hello, world! It’s 2026.')
    assert.deepStrictEqual(
      Arr.map(tokens, t => t.surface),
      ['hello', 'world', "it's", '2026'],
    )
    assert.deepStrictEqual(
      Arr.map(tokens, t => [t.start, t.end, t.position]),
      [
        [0, 5, 0],
        [7, 12, 1],
        [14, 18, 2],
        [19, 23, 3],
      ],
    )
  })

  it('folds case and accents', () => {
    assert.strictEqual(fold('Café CRÈME naïve'), 'cafe creme naive')
    assert.deepStrictEqual(terms('Café'), terms('cafe'))
  })

  it('treats curly and straight apostrophes the same', () => {
    assert.deepStrictEqual(terms('you’re'), terms("you're"))
    assert.deepStrictEqual(terms('don’t'), terms('dont'))
    assert.deepStrictEqual(terms('peers’'), terms('peers'))
  })

  it('leaves a gap at a line break, so phrases stay in their paragraph', () => {
    const tokens = tokenize('safety\nnet')
    assert.deepStrictEqual(
      Arr.map(tokens, t => t.position),
      [0, 2],
    )
  })
})

describe('stem', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['run', 'run'],
    ['runs', 'run'],
    ['running', 'run'],
    ['calls', 'call'],
    ['calling', 'call'],
    ['called', 'call'],
    ['vouching', 'vouch'],
    ['vouched', 'vouch'],
    ['sentinels', 'sentinel'],
    ['caresses', 'caress'],
    ['ponies', 'poni'],
    ['ties', 'tie'],
    ['cats', 'cat'],
    ['gas', 'gas'],
    ['hopping', 'hop'],
    ['hoping', 'hope'],
    ['agreed', 'agre'],
    ['happiness', 'happi'],
    ['happy', 'happi'],
    ['generously', 'generous'],
    ['generation', 'generat'],
    ['communication', 'communic'],
    ['relational', 'relat'],
    ['conditional', 'condit'],
    ['rational', 'ration'],
    ['digitizer', 'digit'],
    ['electrical', 'electr'],
    ['hopeful', 'hope'],
    ['goodness', 'good'],
    ['adjustment', 'adjust'],
    ['adoption', 'adopt'],
    ['controll', 'control'],
    ['skies', 'sky'],
    ['dying', 'die'],
    ['news', 'news'],
    ['succeeding', 'succeed'],
    ['exceed', 'exceed'],
    ['consign', 'consign'],
    ['consigned', 'consign'],
    ['consistency', 'consist'],
    ['knightly', 'knight'],
    ['yelled', 'yell'],
    ['cry', 'cri'],
    ['by', 'by'],
  ]
  it('stems like Snowball English', () => {
    for (const [word, expected] of cases) assert.strictEqual(stem(word), expected, word)
  })
})

describe('distance', () => {
  it('counts inserts, deletes, substitutions and swaps', () => {
    assert.strictEqual(distance('sentinals', 'sentinels', 2), 1)
    assert.strictEqual(distance('clal', 'call', 2), 1)
    assert.strictEqual(distance('call', 'calls', 2), 1)
    assert.strictEqual(distance('kitten', 'sitting', 3), 3)
    assert.strictEqual(distance('kitten', 'sitting', 1), 2)
  })
})

describe('parse', () => {
  it('reads words, phrases, exclusions and OR', () => {
    const query = parse('arena OR league "safety net" -worlds ')
    assert.deepStrictEqual(query.clauses, [
      [
        Atom.cases.Word.make({ word: 'arena', prefix: false }),
        Atom.cases.Word.make({ word: 'league', prefix: false }),
      ],
      [Atom.cases.Phrase.make({ words: ['safety', 'net'], prefix: false })],
    ])
    assert.deepStrictEqual(query.excluded, [Atom.cases.Word.make({ word: 'worlds', prefix: false })])
  })

  it('makes the word being typed a prefix', () => {
    assert.deepStrictEqual(parse('be vouc').clauses[1], [Atom.cases.Word.make({ word: 'vouc', prefix: true })])
    assert.deepStrictEqual(parse('be vouc ').clauses[1], [Atom.cases.Word.make({ word: 'vouc', prefix: false })])
  })

  it('runs an unclosed quote to the end, its last word a prefix while typed', () => {
    assert.deepStrictEqual(parse('"safety ne').clauses, [[Atom.cases.Phrase.make({ words: ['safety', 'ne'], prefix: true })]])
    assert.deepStrictEqual(parse('"safety net"').clauses, [
      [Atom.cases.Phrase.make({ words: ['safety', 'net'], prefix: false })],
    ])
    assert.deepStrictEqual(parse('"safety ne ').clauses, [
      [Atom.cases.Phrase.make({ words: ['safety', 'ne'], prefix: false })],
    ])
  })

  it('reads curly double quotes as quotes', () => {
    const phrase = Atom.cases.Phrase.make({ words: ['safety', 'net'], prefix: false })
    assert.deepStrictEqual(parse('“safety net”').clauses, [[phrase]])
    assert.deepStrictEqual(parse('arena -“safety net” ').excluded, [phrase])
    assert.deepStrictEqual(parse('arena -“safety net” ').clauses, [[Atom.cases.Word.make({ word: 'arena', prefix: false })]])
  })
})

describe('ranking', () => {
  it('ranks by BM25: more of the word, in less text, ranks higher', () => {
    const index = build([
      doc('once', { body: 'a call came in, and then many other things happened that day' }),
      doc('often', { body: 'call after call after call' }),
      doc('never', { body: 'nothing here' }),
    ])
    assert.deepStrictEqual(ids(index, 'call '), ['often', 'once'])
  })

  it('boosts the title over the summary over the body', () => {
    const index = build([
      doc('body', { body: 'safety first' }),
      doc('title', { title: 'safety first' }),
      doc('summary', { summary: 'safety first' }),
    ])
    assert.deepStrictEqual(ids(index, 'safety '), ['title', 'summary', 'body'])
  })

  it('breaks a tie with the newest post first', () => {
    const index = build([
      doc('old', { date: '2025-01-01', body: 'same words' }),
      doc('new', { date: '2026-06-01', body: 'same words' }),
    ])
    assert.deepStrictEqual(ids(index, 'same '), ['new', 'old'])
  })
})

describe('the query language', () => {
  const index = build([
    doc('net', { date: '2026-03-01', body: 'You have a safety net you can’t see.' }),
    doc('apart', { date: '2026-02-01', body: 'The net was there for safety.' }),
    doc('arena', { date: '2026-01-01', body: 'Arena of Valor, then Wild Rift.' }),
  ])

  it('ANDs bare words', () => {
    assert.deepStrictEqual(ids(index, 'safety net '), ['apart', 'net'])
    assert.deepStrictEqual(ids(index, 'safety arena '), [])
  })

  it('matches a quoted phrase only in order', () => {
    assert.deepStrictEqual(ids(index, '"safety net"'), ['net'])
    assert.deepStrictEqual(ids(index, '“safety net”'), ['net'])
    assert.deepStrictEqual(ids(index, '"net safety"'), [])
  })

  it('completes the last word of a phrase being typed', () => {
    assert.deepStrictEqual(ids(index, '"safety ne'), ['net'])
    assert.deepStrictEqual(ids(index, '“safety ne'), ['net'])
    assert.deepStrictEqual(ids(index, '"safety ne"'), [])
    assert.deepStrictEqual(ids(index, '"safety ne '), [])
  })

  it('leaves out excluded words and phrases', () => {
    assert.deepStrictEqual(ids(index, 'safety -see '), ['apart'])
    assert.deepStrictEqual(ids(index, 'safety -"safety net" '), ['apart'])
    assert.deepStrictEqual(ids(index, 'safety -“safety net” '), ['apart'])
    assert.deepStrictEqual(ids(index, '-safety '), ['arena'])
  })

  it('takes either side of OR', () => {
    assert.sameMembers([...ids(index, 'see OR rift ')], ['net', 'arena'])
  })

  it('completes the word being typed', () => {
    assert.sameMembers([...ids(index, 'saf')], ['net', 'apart'])
    assert.deepStrictEqual(ids(index, 'saf '), [])
  })

  it('forgives a typo, below an exact hit', () => {
    assert.sameMembers([...ids(index, 'saftey ')], ['net', 'apart'])
    const typo = build([doc('exact', { body: 'calls' }), doc('near', { body: 'balls' })])
    assert.deepStrictEqual(ids(typo, 'calls '), ['exact'])
    assert.deepStrictEqual(ids(typo, 'xalls '), ['exact', 'near'])
    const both = build([doc('exact', { body: 'sentinels' }), doc('near', { body: 'sentinals' })])
    assert.deepStrictEqual(ids(both, 'sentinels OR sentinalz '), ['exact', 'near'])
    assert.isBelow(expand(index, 'saftey', false)[0]!.weight, 1)
    assert.deepStrictEqual(ids(index, 'nat '), [])
  })
})

const partText = (part: Snippet['parts'][number]): string => {
  if (part.marked) return `[${part.text}]`
  return part.text
}

const text = (snippet: Option.Option<Snippet>) =>
  Option.match(snippet, {
    onNone: () => '',
    onSome: s => Arr.join(Arr.map(s.parts, partText), ''),
  })

describe('highlighting', () => {
  const long = Arr.join(Arr.makeBy(40, i => `word${i}`), ' ')
  const index = build([
    doc('a', { summary: 'A short summary about trust.', body: `${long} Trust is built in drops and lost in buckets. ${long}` }),
    doc('b', { summary: 'Only the summary says vouching.', body: 'Nothing else.' }),
    doc('c', { title: 'Trust me', body: 'No match here.' }),
  ])
  const snippet = (query: string, id: string) =>
    text(
      Option.flatMap(
        Arr.findFirst(search(index, query), r => r.id === id),
        r => snippetOf(index, r),
      ),
    )

  it('cuts the best part of the body and marks the matched words', () => {
    assert.strictEqual(
      snippet('drops buckets ', 'a'),
      '… word39 Trust is built in [drops] and lost in [buckets]. word0 word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 …',
    )
  })

  it('keeps to one paragraph, whole when it fits', () => {
    const blocks = build([doc('d', { body: 'Some opening words.\nThe safety net is here. You can’t see it.\nHow to be useful' })])
    const [result] = search(blocks, 'safety ')
    assert.strictEqual(text(snippetOf(blocks, result!)), 'The [safety] net is here. You can’t see it.')
  })

  it('marks a phrase word by word', () => {
    assert.include(snippet('"lost in buckets"', 'a'), '[lost] [in] [buckets]')
  })

  it('marks the summary when only the summary matched', () => {
    assert.strictEqual(snippet('vouch ', 'b'), 'Only the summary says [vouching].')
  })

  it('has no snippet for a title-only match', () => {
    assert.strictEqual(snippet('trust ', 'c'), '')
  })
})

describe('body text', () => {
  it.effect('reads text from a view, a line per block, without mounting anything', () =>
    Effect.gen(function* () {
      let read = ''
      const Probe = Html.component({ name: 'Probe', model: Schema.Struct({}), message: Schema.Never }).make({
        init: () => ({}),
        update: $ => $.model,
        view: h => {
          read = plainText([h.h2('Title'), h.p('One ', h.strong('two'), '.'), h.ul(h.li('a'), h.li('b'))])
          return h.p('read')
        },
      })
      yield* Effect.scoped(HtmlScene.make(Probe, {}))
      assert.strictEqual(read, 'Title\nOne two.\na\nb')
    }),
  )

  it.effect('keeps a note’s label off its first word, and leaves out a listing’s chrome', () =>
    Effect.gen(function* () {
      let read = ''
      const Probe = Html.component({ name: 'Probe', model: Schema.Struct({}), message: Schema.Never }).make({
        init: () => ({}),
        update: $ => $.model,
        view: h => {
          read = plainText([
            Note(h, 'ASIDE', h.p('First words.')),
            Code(h, { code: 'const x = 1', lang: 'ts' }),
            Code(h, { code: 'echo hi', lang: 'bash', file: 'run.sh' }),
            h.p('After.', h.span('hidden').attr('aria-hidden', 'true')),
          ])
          return h.p('read')
        },
      })
      yield* Effect.scoped(HtmlScene.make(Probe, {}))
      assert.strictEqual(read, 'ASIDE\nFirst words.\nAfter.')
    }),
  )
})

const viewTexts = Effect.gen(function* () {
  let texts: ReadonlyArray<string> = []
  const Probe = Html.component({ name: 'Probe', model: Schema.Struct({}), message: Schema.Never }).make({
    init: () => ({}),
    update: $ => $.model,
    view: h => {
      texts = Arr.map(POSTS, post => plainText(post.body(h)))
      return h.p('read')
    },
  })
  yield* HtmlScene.make(Probe, {})
  return texts
}).pipe(Effect.scoped)

describe('the blog’s own posts', () => {
  it.effect('read the same as a view renders them', () =>
    Effect.gen(function* () {
      const rendered = yield* viewTexts
      assert.deepStrictEqual(
        Arr.map(postDocs(POSTS), d => d.body),
        rendered,
      )
    }),
  )

  it('find Be Someone Worth Calling', () => {
    const docs = postDocs(POSTS)
    const index = build(docs)
    const post = 'be-someone-worth-calling'
    const body = Option.getOrThrow(Arr.findFirst(docs, d => d.id === post)).body
    assert.include(body, 'they’ll remember it long after.')
    for (const query of ['sentinels', 'vouching', '"safety net"', 'calls', 'call', 'called ', 'sentinals', 'vouch']) {
      assert.include(ids(index, query), post, query)
    }
    assert.deepStrictEqual(ids(index, 'zzzz nothing'), [])
    assert.deepStrictEqual(ids(index, 'sentinels -arena'), [])
  })
})
