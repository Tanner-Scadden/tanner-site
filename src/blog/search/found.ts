import { Array as Arr } from 'effect'

import type { SearchIndex } from './index.ts'
import type { Found } from './schema.ts'
import { search } from './search.ts'
import { snippetOf } from './snippet.ts'

// A search over an index, as the page shows it: the matching posts, best
// first, each with its snippet. The worker and the in-page fallback both run
// this.
export const searchIndex =
  (index: SearchIndex) =>
  (query: string): ReadonlyArray<Found> =>
    Arr.map(search(index, query), result => ({ id: result.id, snippet: snippetOf(index, result) }))
