# The items counter and select-all — the ordering bug and the verification

Supporting notes for **The items counter and select-all** section of `CLAUDE.md`.

## Why the render must come after the rows are appended

In `openPath()`'s `/operations/list` callback `panelsItemsCount` is set next to the sort, but `updateFilesCount()` is called at the very *end* of the callback, below the row loop.

The counter text does not care (its number comes from the response length), which is exactly the trap: the select-all state is derived from the rendered rows, so rendering the counter first left the checkbox **disabled on every listing that did have items in it**, and it only came right once the user clicked a row by hand. Caught in testing, not by the compiler.

## What the ids and consts replaced

The two `<span class="filesCount">`s carry `id="leftPanelFilesCount"`/`"rightPanelFilesCount"` so the module declares them as consts and picks one with a `filesPanelID` ternary — the same move as the search inputs, and it retired the two `filesPanel.parentNode!.parentNode!` + `getElementsByClassName("filesCount")[0]` walks `openPath()` used to do.

The class stays because `gui.css` keys `font-weight: bold` on it, and nothing else in the GUI reaches the counters by class. The two panel divs got consts as well, reached through `getFilesPanel(filesPanelID)`, which `openPath()` uses in place of its own `document.getElementById(filesPanelID)` so that the module has one way of getting at a panel rather than two.

## Why the checkbox sits inside the counter `<div>`

Before the `Items:` label (`☑ Items: 3/19`), which needs no wrapper and no change to that flex row — the header is `justify-content: space-between` with the remote `<select>` at one end, so a third child of `.filesPanelHeader` would have re-centred the select instead.

`gui.css` gives it one rule, `.select-all { vertical-align: middle; margin: 0 5px 0 0 }`: the browsers' own checkbox margins are asymmetric (`3px 3px 3px 4px` in Chromium) and the gap to a 0.8rem label should not be whatever each of them happens to pick. Measured with the rule in place: 5px gap, the checkbox centre 1.13px off the label's (it was -2px on the UA default), and no header overflow at 1300px, 640px or 400px.

There is deliberately no icon button for this — `images/` has no check glyph, and a native checkbox is what the rows themselves use.

## Why the selected count is counted off the DOM every render

Both `addToQueue()` and `selectAllChanged()` set `checked` directly, which fires no `change` event, so a tally kept up by the listener would silently drift the first time a Copy went out. The total, by contrast, comes from the response array's length and lives in `panelsItemsCount`.

Using `addToQueue()`'s own `input[name=fileListItem]:checked` selector is also what makes the counter agree with the buttons about rows the search filter has hidden: `search.ts` only sets `display: none`, so a ticked row that has scrolled out of the filter still counts *and* still gets queued. In practice that state is short-lived, since `showSearch()` hides `.controls` and so the operation buttons cannot be clicked while a query is on screen, but the two numbers must not disagree while it lasts.

## Why `indeterminate` is keyed on the whole selection

Rather than on the visible part: with a query hiding every selected row the box still shows a partial selection instead of claiming an empty one while the counter beside it reads `4/19`.

## Why `src/search.ts` has to call `updateFilesCount()`

Without it the box keeps the state it had before the query: `checked` while the now-visible rows are unticked, which is not merely cosmetic, since the next click would then *untick* (the browser having flipped `checked` to false) and appear to do nothing at all. `panel.ts` cannot do it from its own side, because the `input` listener it owns fires 200ms before the debounced filter actually runs.

## Why the `change` listener is delegated

One per panel div in `initPanels()`, not one per checkbox in `openPath()`: `change` bubbles, the row checkboxes are the only inputs inside `#leftPanelFiles`/`#rightPanelFiles`, and `openPath()` empties those divs with `removeChild` without ever replacing the div itself, so two listeners registered once at load survive every re-listing where per-row listeners would cost N registrations per navigation.

No test of `event.target` is needed because the render recounts from scratch and is therefore right whatever fired it, and ticking a box cannot navigate — the checkbox is a *sibling* of `.fileLine`, outside the folder row's `click` handler. The two select-all boxes need listeners of their own, being in the headers rather than in the panel divs.

`operationClicked()` doing the post-`addToQueue()` render is what keeps `queue.ts` from having to import this module back (a further import cycle for nothing); it is safe because `addToQueue()` unticks synchronously inside its loop.

## Verification

Over the DevTools protocol with real mouse clicks (assigning `.checked` from a script would prove nothing here, as it fires no event): `-` and a disabled box before a remote is chosen, `19` on landing, `1/19` → `2/19` → `3/19` and back down, the two panels independent of each other, select-all giving `19/19` and clearing again, ticking the last row by hand turning the box from indeterminate to ticked (and unticking one turning it back), a query narrowing to 4 rows and select-all taking exactly those (`4/19`) with the rows still selected after Escape and exactly those 4 copied, a query matching nothing disabling the box while the counter still reports `4/19`, Copy and Delete each dropping the counter back to the plain total with nothing left ticked, a navigation showing `-` then the subfolder's own total with no selection carried over, a superseded listing leaving `-` (held both `/operations/list` responses and released them one at a time), and the header not overflowing at 1300px, 640px or 400px. Console empty throughout.

## Two traps in verifying over the DevTools protocol

**Chromium keeps a disk cache in its default profile directory between launches**, and `rcd` sends no `Cache-Control`, so heuristic freshness applies and a just-edited `gui.css` is served stale without even a revalidation — a CSS measurement can silently describe the previous version. `Network.setCacheDisabled` (or a throwaway `--user-data-dir`) is the fix.

The driver also has to `process.exit()` rather than merely killing the browser it spawned: killing the launcher leaves the browser tree and the open WebSocket alive, so node keeps running and the run looks hung.
