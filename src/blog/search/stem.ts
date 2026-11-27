import { Array as Arr, Option, String as Str } from 'effect'

// NOTE: the Snowball English (Porter2) stemmer, after
// https://snowballstem.org/algorithms/english/stemmer.html. It takes a
// folded, lowercase word and returns its stem: "running" and "runs" give
// "run", "vouching" gives "vouch". A stem isn't always a word ("happi"), but
// every form of a word gets the same one, which is all search needs.
//
// Each step looks for the longest suffix it knows. If that one's condition
// fails, the step does nothing: it never falls back to a shorter suffix.

const isVowel = (c: string | undefined): boolean =>
  c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u' || c === 'y'

const DOUBLES = new Set(['bb', 'dd', 'ff', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt'])
const LI_ENDINGS = new Set(['c', 'd', 'e', 'g', 'h', 'k', 'm', 'n', 'r', 't'])

// Whole words with a stem of their own.
const EXCEPTIONS: Readonly<Record<string, string>> = {
  skis: 'ski',
  skies: 'sky',
  idly: 'idl',
  gently: 'gentl',
  ugly: 'ugli',
  early: 'earli',
  only: 'onli',
  singly: 'singl',
  sky: 'sky',
  news: 'news',
  howe: 'howe',
  atlas: 'atlas',
  cosmos: 'cosmos',
  bias: 'bias',
  andes: 'andes',
  dying: 'die',
  lying: 'lie',
  tying: 'tie',
}

// Words step 1a leaves alone.
const AFTER_1A = new Set(['inning', 'outing', 'canning', 'herring', 'earring', 'proceed', 'exceed', 'succeed'])

// Prefixes whose R1 starts right after them.
const R1_PREFIXES = ['gener', 'commun', 'arsen', 'past', 'univers', 'later', 'emerg', 'organ'] as const

// The region after the first non-vowel that follows a vowel, from `from`.
const regionAfter = (w: string, from: number): number => {
  for (let i = from + 1; i < w.length; i++) {
    if (!isVowel(w[i]) && isVowel(w[i - 1])) return i + 1
  }
  return w.length
}

// A short syllable ending at `i`: a vowel then a non-vowel other than w, x or
// Y, after a non-vowel; or a vowel then a non-vowel at the start.
const shortSyllableAt = (w: string, i: number): boolean => {
  if (i === 1) return isVowel(w[0]) && !isVowel(w[1])
  const c = w[i]
  return (
    i >= 2 && !isVowel(w[i - 2]) && isVowel(w[i - 1]) && !isVowel(c) && c !== 'w' && c !== 'x' && c !== 'Y'
  )
}

const endsShortSyllable = (w: string): boolean => shortSyllableAt(w, w.length - 1)

const longestSuffix = (w: string, suffixes: ReadonlyArray<string>): Option.Option<string> =>
  Arr.findFirst(suffixes, suffix => Str.endsWith(suffix)(w))

const hasVowel = (w: string): boolean => {
  for (let i = 0; i < w.length; i++) if (isVowel(w[i])) return true
  return false
}

// Step 2's suffixes, longest first, with what each becomes.
const STEP2: ReadonlyArray<readonly [string, string]> = [
  ['ization', 'ize'],
  ['ational', 'ate'],
  ['fulness', 'ful'],
  ['ousness', 'ous'],
  ['iveness', 'ive'],
  ['tional', 'tion'],
  ['biliti', 'ble'],
  ['lessli', 'less'],
  ['entli', 'ent'],
  ['ation', 'ate'],
  ['alism', 'al'],
  ['aliti', 'al'],
  ['ousli', 'ous'],
  ['iviti', 'ive'],
  ['fulli', 'ful'],
  ['enci', 'ence'],
  ['anci', 'ance'],
  ['abli', 'able'],
  ['izer', 'ize'],
  ['ator', 'ate'],
  ['alli', 'al'],
  ['bli', 'ble'],
  ['ogi', 'og'],
  ['li', ''],
]

const STEP3: ReadonlyArray<readonly [string, string]> = [
  ['ational', 'ate'],
  ['tional', 'tion'],
  ['alize', 'al'],
  ['icate', 'ic'],
  ['iciti', 'ic'],
  ['ative', ''],
  ['ical', 'ic'],
  ['ness', ''],
  ['ful', ''],
]

const STEP4 = [
  'ement',
  'ance',
  'ence',
  'able',
  'ible',
  'ment',
  'ant',
  'ent',
  'ism',
  'ate',
  'iti',
  'ous',
  'ive',
  'ize',
  'ion',
  'al',
  'er',
  'ic',
] as const

const findPair = (w: string, table: ReadonlyArray<readonly [string, string]>) =>
  Arr.findFirst(table, ([suffix]) => Str.endsWith(suffix)(w))

export const stem = (word: string): string => {
  if (word.length <= 2) return word
  const exception = EXCEPTIONS[word]
  if (exception !== undefined) return exception

  let w = Str.startsWith("'")(word) ? Str.slice(1)(word) : word
  // A y at the start or after a vowel is a consonant: mark it Y.
  let marked = ''
  for (let i = 0; i < w.length; i++) {
    marked += w[i] === 'y' && (i === 0 || isVowel(w[i - 1])) ? 'Y' : (w[i] as string)
  }
  w = marked

  const prefix = Arr.findFirst(R1_PREFIXES, p => Str.startsWith(p)(w))
  const r1 = Option.match(prefix, { onNone: () => regionAfter(w, 0), onSome: p => p.length })
  const r2 = regionAfter(w, r1)
  const inR1 = (suffix: string) => w.length - suffix.length >= r1
  const inR2 = (suffix: string) => w.length - suffix.length >= r2
  const cut = (n: number) => {
    w = Str.slice(0, w.length - n)(w)
  }

  // Step 0: possessives.
  Option.map(longestSuffix(w, ["'s'", "'s", "'"]), suffix => cut(suffix.length))

  // Step 1a: plurals.
  Option.map(longestSuffix(w, ['sses', 'ied', 'ies', 'us', 'ss', 's']), suffix => {
    if (suffix === 'sses') cut(2)
    else if (suffix === 'ied' || suffix === 'ies') {
      cut(3)
      w += w.length > 1 ? 'i' : 'ie'
    } else if (suffix === 's' && w.length >= 2 && hasVowel(Str.slice(0, -2)(w))) cut(1)
  })
  if (AFTER_1A.has(w)) return w

  // Step 1b: -ed and -ing.
  Option.map(longestSuffix(w, ['eedly', 'ingly', 'edly', 'eed', 'ing', 'ed']), suffix => {
    if (suffix === 'eed' || suffix === 'eedly') {
      if (inR1(suffix)) w = Str.slice(0, w.length - suffix.length)(w) + 'ee'
      return
    }
    const rest = Str.slice(0, w.length - suffix.length)(w)
    if (!hasVowel(rest)) return
    w = rest
    if (Str.endsWith('at')(w) || Str.endsWith('bl')(w) || Str.endsWith('iz')(w)) w += 'e'
    else if (DOUBLES.has(Str.slice(-2)(w))) cut(1)
    else if (r1 >= w.length && endsShortSyllable(w)) w += 'e'
  })

  // Step 1c: a final y after a consonant, not the first letter, becomes i.
  if (w.length > 2 && (Str.endsWith('y')(w) || Str.endsWith('Y')(w)) && !isVowel(w[w.length - 2])) {
    w = Str.slice(0, -1)(w) + 'i'
  }

  // Step 2.
  Option.map(findPair(w, STEP2), ([suffix, to]) => {
    if (!inR1(suffix)) return
    if (suffix === 'ogi' && w[w.length - 4] !== 'l') return
    if (suffix === 'li' && !LI_ENDINGS.has(w[w.length - 3] ?? '')) return
    w = Str.slice(0, w.length - suffix.length)(w) + to
  })

  // Step 3.
  Option.map(findPair(w, STEP3), ([suffix, to]) => {
    if (!inR1(suffix)) return
    if (suffix === 'ative' && !inR2(suffix)) return
    w = Str.slice(0, w.length - suffix.length)(w) + to
  })

  // Step 4.
  Option.map(
    Arr.findFirst(STEP4, suffix => Str.endsWith(suffix)(w)),
    suffix => {
      if (!inR2(suffix)) return
      if (suffix === 'ion') {
        const before = w[w.length - 4]
        if (before !== 's' && before !== 't') return
      }
      cut(suffix.length)
    },
  )

  // Step 5: a final e or l.
  if (Str.endsWith('e')(w)) {
    if (inR2('e') || (inR1('e') && !endsShortSyllable(Str.slice(0, -1)(w)))) cut(1)
  } else if (Str.endsWith('ll')(w) && inR2('l')) cut(1)

  return Str.replaceAll('Y', 'y')(w)
}
