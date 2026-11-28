import { Array as Arr, Option, Record as Rec, String as Str } from 'effect'

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])

const vowelAt = (w: string, i: number): boolean => Option.exists(Str.charAt(w, i), c => VOWELS.has(c))

const DOUBLES = new Set(['bb', 'dd', 'ff', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt'])
const LI_ENDINGS = new Set(['c', 'd', 'e', 'g', 'h', 'k', 'm', 'n', 'r', 't'])

const EXCEPTIONS: ReadonlyMap<string, string> = new Map(Rec.toEntries({
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
}))

const AFTER_1A = new Set(['inning', 'outing', 'canning', 'herring', 'earring', 'proceed', 'exceed', 'succeed'])

const R1_PREFIXES = ['gener', 'commun', 'arsen', 'past', 'univers', 'later', 'emerg', 'organ'] as const

const regionAfter = (w: string, from: number): number => {
  for (let i = from + 1; i < w.length; i++) {
    if (!vowelAt(w, i) && vowelAt(w, i - 1)) return i + 1
  }
  return w.length
}

const shortSyllableAt = (w: string, i: number): boolean => {
  if (i === 1) return vowelAt(w, 0) && !vowelAt(w, 1)
  return (
    i >= 2 &&
    !vowelAt(w, i - 2) &&
    vowelAt(w, i - 1) &&
    Option.exists(Str.charAt(w, i), c => !VOWELS.has(c) && c !== 'w' && c !== 'x' && c !== 'Y')
  )
}

const endsShortSyllable = (w: string): boolean => shortSyllableAt(w, w.length - 1)

const longestSuffix = (w: string, suffixes: ReadonlyArray<string>): Option.Option<string> =>
  Arr.findFirst(suffixes, suffix => Str.endsWith(suffix)(w))

const hasVowel = (w: string): boolean => {
  for (let i = 0; i < w.length; i++) if (vowelAt(w, i)) return true
  return false
}

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

const withoutLeadingApostrophe = (word: string): string => {
  if (Str.startsWith("'")(word)) return Str.slice(1)(word)
  return word
}

const markedAt = (w: string, c: string, i: number): string => {
  if (c === 'y' && (i === 0 || vowelAt(w, i - 1))) return 'Y'
  return c
}

const markConsonantY = (w: string): string => Arr.join(Arr.map(Str.split(w, ''), (c, i) => markedAt(w, c, i)), '')

const iesEnding = (w: string): string => {
  if (w.length > 1) return 'i'
  return 'ie'
}

export const stem = (word: string): string => {
  if (word.length <= 2) return word
  const exception = Option.fromNullishOr(EXCEPTIONS.get(word))
  if (Option.isSome(exception)) return exception.value

  let w = markConsonantY(withoutLeadingApostrophe(word))

  const prefix = Arr.findFirst(R1_PREFIXES, p => Str.startsWith(p)(w))
  const r1 = Option.match(prefix, { onNone: () => regionAfter(w, 0), onSome: p => p.length })
  const r2 = regionAfter(w, r1)
  const inR1 = (suffix: string) => w.length - suffix.length >= r1
  const inR2 = (suffix: string) => w.length - suffix.length >= r2
  const cut = (n: number) => {
    w = Str.slice(0, w.length - n)(w)
  }

  Option.map(longestSuffix(w, ["'s'", "'s", "'"]), suffix => cut(suffix.length))

  Option.map(longestSuffix(w, ['sses', 'ied', 'ies', 'us', 'ss', 's']), suffix => {
    if (suffix === 'sses') cut(2)
    else if (suffix === 'ied' || suffix === 'ies') {
      cut(3)
      w += iesEnding(w)
    } else if (suffix === 's' && w.length >= 2 && hasVowel(Str.slice(0, -2)(w))) cut(1)
  })
  if (AFTER_1A.has(w)) return w

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

  if (w.length > 2 && (Str.endsWith('y')(w) || Str.endsWith('Y')(w)) && !vowelAt(w, w.length - 2)) {
    w = Str.slice(0, -1)(w) + 'i'
  }

  Option.map(findPair(w, STEP2), ([suffix, to]) => {
    if (!inR1(suffix)) return
    if (suffix === 'ogi' && w[w.length - 4] !== 'l') return
    if (suffix === 'li' && !LI_ENDINGS.has(w[w.length - 3] ?? '')) return
    w = Str.slice(0, w.length - suffix.length)(w) + to
  })

  Option.map(findPair(w, STEP3), ([suffix, to]) => {
    if (!inR1(suffix)) return
    if (suffix === 'ative' && !inR2(suffix)) return
    w = Str.slice(0, w.length - suffix.length)(w) + to
  })

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

  if (Str.endsWith('e')(w)) {
    if (inR2('e') || (inR1('e') && !endsShortSyllable(Str.slice(0, -1)(w)))) cut(1)
  } else if (Str.endsWith('ll')(w) && inR2('l')) cut(1)

  return Str.replaceAll('Y', 'y')(w)
}
