# The settings tab's grid — why each declaration is there

Supporting notes for the **Settings tab layout** section of `CLAUDE.md`.

## What it replaced

A stack of independent `display: flex` rows, which misaligned in two unrelated ways at once: each slider began right after its own leading label (and those differed in width), while the widths themselves were deliberately different — `12em` with a `#input-refresh-view { width: 16em }` override on the grounds that 120 steps want more drag room than 20. Both of those are gone, and the two sliders now share `width: 16em` on one rule.

This layout arrived together with a rewording from sentence-style labels (`View is refreshed every … seconds`, `Allowed to do … transfers at a time`) to column labels (`Refresh interval`, `Parallel transfers`, `Auto-refresh the view`, `Manual refresh`), which is why the labels column is `auto` rather than a hardcoded width — rewording a label cannot silently break the alignment.

## `display: contents` makes a row's box disappear from the test harness too

`element.getClientRects()` comes back **empty** for a `.settings-item`, so a test harness must probe a row's visibility through its child or its `style.display`, not its own box. That bit one of the verification scripts.

Two more traps in the same family, both hit while measuring the label alignment below:

- A row's children are grid items and are therefore **blockified** — a `<label>` and the `Manual refresh` `<span>` both compute to `display: block`. So `element.getClientRects().length` is **1 whatever the wrapping**, and is not a line counter: it returns the border box of a block, not one rect per line box as it would for an inline. Count lines with a `Range` over the element's contents (`selectNodeContents` then `getClientRects()`) or off the box height. A first pass read `length === 1` as "no label wraps at any width", which was wrong at three of the widths it claimed it for.
- A label inside a row that `updateRefreshViewControls()` has hidden reports an **all-zero** rect rather than no rect, so a probe that does not skip hidden rows via `row.style.display` silently averages a `0` into whatever it is comparing.

## Why the controls column is `1fr` and not a second `auto`

Two reasons. The group hairline spans both columns, so with content-sized tracks it ended at the widest row and therefore *changed length* every time the manual refresh row replaced the interval slider one (measured: 311px against 277px); at `1fr` it is the full width of the tab in every state. And `1fr` eats all the free space, which is what leaves the labels column content-sized.

Without an `fr` track here a `justify-content: start` would be **mandatory**: per CSS Grid §12.8 the remaining free space is handed to `auto`-max tracks when `justify-content` is `normal`, which stretched the labels column to about half the tab and pushed every control far to the right. That declaration was removed as inert only *because* of the `1fr`; putting `auto auto` back without it reintroduces the stretch.

## Why `.settings-grid > h5` needs `justify-self: stretch`

`justify-items: start` keeps the boxes content-sized rather than stretched across the `1fr` column. Without the opt-out the heading shrinks to the width of its own text and drags the hairline with it, so `[ UI ]` got a 28px underline instead of a rule (caught in the browser, not by reasoning).

## Why the labels are right-aligned, and what each of the two declarations is worth

`justify-items: start` parks every label's content-sized box at the *left* edge of the `auto` column, so the column aligned the controls and nothing else: the labels all began at one x and ended at three different ones. `justify-self: end` on `.settings-item > :first-child` is the second opt-out from that `justify-items`, after the headings' `stretch`.

Measured at a 1200px viewport, `deviceScaleFactor: 2`, console empty, by flipping an injected override stylesheet so both states came off one page load. Label right edges, against controls that begin at `158.45` in every row and state:

- before, auto-refresh on: `148.45` / `115.2` (and `122` for the transfers row), all three starting at `20`;
- before, auto-refresh off: `148.45` / `110.67` / `122`, the `Manual refresh` span behaving like the labels;
- after, either state: `148.45` for all three, left edges now `20` / `53.25` / `46.45`, and `57.78` for that span.

So the gap between a label's end and its control is the grid's `column-gap` — 10px — and nothing else, in both toggle states.

**The widest label is the one that does not move**, which makes it the wrong row to check the rule against: the track is its max-content width (`128.453px`, the `Auto-refresh the view` row), so that label reads `20` → `148.45` identically before and after. A verification pass that probes only the first row concludes the rule did nothing.

The `text-align: right` beside it is **inert from 1300px down to 340px** and load-bearing below that, which is worth knowing before deleting it as dead weight (the fate of `justify-content: start`). Above the threshold the box is fit-content, so there is no room inside it for a `text-align` to act on; at **320px and below** the labels track finally drops under max-content (`117.06px` at 320px, `77.06px` at 280px) and the labels wrap to two lines, and there the declaration is the whole difference — both lines start at `15` without it, both end at the track's right edge with it (`112.1` at 300px, `92.06` at 280px). It only has an effect because the item is blockified, per the trap above.

`justify-self: end` is itself a no-op in exactly that range, the box having been squeezed to the track: at 280px the before and after boxes are identical (`15` → `92.06`). Which is the answer to the obvious worry about aligning to the end of a track that can be too small — **no start-edge overflow is introduced**, and start-edge overflow is the unscrollable kind. `documentElement.scrollWidth === clientWidth` at every width from 280px up; 240px overflows by 16px, identically with and without the rule, so that is the pre-existing mobile squeeze and not this.

## Why rows must have exactly two children

It is what makes grid auto-placement land every row correctly with no explicit `grid-column` anywhere but the headings. A row with one child (the manual refresh button before it got its own `Manual refresh` label) auto-places into the *label* column and needs a `grid-column: 2` of its own, and a third column would additionally need every row-leading child pinned to column 1, leaning on the sparse-packing rule that a definite column earlier than the cursor's increments the row.

## Why `margin: 0` on the controls

The browsers' own margins differ per widget and are not even symmetric — `3px 3px 3px 4px` on a checkbox in Chromium against `2px` on a range input — which put the slider, the checkbox and the manual refresh button on three left edges 4px apart inside one column that exists to align them. The `gap: 6px` is the only spacing in there now. Same reasoning as `.select-all` in the files panel header.

## Two smaller notes

The trailing `seconds` stays a `<label for="input-refresh-view">` so clicking it still focuses the slider, which makes that slider's accessible name "Refresh interval seconds"; the transfers row lost its trailing text entirely in the rewording, so its name is now just "Parallel transfers".

`#manualRefresh`'s label is a **`<span>`, not a `<label for="btn-manualRefresh">`** — a `<button>` is labelable so the `for` would be legal, but a button takes its accessible name from its contents and clicking a label for one is not a useful affordance.

## Verification

Over the DevTools protocol against a live `rcd`, console empty throughout: both sliders sharing `left`/`right` and width at 1300px, 720px, 640px and 400px — to the hundredth of a pixel and identical to each other at every one of them (`168.45`/`386.05`/`217.59` above the breakpoint, `153.45`/`262.25`/`108.80` below it, the `8em` mobile width applying to both); all four controls each on one left edge in both toggle states, and all four labels likewise on one left edge — which was true of that pass and is **no longer**, the labels having since been right-aligned, so read the section above for what they share now; the two `<output>`s and the trailing `seconds`/info badge aligned as a side effect of the shared widths; the hairlines identical across the polling toggle; `scrollWidth === clientWidth` on `#settings`, `body` and `documentElement` at every width; a real mouse drag running the label 4 → 8 → 13 → 17 → 20 with both header icons dark and **zero** requests until release, then one `/options/set` plus one re-read; arrow keys stepping one set *and* one get per press; `--transfers 32` widening `max` and `value` to 32 with the slider still 217.59px and still aligned; a curled `Transfers: 7` picked up by the settings tab's `onShow`; and a hand-edited `timerRefreshEnabled: false` booting with the interval row `display: none`, the `Manual refresh` row at `contents` with its button on the controls column's left edge, and the snowflake and separator both lit.

At a 400px viewport: tracks 128.45px + 10px gap + 231.55px against 370px available, every label still on one line, `scrollWidth === clientWidth`.
