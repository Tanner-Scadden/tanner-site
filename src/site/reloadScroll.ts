import { Array as Arr, Effect, Option, Schema, Scope, pipe } from 'effect'

// A reload puts the reader back where they were. The Router turns the
// browser's own scroll restoration off and only restores positions for
// Back and Forward within a visit, so on a reload the browser jumps to
// the URL's hash instead: after a floor plan link, that is a section the
// reader may have long scrolled away from.

const STORAGE_KEY = 'scroll'

class ScrollStorageError extends Schema.TaggedError<
  ScrollStorageError,
  { readonly brand: unique symbol }
>()('ScrollStorageError', {
  reason: Schema.String,
}) {}

const toStorageError = (error: unknown): ScrollStorageError =>
  ScrollStorageError.make({ reason: String(error) })

const SavedScroll = Schema.Struct({
  url: Schema.String,
  x: Schema.Finite,
  y: Schema.Finite,
})
type SavedScroll = typeof SavedScroll.Type

const decodeSaved = Schema.decodeUnknownOption(Schema.fromJsonString(SavedScroll))
const encodeSaved = Schema.encodeEffect(Schema.fromJsonString(SavedScroll))

const isReload = (): boolean =>
  Arr.some(
    performance.getEntriesByType('navigation'),
    entry => (entry as PerformanceNavigationTiming).type === 'reload',
  )

// NOTE: sessionStorage can be missing or throw (blocked site data), so a
// failed read restores nothing and a failed write is ignored. A saved
// position is read once, so a later reload never reuses a stale one.
const takeSaved: Effect.Effect<Option.Option<SavedScroll>> = pipe(
  Effect.try({
    try: () => {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      sessionStorage.removeItem(STORAGE_KEY)
      return Option.fromNullishOr(raw)
    },
    catch: toStorageError,
  }),
  Effect.map(Option.flatMap(decodeSaved)),
  Effect.orElseSucceed(() => Option.none<SavedScroll>()),
)

const save: Effect.Effect<void> = pipe(
  Effect.suspend(() =>
    encodeSaved({ url: location.href, x: window.scrollX, y: window.scrollY }),
  ),
  Effect.flatMap(json =>
    Effect.try({
      try: () => sessionStorage.setItem(STORAGE_KEY, json),
      catch: toStorageError,
    }),
  ),
  Effect.ignore,
)

/** Saves the scroll position whenever the page is hidden, for as long as the scope lives. */
export const saveScrollOnHide: Effect.Effect<void, never, Scope.Scope> = Effect.asVoid(
  Effect.acquireRelease(
    Effect.sync(() => {
      const onHide = () => Effect.runSync(save)
      window.addEventListener('pagehide', onHide)
      return onHide
    }),
    onHide => Effect.sync(() => window.removeEventListener('pagehide', onHide)),
  ),
)

// NOTE: the browser still scrolls to the URL's hash when the page finishes
// loading, smoothly given `scroll-behavior: smooth`, so the restore waits a
// frame past the load event, and its instant scroll cancels that one.
const loaded: Effect.Effect<void> = Effect.callback<void>(resume => {
  const settle = () => requestAnimationFrame(() => resume(Effect.void))
  if (document.readyState === 'complete') {
    settle()
    return
  }
  window.addEventListener('load', settle, { once: true })
  return Effect.sync(() => window.removeEventListener('load', settle))
})

/** On a reload of the same URL, scrolls back to where the page was left. Run it after the first render. */
export const restoreScrollOnReload: Effect.Effect<void> = Effect.gen(function* () {
  const saved = yield* takeSaved
  if (!isReload()) return
  yield* Option.match(saved, {
    onNone: () => Effect.void,
    onSome: ({ url, x, y }) =>
      url === location.href
        ? Effect.andThen(
            loaded,
            Effect.sync(() => window.scrollTo({ left: x, top: y, behavior: 'instant' })),
          )
        : Effect.void,
  })
})
