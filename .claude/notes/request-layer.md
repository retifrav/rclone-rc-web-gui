# Request layer — the adapter's two-argument `.then()`

Supporting notes for the **Request layer** section of `CLAUDE.md`.

## Why the adapter must stay `.then(fn, function() {})`

It must never become `.then(fn).catch(…)`. `fn` is called from inside the chain, so a `.catch()` also captures every exception thrown by `fn` and by everything it calls, and reports it as a failed request.

That is measured, not theoretical: forcing a `TypeError` inside `updateCompletedTransfers()` (by answering `/core/transferred` with `{"transferred": null}`, which gets past its `=== undefined` guard) is reported **once** with the correct stack under the two-argument form and **not at all** — zero reports — under `.then(fn).catch(noop)`. The two-argument form does not invoke its rejection handler for throws from its own fulfillment handler, which is the whole reason it is spelled that way.

## The one behavioural cost, also measured

A throw inside a callback is now an *unhandled promise rejection* rather than an uncaught exception, so Chromium labels it `Uncaught (in promise)` instead of `Uncaught` and the stack loses its trailing `xhr.onload` frame. The error, its message and the frame that actually matters (`updateCompletedTransfers@transfers.js:104`) are identical, and nothing in this project hooks `window.onerror`, so no diagnostics are lost.

If exact parity is ever wanted it takes `queueMicrotask()` around the `fn` call, which was judged not worth the indirection.

## Why XHR rather than `fetch`

Only *synchronous* XHR is deprecated, `fetch` buys nothing measurable for small JSON POSTs, and `xhr.upload.onprogress` has no cheap `fetch` equivalent should browser→remote upload ever be added.

## Why no logging in the `rez === null` guards

`requestRclone` has already written the status code (and any 500 `error` message) to the console before the callback runs. A transport failure logs in `xhr.onerror`, rejects, and is absorbed by the adapter's empty rejection handler without ever invoking the callback, so `null` is the only bad value that can arrive.
