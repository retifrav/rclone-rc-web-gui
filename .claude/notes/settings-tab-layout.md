# The settings tab's grid — why each declaration is there

Supporting notes for the **Settings tab layout** section of `CLAUDE.md`.

## What it replaced

A stack of independent `display: flex` rows, which misaligned in two unrelated ways at once: each slider began right after its own leading label (and those differed in width), while the widths themselves were deliberately different — `12em` with a `#input-refresh-view { width: 16em }` override on the grounds that 120 steps want more drag room than 20. Both of those are gone, and the two sliders now share `width: 16em` on one rule.

This layout arrived together with a rewording from sentence-style labels (`View is refreshed every … seconds`, `Allowed to do … transfers at a time`) to column labels (`Refresh interval`, `Parallel transfers`, `Auto-refresh the view`, `Manual refresh`), which is why the labels column is `auto` rather than a hardcoded width — rewording a label cannot silently break the alignment.

## `display: contents` makes a row's box disappear from the test harness too

`element.getClientRects()` comes back **empty** for a `.settings-item`, so a test harness must probe a row's visibility through its child or its `style.display`, not its own box. That bit one of the verification scripts.

## Why the controls column is `1fr` and not a second `auto`

Two reasons. The group hairline spans both columns, so with content-sized tracks it ended at the widest row and therefore *changed length* every time the manual refresh row replaced the interval slider one (measured: 311px against 277px); at `1fr` it is the full width of the tab in every state. And `1fr` eats all the free space, which is what leaves the labels column content-sized.

Without an `fr` track here a `justify-content: start` would be **mandatory**: per CSS Grid §12.8 the remaining free space is handed to `auto`-max tracks when `justify-content` is `normal`, which stretched the labels column to about half the tab and pushed every control far to the right. That declaration was removed as inert only *because* of the `1fr`; putting `auto auto` back without it reintroduces the stretch.

## Why `.settings-grid > h5` needs `justify-self: stretch`

`justify-items: start` keeps the boxes content-sized rather than stretched across the `1fr` column. Without the opt-out the heading shrinks to the width of its own text and drags the hairline with it, so `[ UI ]` got a 28px underline instead of a rule (caught in the browser, not by reasoning).

## Why rows must have exactly two children

It is what makes grid auto-placement land every row correctly with no explicit `grid-column` anywhere but the headings. A row with one child (the manual refresh button before it got its own `Manual refresh` label) auto-places into the *label* column and needs a `grid-column: 2` of its own, and a third column would additionally need every row-leading child pinned to column 1, leaning on the sparse-packing rule that a definite column earlier than the cursor's increments the row.

## Why `margin: 0` on the controls

The browsers' own margins differ per widget and are not even symmetric — `3px 3px 3px 4px` on a checkbox in Chromium against `2px` on a range input — which put the slider, the checkbox and the manual refresh button on three left edges 4px apart inside one column that exists to align them. The `gap: 6px` is the only spacing in there now. Same reasoning as `.select-all` in the files panel header.

## Two smaller notes

The trailing `seconds` stays a `<label for="input-refresh-view">` so clicking it still focuses the slider, which makes that slider's accessible name "Refresh interval seconds"; the transfers row lost its trailing text entirely in the rewording, so its name is now just "Parallel transfers".

`#manualRefresh`'s label is a **`<span>`, not a `<label for="btn-manualRefresh">`** — a `<button>` is labelable so the `for` would be legal, but a button takes its accessible name from its contents and clicking a label for one is not a useful affordance.

## Verification

Over the DevTools protocol against a live `rcd`, console empty throughout: both sliders sharing `left`/`right` and width at 1300px, 720px, 640px and 400px — to the hundredth of a pixel and identical to each other at every one of them (`168.45`/`386.05`/`217.59` above the breakpoint, `153.45`/`262.25`/`108.80` below it, the `8em` mobile width applying to both); all four controls and all four labels each on one left edge in both toggle states; the two `<output>`s and the trailing `seconds`/info badge aligned as a side effect of the shared widths; the hairlines identical across the polling toggle; `scrollWidth === clientWidth` on `#settings`, `body` and `documentElement` at every width; a real mouse drag running the label 4 → 8 → 13 → 17 → 20 with both header icons dark and **zero** requests until release, then one `/options/set` plus one re-read; arrow keys stepping one set *and* one get per press; `--transfers 32` widening `max` and `value` to 32 with the slider still 217.59px and still aligned; a curled `Transfers: 7` picked up by the settings tab's `onShow`; and a hand-edited `timerRefreshEnabled: false` booting with the interval row `display: none`, the `Manual refresh` row at `contents` with its button on the controls column's left edge, and the snowflake and separator both lit.

At a 400px viewport: tracks 128.45px + 10px gap + 231.55px against 370px available, every label still on one line, `scrollWidth === clientWidth`.
