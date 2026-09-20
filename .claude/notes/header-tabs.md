# Header tabs — evidence and rejected alternatives

Supporting notes for the **Header tabs** section of `CLAUDE.md`. That section holds the rules; this file holds the measurements behind them and the alternatives that were tried and failed, so neither has to be re-derived and none of the failures gets retried.

## Why the blocks are mutually exclusive

The two used to be driven by *independent* booleans in `settings-ui.ts`, so both could be open at once, stacking their padding and their two `border-bottom` rules and pushing the main UI down. A third block would have made that linearly worse. `src/tabs.ts` exists to make at most one block's height reachable.

## Vocabulary: why the CSS class was renamed

The class used to be `.panel`, and that was the single place where "panel" (a **file** panel) and "tab" (a header-toggled block) collided, which is why it was renamed rather than documented around.

## The conditional separator

### Why the test is `=== "block"` and not `!== "none"`

That asymmetry is load-bearing: an indicator that has never been touched has an **empty** inline `display` and is hidden by the stylesheet, so a `!== "none"` test reads all three as visible on load and the separator would show with nothing beside it. `getComputedStyle` would answer correctly, but there is not one call to it anywhere in `src/`, and `"block"` is the only *shown* value this GUI ever writes to an indicator (never `flex` or `inline`), so testing for exactly it catches every visible state.

The three indicators are no longer symmetric in this respect: `#indicator-gui-frozen` carries an explicit `"block"`/`"none"` from the moment `initSettingsUI()` runs, because `updateRefreshViewControls()` paints the initial state unconditionally, while the two transfers icons stay at the empty default until `/options/get` lands — and forever if it fails. So the asymmetry is still load-bearing for those two, and an explicit `"none"` on the frozen one changes nothing here: `""` and `"none"` fail `=== "block"` identically, and the unconditional write only *narrows* the state space this function ever sees.

### Why there are two call sites, and why there used to be three

The two are the end of `updateRefreshViewControls()` (which covers the initial paint, the polling checkbox's `change` listener, and any future caller for free, the frozen indicator having exactly one writer) and the end of `updateRcloneTransfersIndicators()` (which now has a single caller of its own, `getMaximumAllowedRcloneTransfers()`, and through it covers all three paths that reach it: load, the settings tab's `onShow`, and the re-read after every `/options/set`).

It used to be three, the first two being an `if (timerRefreshEnabled === false)` branch in `initSettingsUI()` plus the checkbox listener; they collapsed when the on/off painting was extracted into that one authority — see the refresh loop section of `CLAUDE.md` for why, and for the bug that forced it.

**One of the two now runs unconditionally at load**, which is the one place this GUI departs from the "nothing runs for the initial state" stance the indicators themselves still follow: the CSS default does agree with the markup and with `timerRefreshEnabled: true`, but `js/settings.js` is hand-edited after deployment and can ship `false`, which neither the markup nor the CSS can express. The transfers icons keep the stance, `/options/get` being able to fail and `value="1"` being honest when it does.

### Why it follows the icons and not the slider

`updateRcloneTransfersIndicators()` is deliberately off the `input` path (see the queue section of `CLAUDE.md`), so a drag that has the slider fully red leaves both the icons and the separator dark until release — verified with a real drag, where the label ran 1 → 4 → 8 → 13 → 17 → 20 with the separator hidden the whole way and appearing together with the red icon on `mouseReleased`.

### Why it gets a rule of its own in `gui.css`

Rather than joining the indicators' `display: none` group, which also sets `cursor: help`. `"block"` on a `<span>` is not a mistake either — `.header` is a flex container, so the value is blockified whatever it says, and `"block"` is what the icons beside it use. Hiding it removes its box *and* its `.header > *:not(h1)` 12px `margin-right`, so the gap between the last indicator and the heart button collapses to one margin instead of leaving a double gap.

### Verification

Over the DevTools protocol against a live `rcd` with real clicks and key events: hidden on load at `--transfers 1` with polling on; shown at slider 2, 3 and 6 and hidden again back at 1; shown with polling off (frozen indicator) and hidden when it is switched back on; shown with the frozen *and* red icons up, and still shown after polling goes back on with red alone remaining; shown on load with rclone at `--transfers 7` and at 2; and no header overflow (`scrollWidth === clientWidth`) at 1300px, 720px, 640px and 400px. Console empty throughout.

## `onShow`

Verified by curling `Transfers: 7` into rclone while the donation tab was showing, then switching to settings and watching the slider land on 7 with the red indicator lighting. The old two-flag code structurally could not do that, as only a *closed→open* transition re-read.

## Why there is no wrapper div around the two blocks

`.header-tab` is already the shared container as a *class*, carrying the background, the `padding: 15px 20px` and the `border-bottom` seam against the header — and if a tab ever grows tall enough to clog the UI on its own, `max-height` + `overflow-y: auto` goes on that class, still not on a new element. The box tree is identical either way, because `body` is the page's only vertical flex container and a `display: none` child generates no box and is not a flex item at all; only the completed-transfers block grows, and it absorbs the slack regardless. Per-block `aria-controls` also stays honest, where a wrapper would have to be pointed at by every button or sit unlabelled in between.

Note the reason is *not* that a wrapper would break `.header-tab > h4` — it would not, since wrapping around the blocks leaves that heading a direct child — so don't re-derive that false constraint.

## Why not `role="tablist"`/`role="tab"`

`.header` also holds the `<h1>` and three status indicators, so it is not a tablist, and ARIA tabs additionally demand arrow-key navigation and `tabindex` management. What this actually is — N mutually exclusive disclosure buttons — is what `aria-expanded` + `aria-controls` says for free.

Verified in Chromium with real key events: the two buttons are the document's **first two tab stops**, and Enter and Space each produce exactly one activation, both when toggling and when switching tabs. (A driver that sends a `char` event next to `keyDown` for Enter gets *two* clicks and so sees a tab open and immediately close — that is the harness, not the GUI.)

## The active-tab chip

### Why the border carries the state and not the fill

A measured constraint, not a preference: the two glyphs sit at opposite ends of the luminance scale, so no fill can be 3:1 against the `#ebebeb` header while keeping the red `suit-heart-fill` at 3:1 — light enough for the heart is ~1.02:1 against the header, and dark enough for the header destroys the black gear. Hence `#cbe8f6` fill (heart 3.4:1, gear 16:1) with a `#02699C` border, 5.03:1 on the header and reused from the snowflake indicator rather than invented.

### Why the box is `calc(2rem + 8px)` with `padding: 3px`

A chip flush to the 2rem glyph box does not read: `gear-wide-connected` is a 16×16 viewBox whose teeth reach nearly every edge, and `suit-heart-fill` is 16×**14**, so under a forced square it letterboxes and its chip would show bands on two sides only — the two chips would not even look alike. The 1px-always border makes toggling paint-only (verified: button x-positions identical across all three states). Side benefit: the hit target goes 32px → 40px.

### The mobile mirror

`.header > input.icon` mirrored in `gui-mobile.css`, verified 40px at 1300px and 32px at 640px.

### Alternatives ruled out, so they are not retried

- An `outline` or a contrasting `box-shadow` ring (the search-hint prior art, refined — the collision only happens on the *keyboard* path, where `:focus-visible` matches and a ring affordance becomes indistinguishable from the focus indicator and then outlives it).
- A same-colour `box-shadow: 0 0 0 4px` halo, which is the clever way to get padding with no box-metric change and therefore no mobile mirror, except the focus ring then lands *inside* it and looks like it cuts through the chip.
- `filter`, because the glyphs are separate image documents with different colours (black gear, hard-coded `#FF0000` heart) so one filter reads as two effects.
- Swapping `src` to `x-square.svg` when active, the most idiomatic option for an `input type="image"` and still wrong, since with N tabs the strip would stop showing what the tabs *are*.

## `draggable="false"`

Measured in Chromium on an isolated page (press, 2×(3px,1px) moves, release): the bare `<input type="image">` fires `dragstart` and **zero** click events, and with the attribute it fires one click and no `dragstart`. The mechanism is *not* that these are draggable by default — their `draggable` IDL attribute reports **`false`** already, the same as a `<button>` (only `<img>` reports `true`), so the attribute is not redundant with the default despite reading as if it were, and the drag happens anyway unless it is spelled out.

Firefox, which is the browser this project is actually tested in, is unverified here — there is none in the dev container — but the attribute costs nothing if that engine never had the behaviour. Separately, a drift large enough to leave the 40px box kills the click on *any* element, a plain `<button>` included; that is ordinary click semantics and not what this guards against.

## The generation guard on `getMaximumAllowedRcloneTransfers()`

Releasing the transfers slider and immediately switching tab and back puts two `/options/get` in flight — the `onShow` one and the one that now follows *every* `/options/set` — and XHR responses are not ordered, so the older answer landing last would put back the value rclone held before the set.

Verified by holding both requests open and answering the stale one last with a canned `Transfers: 7` after the real `3` had landed — the slider, the icons and the next job's `_config.Transfers` all stayed on 3.
