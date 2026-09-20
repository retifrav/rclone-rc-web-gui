# Code style — the two removals and why the loading animation is different

Supporting notes for the **Code style** section of `CLAUDE.md`.

## Why `functions.htmlToElement()` is gone rather than merely unused

It was `<template>`, `innerHTML`, `return template.content.firstChild as HTMLElement`, and it existed for exactly one caller: the childless `<div class="loadingAnimation">` in `openPath()`, which `createElement` builds just as briefly.

Two reasons it was deleted: the signature invites interpolating a remote or file name (neither of which this GUI controls) straight into markup, and the cast is a lie, since `firstChild` is `null` for an empty or whitespace-only string.

## Why the loading animation is removed and not hidden

The animation is disposed of with `loadingAnimation.remove()` when the listing lands, rather than hidden. That habit — `style.display = "none"` — is for elements that toggle back (the two `.header-tab` blocks, `manualRefresh`, `indicatorGuiFrozen`, the two `indicatorRcloneTransfers*` icons, `inputRefresh`), whereas this one is built fresh on every `openPath()` call and never shown again.

Nothing observable hangs on the choice today: no structural selector reaches inside the panel (`.filesList`/`.file-list-item`/`.fileLine` are class-only, and every structural rule in `gui.css` is in `.body-block`, `.header`, the two transfer tables, `.settings-grid > h5:first-child` or — the one exception, and inert because that markup is static — `.cryptocurrency-wallet-information:first-of-type` inside the donation tab), `.filesList` spaces children with `margin` rather than `gap` so a boxless child adds no spacing, `search.ts` and `addToQueue()` both select shapes the animation does not match, and `filesCount` comes from the response array's length rather than off the DOM.

What removal buys is that a hidden leftover would linger until the user next navigates (unlike `cancelTransfer()`/`removeFromQueue()`, whose one-shot hides are re-rendered by the next `/core/stats` poll) and would still be counted by `nth-child` if the rows ever get striped.

Note the removal is what keeps the re-entrancy fix safe too: a callback whose `openPath()` call has already been superseded calls `remove()` on a node the newer call detached, which is a no-op, so the live animation survives — verified by holding both `/operations/list` responses open and releasing them one at a time.
