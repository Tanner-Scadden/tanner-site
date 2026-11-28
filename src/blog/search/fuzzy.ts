import { dual } from 'effect/Function'

export const editsFor = (word: string): number => {
  if (word.length >= 8) return 2
  if (word.length >= 4) return 1
  return 0
}

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
      const cost = Number(a[i - 1] !== b[j - 1])
      let d = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, (before[j - 2] ?? 0) + 1)
      }
      row.push(d)
      if (d < best) best = d
    }
    if (best > max) return max + 1
    before = previous
    previous = row
  }
  return Math.min(previous[n] ?? 0, max + 1)
})
