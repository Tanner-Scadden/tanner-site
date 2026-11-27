import { Component, Mount } from '@effect/ui'
import { Effect, Schema, Stream } from 'effect'

import { CodeLang, tokenize, tokenNodes } from '../highlight.ts'

// Shows the code as plain text straight away, then swaps in the highlighted
// tokens once Shiki loads. If it can't load, the plain text stays.
export const HighlightCode = Mount.make(
  'HighlightCode',
  { args: { code: Schema.String, lang: CodeLang } },
  (node: HTMLElement, _args, changes) =>
    Stream.runForEach(changes, ({ code, lang }) =>
      Effect.sync(() => {
        node.textContent = code
      }).pipe(
        Effect.andThen(tokenize({ code, lang })),
        Effect.flatMap(lines =>
          Effect.sync(() => node.replaceChildren(...tokenNodes({ document: node.ownerDocument, lines }))),
        ),
        Effect.catchTag('HighlightUnavailable', error =>
          Effect.logDebug('No syntax highlighting', error.cause),
        ),
      ),
    ).pipe(Effect.as(Component.noop)),
)

class CopyFailed extends Schema.TaggedError<CopyFailed, { readonly brand: unique symbol }>()(
  'CopyFailed',
  { cause: Schema.Unknown },
) {}

const COPIED_FOR = '1.6 seconds'

// Copies the code on click. The button says COPIED (or FAILED) for a moment;
// the label is CSS, keyed off data-state.
const copy = (button: HTMLButtonElement, code: string) =>
  Effect.tryPromise({
    try: () => navigator.clipboard.writeText(code),
    catch: cause => CopyFailed.make({ cause }),
  }).pipe(
    Effect.as('copied'),
    Effect.catchTag('CopyFailed', error =>
      Effect.as(Effect.logDebug('Copy failed', error.cause), 'failed'),
    ),
    Effect.flatMap(state =>
      Effect.sync(() => {
        button.setAttribute('data-state', state)
      }),
    ),
    Effect.andThen(Effect.sleep(COPIED_FOR)),
    Effect.ensuring(
      Effect.sync(() => {
        button.removeAttribute('data-state')
      }),
    ),
  )

export const CopyCode = Mount.make(
  'CopyCode',
  { args: { code: Schema.String } },
  (button: HTMLButtonElement, _args, changes) =>
    changes.pipe(
      Stream.switchMap(({ code }) =>
        Stream.map(Stream.fromEventListener(button, 'click'), () => code),
      ),
      Stream.runForEach(code => copy(button, code)),
      Effect.as(Component.noop),
    ),
)
