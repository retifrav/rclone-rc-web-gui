# Dark mode — measurements, verification and rejected alternatives

Supporting notes for the **Dark mode** section of `CLAUDE.md`. That section holds the rules; this file holds what they rest on.

## The filter, and why its output can be predicted

`--icon-filter` is `invert(0.87) hue-rotate(180deg)`. Chromium applies CSS filter functions in sRGB, channel by channel, so the result can be computed beforehand: `invert(p)` maps a channel `c` (0–1) to `p + c(1 − 2p)`, i.e. `0.87 − 0.74c`, and `hue-rotate(180deg)` is the matrix with `cos = −1`, `sin = 0`:

```
R' = −0.574 R + 1.430 G + 0.144 B
G' =  0.426 R + 0.430 G + 0.144 B
B' =  0.426 R + 1.430 G − 0.856 B
```

On a grey every row sums to 1, so the rotation does nothing to the monochrome icons, and `0.87` is chosen so that black comes out `#dedede` — the dark mode body text colour, so icons and text match. The rotation is there only for the two header buttons, whose own background and border the filter repaints: invert alone would turn the light-blue chip orange-brown, while invert plus a half-turn of hue flips the lightness and roughly keeps the hue. Computed beforehand and then **measured off a screenshot**, and the two agreed to the last digit:

| What (light declaration) | Dark, on screen |
|---|---|
| the gear glyph (black) | `#dedede` |
| the heart (`#FF0000`) | `#ff8d8d` |
| the chip fill (`#cbe8f6`) | `#243a44` |
| the chip border (`#02699C`) | `#5fabd1` |
| the hover (`#e0e0e0`) | `#383838` |

The header behind them is `#2a2a2a`. So the contrast constraint from `header-tabs.md` still holds in dark mode: the fill is 8.85:1 against the gear and 5.36:1 against the heart (both ≥3:1), and the border, which carries the state, is 5.63:1 against the header. `#5fabd1` is reused as the dark value of every `#02699C` focus outline, and `#383838` as the dark `.dialog-close:hover`, which is not filtered itself (only its icon is) and has to look like the header buttons' hover.

## Contrast

Measured on the live GUI, in the five states `compare-styles.mjs` drives: for every element with text of its own, its computed `color` against the nearest ancestor with a non-transparent background, in both schemes. That was 107 distinct elements, and **none came out below 4.5:1 in dark where light is at or above it, or below light where light is under it**. The lowest ones:

| Element | Dark | Light |
|---|---|---|
| `.path-hint` (`#8a8a8a` on `#1c1c1c`) | 4.94 | 3.95 |
| `.file-size` (`#8f8f8f`) | 5.27 | 4.61 |
| native panel buttons (Chromium's own dark widgets) | 5.33 | 18.26 |
| `.outcome-failed`, `.dialog-failure` (`#ff6b6b`) | 6.14 | 4.0 |
| `.dialog-error` (`#f07a85`) | 6.35 | 6.5 |
| `.outcome-ok` (`#4cbb4c`) | 6.91 | 5.14 |
| secondary text (`#aaaaaa`: completed rows, the items counter) | 7.34 | 7.46 |
| `#completedTransfersTrimmed` (`hsl(42 90% 65%)` on `hsl(45 60% 14%)`) | 8.36 | 5.87 |

The light `.path-hint` and `.dialog-failure` were already below 4.5:1 before this change, and dark mode does not copy that: both clear AA in dark.

Not text, and so not in the table: **the refresh interval slider at its navy end** (`hsl(240 75% 20%)`, written by `updateRefreshViewHeat()`) is 1.11:1 against the `#242424` settings tab, so its thumb nearly vanishes near 120 s. Left as it is, because the heat scale's meaning would have to be redesigned for a dark track, not just recoloured.

## Verification run (2026-11-01, Chromium headless, rclone v1.75.2)

- **Light mode unchanged**: `compare-styles.mjs` against `HEAD`, light half, 20 comparisons. The only differences were `color-scheme: normal -> light dark` on every element (inherited, and it changes no rendered value in light), and the colour of the completed table's outcome spans under the *baseline* sheets — `#555` there, as the inline `style.color` they relied on is gone, against `rgb(0, 128, 0)`/`rgb(255, 0, 0)` with the working tree's, i.e. exactly what HEAD's inline style gave. Against that baseline the negative control reports `FAIL`, but only because its sheets lack `color-scheme` too; without that property its differences were the spinner's `margin-left`/`margin-inline-start` as designed, plus those same spans. No failed request, empty console.
- **The two hooks agree**: full computed-style snapshots (every property but `color-scheme` itself, which legitimately reads `light dark` against `dark`) in all five states. System dark with nothing chosen == system light with `data-theme="dark"`, system light == system dark with `data-theme="light"`, and `auto` == no attribute under both — **0 differences in all 20 pairs**, against 14 506 to 16 615 differences between dark and light in each state (the sanity check that the snapshots see the scheme at all).
- **Icon coverage**: in dark, every `img` without a colour suffix and both header buttons have the filter, and the five suffixed images that appeared (the three indicators and the warning and error dialog icons, no info dialog having been opened) have `none` — 17 filtered, 5 not.
- **No flash**: a `MutationObserver` installed with `Page.addScriptToEvaluateOnNewDocument` recorded `data-theme` at the moment `<body>` was inserted. After choosing Dark in the dropdown and reloading under a light system, it was already `dark` there, and the dropdown read Dark. Light under a dark system behaved the same way, System gave no attribute, and a stored `purple` was ignored (no attribute, dropdown on System).
- **Storage disabled**: with `window.localStorage` made to throw `SecurityError`, the page loaded with an empty console, and choosing Dark switched the theme with exactly one uncaught `SecurityError` from the `setItem()` — the intended order.
- **Keyboard focus**: Tab from a fresh load reaches the heart and then the gear, both `:focus-visible`. Chromium's focus ring on the filtered buttons comes out light grey on the dark header, so no explicit `:focus-visible` outline was added. Unverified in Firefox.
- **Docker**: the `Dockerfile`'s two `sed` expressions over the new `index.html` change only the settings `<script type="module">` line, as before.

The scripts behind the last five points were throwaway, built from `compare-styles.mjs`'s harness (its process, server and protocol parts), and are not kept. `compare-styles.mjs` itself now covers the dark scheme for any later rule move.

## The storage key

It is `rclone-rc-web-gui.theme`, the repository's name plus the setting, and it was `rcloneRcWebGui.theme` in the first version, which was never released, so no browser holds a choice under the old name. A Web Storage key is a plain string with no syntax of its own — the HTML spec says any string, the empty one included, is a valid key — so the dashes and the dot need no escaping. Checked in Chromium on a real `http://` origin: `setItem()` of the dashed key, then `getItem()`, `Object.keys(localStorage)` and bracket access `localStorage["rclone-rc-web-gui.theme"]` all returned it intact. The only access that cannot work is the dotted property form, `localStorage.rclone-rc-web-gui.theme` being parsed as `localStorage.rclone - rc - web - gui.theme`, and both sides only ever call `getItem()`/`setItem()`.

## Alternatives rejected

- **A palette of custom properties**, with every dark value written once under `@media (prefers-color-scheme: dark)` and again under `[data-theme="dark"]`. That is two copies of every dark colour, free to diverge, and it pulls every colour away from the rule that uses it. `light-dark()` keeps each pair in place, which also left the cascade order untouched. Only the one non-colour (the filter) needs the two copies.
- **Dark-aware SVGs** — a `<style>` with `prefers-color-scheme` inside the icon files, or relying on `currentColor` resolving to `CanvasText`. Whether an image document sees the embedding page's colour scheme differs between engines, and it could not follow the manual override at all. It would also mean editing the vendored Bootstrap icons.
- **Inverting every icon, colour ones included**, with the same half-turn of hue that saves the chip. Hue is only roughly kept, and lightness is not: the yellow warning and lightning icons (`#F7B500`) come out brown (about `#8a4800`).
- **Choosing the inverted icons by where they sit** (panel buttons, file rows, cancel cells, the dialog's close button, the gear) instead of by file name. Every new place an icon appears would need a selector, and the dialog header mixes both kinds, so `dialog.ts` would have had to classify icons as well.
- **Leaving the heart unfiltered and giving its chip declared dark colours.** The gear's chip is the filter's output, so the heart's would have been a second, hand-matched copy of the same colours.
- **Applying the stored theme from a module** (`initSettingsUI()`, or the top level of `main.ts`). Modules run after parsing, and `window.onload` only after every image, so an override would flash the system's theme on every load.
- **A JS-computed "effective theme" attribute** (`matchMedia` plus a change listener, CSS keyed on the attribute only). It would move the system default, which is now pure CSS, behind JavaScript too, so it would flash for everyone, not just for an override.
- **Compiling the inline script from a `src/` file.** A file with no `import`/`export` is a global script rather than a module, which nothing else in the build is, and the `<script>` would still have to be a blocking classic one in `<head>` — all of that for six lines.
