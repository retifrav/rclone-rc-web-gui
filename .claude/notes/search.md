# The search box — the three bugs and the CSS hint

Supporting notes for the **Search** section of `CLAUDE.md`.

## Why the query box has to be emptied when the rows are replaced

The filter is scoped to the rows that happen to be rendered, so a box left non-empty claims a filter nobody is applying. Two places do it, and both were verified as real rather than theoretical.

`openPath()` empties it on every navigation: the fresh rows carry no inline `display`, so `.file-list-item { display: flex }` shows all of them whatever the box says. It reaches the input through the `leftPanelSearchQuery`/`rightPanelSearchQuery` consts and a `filesPanelID` ternary rather than another `parentNode` walk, since `.input-query.search` is a sibling of `.filesPanel` and therefore three parents up from the panel div — `functions.getDestinationPath()` picks a panel by ID the same way.

The search block itself stays *open* with an empty input, ready for a query against the new listing. Closing it on navigation was considered and rejected as too big a jump for a mode the user deliberately entered, and re-applying the old query was rejected because a 3-char minimum over a DOM-only filter can render a non-empty directory as a completely empty panel while `filesCount` reports the real number — indistinguishable from a bug.

`hideSearch()` empties it too: it already calls `clearSearch()` to make every row visible again, so leaving the text behind meant Cancel or Escape followed by reopening the search showed a stale query filtering nothing. `createFolderClicked()` has always emptied its own input; search simply did not.

## Why the listener is `input` and not `keyup`

The old arrangement gated `keyup` on a `keyCode` whitelist (`65-90`, `96-123`, `8`, `46`), which meant digits, space, punctuation, non-Latin input, IME composition and paste **never fired the filter at all** — searching for `2024` was silently inert. The second range was even dead for its stated purpose, since `keyup` always reports the uppercase code, so it only ever matched numpad `1-9` and `F1-F11`.

Don't reintroduce a key-identity test; `input` is what covers every way text can enter a field.

## Why the 3-character minimum is announced by CSS and not by JS

`searchQueryChanged()` still returns early under 3 characters but logs nothing — it used to `console.warn("The search query is too short")`, which nobody looking at the GUI would ever see, so a user who typed `ab` got every row back with no explanation and no way to tell it from a broken filter.

The reason for doing it in CSS is that the cue cannot then disagree with the field: per spec a value is *too short* only when the **user** last changed it and it is **not empty**, so both `hideSearch()` and `openPath()` clear the tint and the hint for free just by emptying the box — the same two places that had to learn to empty the *query* by hand, twice, having each been a real stale-filter bug. A JS-written hint would need clearing in both again.

## Five details of that, three of them second attempts

- **The invalid cue is a `background-color`, not a ring.** An amber `box-shadow` ring was the first try and it does not work, because the field is focused for as long as anyone is typing in it, so the ring sits permanently under the browser's focus indicator (blue in Chromium, green in Firefox) and only muddles it. A background cannot collide with a border or an outline.
- **`box-shadow: none` on the invalid input is load-bearing**: Firefox paints its own red glow on a `:user-invalid` field with `box-shadow`, which overstates a hint as an error. The amber ring used to displace it by occupying the same property, so removing the ring is what made the explicit `none` necessary.
- **`.input-query.search` is a grid**, `1fr auto`, with the input and the hint both in cell `1 / 1` and Cancel in `1 / 2`. Two items in one grid cell do not push each other, so the hint overlays the field and reserves **nothing**; `justify-self: end` then right-aligns it against the *input's* own edge, `margin-right: 7px` pulling it in by the input's border and padding. It began instead as a fixed-width flex item between the input and Cancel, which left a permanent ~109px gap in the row that looked like a mistake in the far commoner valid state, and — because a text input's automatic minimum size is its intrinsic ~20-character width, so it will not shrink — pushed Cancel clean out of the panel at the 300px `min-width` (verified: gone at a 640px viewport). Hence no `min-width: 0` on that input any more either.
- **`position: absolute` cannot do this**, which is worth knowing before anyone tries it: an input cannot be the containing block for its own sibling, so `right` resolves against the whole row — Cancel included — and the hint overhangs the button by its width (measured at 54.5px, and a click meant for the hint hit Cancel and closed the search). Anchoring to the input specifically would otherwise need a wrapper div, and that would break the `btn.parentNode!.parentNode!` walk in `hideSearch()` for the Escape path. Two consequences of using grid: `showSearch()` has to set `display: grid` inline rather than `flex`, and the CSS rule must **not** declare `display` at all — `.input-query.search` beats `.input-query { display: none }` on specificity, so declaring it there leaves the search row on screen before Search is ever clicked (caught in testing). Only the hint gets `align-self: center`; the input and Cancel keep the grid's default `stretch`, which equalises their heights exactly as the flex row did (both 27px, verified).
- **The fixed offset is gone with the right alignment.** A `left` offset has to clear the typed text, and since CSS cannot know how wide that is without mirroring the value into a hidden span on every keystroke to measure it, the earlier version reserved room for the widest two characters the font could produce (`calc(7px + 2.4em)`, leaving 6px of clearance on `WW` and 26px on `il`). Right-aligned there is nothing to reserve: the query is 1–2 characters whenever the hint shows and the field's floor is ~240px. `font: inherit; font-size: 0.85rem` is still shared by the input and the hint, now only so the two texts in one box read as one control — inputs do not inherit `font`, so the field would otherwise keep the UA's form-control default. Only the search input gets it; the create-folder input beside it is never on screen at the same time, so the inconsistency is invisible. `pointer-events: none` keeps a click landing on the hint going through to the field (verified).

`visibility` rather than `display` is what makes the **`aria-describedby`** on the input read correctly: `visibility: hidden` drops the hint out of the accessibility tree, so it is announced on focus exactly while it is on screen.

## One accepted divergence

`minlength` counts code points and `searchTerm.length` counts UTF-16 code units, so a query of two astral-plane characters (emoji) is 4 to JS and 2 to the validity check — the filter runs *and* the cue shows. NFD-decomposed input, the case the filter actually cares about, counts the same on both sides.

## Verification

Over the DevTools protocol with real key events (setting `.value` from a script proves nothing here, as that is not a user edit): 1 and 2 characters tint and hint with all rows shown and an empty console, 3 filters with the cue gone, Escape-then-reopen and navigating away are clean, the hint's right edge is 7px inside the field's at both 1300px and 640px viewports, Cancel does not move between any two states, and the hint's contrast on the tint is 5.9:1.

Firefox is unverified — it is not in the dev container — and the `box-shadow: none` above is the line that most wants a look there.
