import { dual } from 'effect/Function'

// How many edits a word of this length may be off by: none for short words,
// where one edit is a different word, one from 4 letters, two from 8.
export const editsFor = (word: string): number => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0)

// The distance between a and b, or `max + 1` once it's known to be over `max`.
export const distance: {
  (b: string, max: number): (a: string) => number
  (a: string, b: string, max: number): number
} = dual(3, (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1
  if (a === b) return 0
  const n = b.length
  let before: Array<number> = []
  let previous: Array<number> = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row: Array<number> = [i]
    let best = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min((previous[j] as number) + 1, (row[j - 1] as number) + 1, (previous[j - 1] as number) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, (before[j - 2] as number) + 1)
      }
      row.push(d)
      if (d < best) best = d
    }
    if (best > max) return max + 1
    before = previous
    previous = row
  }
  return Math.min(previous[n] as number, max + 1)
})
