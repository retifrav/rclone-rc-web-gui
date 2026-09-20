# The refresh loop — why the initial paint is unconditional

Supporting notes for the **Refresh loop** section of `CLAUDE.md`.

## The bug `updateRefreshViewControls()` fixed

The markup and the CSS can only express the polling-*on* state (`#manualRefresh` carries an inline `display:none`, `#inputRefresh` has no inline style and `.settings-item` is `display: contents`), while `js/settings.js` is hand-edited after deployment and can ship `timerRefreshEnabled: false`.

Init used to paint only two of that state's five elements — the snowflake and the separator — so such a deployment booted with the checkbox unticked and the snowflake lit but with the interval slider still on screen and the manual refresh button still hidden, claiming to refresh every 2s while frozen and offering no way to refresh. Only toggling the checkbox on and off repaired it.

So this is deliberately **not** an instance of the "nothing runs for the initial state" stance the transfers indicators follow: there the CSS default agrees with the markup and survives a failed `/options/get`, whereas here no execution path leaves a correct UI if the call is skipped. The precedent is `initPanels()` calling `updateFilesCount()` unconditionally for the same reason.

## Why each element is written through its own ternary

Rather than the `if`/`else` the listener used to hold: the bug *was* two branches listing different element sets (the old ones did not even list theirs in the same order) and an `if`/`else` can regress that way again the moment a fifth element joins one branch only. The two sibling writers, `updateRcloneTransfersIndicators()` and `updateSeparatorIndicators()`, already write `display` through exactly this idiom.

## Why it reads the flag through `=== true`

Matching `transfers.ts`'s tick and `queue.ts:submitFromQueue()`, and it buys a case truthiness loses: a hand-edited `timerRefreshEnabled: "false"` or `: 0` used to *tick* the checkbox while the tick's own `=== true` kept polling off — checkbox on, nothing refreshing, no snowflake.

Writing the checkbox from in here is safe and precedented (`selectAllChanged()` → `updateFilesCount()` does the same): assigning `checked` fires no `change` event, so being called from that checkbox's listener cannot loop.

## Why it must stay paint-only

The interval is created once in `initSettingsUI()` and is still created and still ticking while the flag is false — the tick no-ops on `=== true` — which is what makes the checkbox work with no start/stop path at all. Moving `setInterval`/`clearInterval` in here would decouple them from the slider's `change` listener that owns the period, which is the one place they belong.

`updateRefreshViewHeat()` likewise stays unconditional and above the call, being the sole writer of `#output-refresh-view-value` and the slider's `accentColor`: guarding it to the visible case would recreate this same bug in the other element.

## Why `"contents"` and not `"flex"`

The two rows it brings back are `.settings-item`s, which generate no box of their own so that their label and their controls land in the two columns of the `.settings-grid`. A row brought back as `flex` would become a single grid item and take the label column alone, so the whole row would sit where the labels are.

That is also the reason a `gui-mobile.css` rule can never override `.settings-item`'s display: an inline style beats a media query, so these two rows would keep whatever this function last wrote while the other two followed the stylesheet.

## The `timerRefreshView` read-back is not redundant

**This is the line in `CLAUDE.md`'s refresh section most likely to be deleted as redundant**, since it assigns back what the line above it just read. The assignment goes *through* the range input, which is a filter and not a variable.

Measured in Chromium against this exact markup (`min="1" max="120" step="1"`): `300` comes back `120`, `0` and `-5` come back `1`, `2.5` comes back `3` (snapped to `step`), and `"abc"`, `""`, `NaN` and `Infinity` all come back **`61`**.

Without it the GUI showed `120` while `setInterval` genuinely ran at 300s, and showed `1` while `timerRefreshView: 0` had `setInterval(fn, 0)` polling `/core/stats` and `/core/transferred` as fast as the browser's nesting clamp allows — measured at **497 requests in 2 seconds**.

That last row is also the answer to the obvious worry about the `parseInt`: it **cannot** return `NaN`, because the input's value sanitization guarantees a valid number, so the read-back can never itself produce the `setInterval(fn, NaN)` → `setInterval(fn, 0)` hammering it exists to prevent. In the ordinary case of an in-range integer it *is* a no-op round trip; that is the price of the five bad-input classes it fixes.

## Where the `61` comes from

Not a number that appears anywhere in the markup, and it reads like a magic constant. A range input's default value is `min + (max - min) / 2`, here `1 + 119/2` = **60.5**, which is then snapped onto the step grid, and ties round *up* (the spec takes the candidate "nearest to positive infinity"), giving 61.

Three measurements pin that mechanism down rather than leaving it a plausible story: `min="1" max="100"` gives 50.5 → **51**, so ties really do go up; `step="7"` gives **64** (the valid steps either side of 60.5 being 57 and 64, both 3.5 away) while `min="0" step="7"` gives **63**, so the grid is based at `min` and not at 0; and `step="0.5"` leaves it at **60.5** unsnapped, proving the integer is a product of the snapping and not of the default.

None of this is load-bearing for the GUI — 61 seconds is simply a harmless interval to land on when the setting is unreadable — but it is worth not re-deriving, and worth knowing that changing `min`, `max` or `step` moves it.

## Why the fix reconciles the setting to the slider instead of widening `max`

`updateRefreshViewHeat()` reads `inputRefreshView.max` as its `rampEnd`, so raising `max` to 300 would move the hue-stops-at-blue midpoint from 61.5 to 151.5 and quietly recolour the whole scale — the exact `max`-relative failure recorded for the transfers slider, which was fixed there by giving it absolute anchors this ramp has none of.

And the reason widening was mandatory there does not apply: that number lives in rclone, where a clamped slider would send the clamped value on the next `change` and silently downgrade rclone, whereas `timerRefreshView`'s only reader is the `setInterval` period.

## Known limit, not worth code

Deleting `timerRefreshView` outright from `js/settings.js` makes `.toString()` throw and init dies before wiring anything. Closing that means making every `UserSettings` field optional the way `Remote`'s are.
