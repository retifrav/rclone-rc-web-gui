# The parallel-transfers slider and its header indicators

Supporting notes for the **Client-side queue** section of `CLAUDE.md` (the widget) and the **Header tabs** section (the separator beside the indicators).

## Why it is a range input with a separate `<output>`

A range input displays nothing itself, and that is unavoidable rather than a shortcut: `::before`/`::after` generate no boxes on a replaced element like `<input>` (Chromium still reports the `content` from `getComputedStyle`, which makes the trick look viable), and `content: attr(value)` could not work even where a pseudo-element does render, because dragging moves only the IDL property while the `value` *attribute* stays at its initial default.

An `<output for="…">` rather than a `<span>` is the element the value belongs in; it is `#output-maximum-allowed-transfers-value`.

`input` calls `updateMaximumAllowedTransfersHeat()` all through a drag; `change` (fired on release, so not once per pixel) is what calls `/options/set`.

## The heat ramp

`updateMaximumAllowedTransfersHeat()` writes the `<output>` label *and* the slider's colour through `style.accentColor` — `hsl(hue 75% 42%)`, green → yellow → red, built from two named anchors (`transfersHeatYellowAt` = **3**, `transfersHeatRedAt` = **6**) in two hue segments: 120 → 60 over `min`–3, then 60 → 0 over 3–6, with everything from 6 up left at plain red.

**The anchors are values, not fractions, and the slider's `max` is not read at all**, because how many concurrent transfers are too many is a judgement about the number itself — 6 is 6 whether the scale tops out at 20 or was widened by `getMaximumAllowedRcloneTransfers()`. The earlier `max`-relative ramp silently re-coloured everything below a raised `max` (measured at `--transfers 50`, where even 8 came out green).

That is also why the hue ramp is in two segments rather than one: over a single 1–6 ramp yellow would drift to 3.5, and an easing curve (an earlier code note suggested `Math.pow(1 - fraction, 1.6)`) can only approximate what two segments hit exactly.

## The dark-red tail that was built and dropped

Hue pinned at 0 with the lightness dropping 42% → 20% over 6–`max`, mirroring the refresh slider's cooling-off past blue. Past the point where the answer is already "too many", grading *how* too many it is says nothing the user can act on, and it made the top of the scale read as a different, more alarming state than 6 rather than the same one.

So this slider's second half is flat on purpose, and that is the one place it does *not* follow `updateRefreshViewHeat()`.

## Why `accent-color` is the whole of the styling

It paints the filled part of the track and the knob together, where anything more would mean replacing the widget with `::-moz-range-*`/`::-webkit-slider-*` pseudo-elements (which cannot be set inline and so would need a CSS custom property instead).

`gui.css` carries green as a static `accent-color` on `.settings-control > input[type="range"]`, which is the start of *both* sliders' scales, so the first paint matches the markup's `value` rather than flashing the browser's default blue.

Verified in Chromium only — no Firefox in the dev container — and note Chromium flips the *unfilled* track between dark and light depending on the accent's luminance (so it changes appearance around the middle of the scale), which is its own contrast heuristic and not something this code sets.

## Why the validation and its `alert()`s are gone

A slider cannot report a blank, fractional or out-of-range value, so the `NaN`/`< 1`/`> 20` checks went with the conversion from `type="number"`. The `min`/`max` attributes are the validation now. Converting both settings inputs left no `type="number"` in `index.html` at all, so the `.settings-item > input[type="number"]` rule went with them.

## Why `max` is widened when rclone reports more than 20

A range input silently clamps an assigned value to its own `max`, so `getMaximumAllowedRcloneTransfers()` raises `max` first. The queue no longer reads the slider, so *its* allowance can no longer understate anything — but don't delete the widening on the strength of that, because the sharper reason survives: a clamped slider would send its clamped value on the very next `change` and **silently downgrade rclone** from 32 transfers to 20. Verified at `--transfers 32`: `max` and `value` both land on 32 and a 12-file folder is budgeted `min(12, 32)`.

## The two header indicators

`#indicator-rclone-transfers-yellow` / `#indicator-rclone-transfers-red`, Bootstrap's `lightning-charge-fill` in two colours, hidden by `gui.css` by default next to `#indicator-gui-frozen`, toggled by `updateRcloneTransfersIndicators()` with the GUI's usual `style.display = "block"`/`"none"`. Three states: **nothing at all** at 1, **yellow** from 2 up, **red** from `transfersHeatRedAt` up, never both at once.

Four things about it are deliberate:

- **It reads `rcloneTransfers` and is called from `getMaximumAllowedRcloneTransfers()` and nowhere else** — not from the slider's `change` listener, where it used to sit repainting the *pre-change* state, and pointedly not from `updateMaximumAllowedTransfersHeat()` on the `input` path. With its one call site inside the callback that writes the store, it is *structurally* incapable of speaking for a value that has not settled, where before it was merely called from the places where the slider happened to be settled — the same call-site-discipline fragility the queue was fixed for.
- **The split it expresses**: the `<output>` label and the accent colour describe the *slider* and so follow the knob through a drag, whereas an icon in the header claims something about **rclone**, which has been told nothing until the knob is released and has confirmed nothing until the re-read after that set answers. So the two do fall out of step mid-drag — the slider can be fully red with no indicator lit — and that is the intended reading rather than a lag to fix. Nothing extra is needed for the failure case, and it is not even a correction any more: *every* `/options/set` re-reads rclone, so the icons never light for a value rclone refused at all.
- **The red threshold is the anchor, but the yellow one is a literal `1` and not `transfersHeatYellowAt`** — the asymmetry a reader will try to "fix". The icon answers "is rclone allowed more than a single transfer at all", a coarser question than the slider's three-segment ramp, so yellow covers the slider's whole green→yellow half. The lower bound is that literal 1 rather than the slider's `min` for the same reason the anchors are values and not fractions.
- **Nothing needs to run for the initial state**: the CSS default agrees with the markup's `value="1"` and with the `rcloneTransfers` initialiser, so a failed `/options/get` — whose guard returns before the heat call — leaves both hidden while the slider still reads 1 and the queue still budgets 1, which is honest rather than merely inert.

Arrow-key stepping is not an exception to any of that even though it looks like one: a range input fires `change` on **every** keypress (measured, both directions), so the icons move one step at a time — each keypress is the value settling, not a drag.

The two `title`s are worded to survive a change of anchor — yellow names its threshold ("more than 1 transfer at a time", which is the literal the code uses) while red deliberately does **not** ("a lot of transfers at a time"), since a number spelled out in `index.html` would silently drift the moment `transfersHeatRedAt` moves.

There is no `gui-mobile.css` rule for either — verified no header overflow (`scrollWidth === clientWidth`) at 1300px, 720px, 640px and 400px, the `h1`'s `flex-grow: 1` absorbing the extra 2rem icon.

## Verification

Over the DevTools protocol against a live `rcd`: the load path with rclone's own `--transfers` at 1, 2, 3, 5, 6, 7, 20 and 32 (32 widening `max` and showing red); a **real mouse drag** across the track — `mousePressed`, five `mouseMoved`, `mouseReleased` — where the label ran 4 → 8 → 13 → 17 → 20 with both icons dark and `/options/get` still answering 1 all the way, red appearing and rclone taking 20 only on release; arrow keys stepping 4 → 5 → 6 → 3 with one `/options/set` **and** one re-read per press and the icons following each; and a sabotaged `/options/set` (fulfilled as a 404) after a release at 9, where the red icon never appears at all and the slider snaps back to rclone's real 2. Console empty except for that deliberate failure, which logs through `requestRclone`'s usual `Request has failed` group.
