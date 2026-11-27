import { Array as Arr, Effect, Option, Schema, pipe } from 'effect'

import { EggId } from '#domain/Egg'

const STORAGE_KEY = 'eggs'

class EggStorageError extends Schema.TaggedError<
  EggStorageError,
  { readonly brand: unique symbol }
>()('EggStorageError', {
  reason: Schema.String,
}) {}

const toStorageError = (error: unknown): EggStorageError =>
  EggStorageError.make({ reason: String(error) })

const StoredEggs = Schema.fromJsonString(Schema.Array(Schema.Unknown))
const decodeStoredEggs = Schema.decodeUnknownOption(StoredEggs)
const encodeFoundEggs = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Array(EggId)),
)

const isEggId = Schema.is(EggId)

export const readFoundEggs: Effect.Effect<ReadonlyArray<EggId>> = pipe(
  Effect.try({
    try: () => Option.fromNullishOr(localStorage.getItem(STORAGE_KEY)),
    catch: toStorageError,
  }),
  Effect.map(
    Option.match({
      onNone: (): ReadonlyArray<EggId> => [],
      onSome: json =>
        Option.match(decodeStoredEggs(json), {
          onNone: () => [],
          onSome: Arr.filter(isEggId),
        }),
    }),
  ),
  Effect.orElseSucceed(() => []),
)

export const saveFoundEggs = (
  found: ReadonlyArray<EggId>,
): Effect.Effect<void> =>
  pipe(
    encodeFoundEggs(found),
    Effect.flatMap(json =>
      Effect.try({
        try: () => localStorage.setItem(STORAGE_KEY, json),
        catch: toStorageError,
      }),
    ),
    Effect.ignore,
  )
