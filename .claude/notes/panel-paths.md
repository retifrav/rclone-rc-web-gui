# Panel rows — the file size column and the re-entrancy guard

Supporting notes for the **Panel identity and paths** section of `CLAUDE.md`.

## Why a folder gets no size

A listing's `Size` for a folder **does not match that folder's real size on disk** — it was checked against the actual contents and does not agree, and it is not the recursive sum either, so it is a number of no known use. Folders are shown without a size rather than with a wrong one. Showing the real one is not an option: it takes an `/operations/size` recursive traversal, one per row.

Don't be talked into it by the value looking plausible — the local backend does return a small positive number for every directory, which is exactly what makes it tempting, and most cloud remotes just send `-1`. **What that number is depends on the host filesystem, not on rclone**, so don't record specific values as if they characterised the backend: `CLAUDE.md` used to quote `480` for `.git`, `96` for `.github` and `128` for `css`, which are APFS directory sizes from the macOS host, while the same listing on an ext4 host answers a flat `4096` for every one of those directories (measured). Either way it is the directory *entry's* own size and has nothing to do with the contents.

## Why a negative size is its own guard

A negative size is how a backend says it does not know one, and it would render as `-0.00 MB`. It happens for *files* too, not only folders — Google Docs on drive, some HTTP remotes. Verified: the same directory served over `rclone serve http` comes back as `Size: -1` where the local backend reports a number. An empty file needs no case of its own — it comes out of the formatter as `0 B`.

## Why the name carries `.file-name`

`src/search.ts` used to filter on `fileLine.querySelector("p").textContent`, which resolves to the *first* `<p>` in document order — correct only for as long as the name happens to come first, and a query that silently starts matching the wrong child rather than failing. It is `querySelector(".file-name")` now.

The class lives on **all three** name elements (`openPath()`'s two, plus the static `..` rows in `index.html`), because `gui.css` keys the name's `margin`/`overflow-wrap` and the `.path-hint` colour on it rather than on `> p`.

## Why the size stays a `<span>`

With the query no longer positional, a `<p>` there would no longer break anything, so the reason that survives is semantic: a size is not a paragraph of prose, `<p>` maps to the `paragraph` role, and a second one would expose every file row as two paragraph nodes instead of one. (How a screen reader voices that is unverified — no screen reader in the dev container.)

Converting it was measured before being dropped, and there is a trap in it either way. Leaving `gui.css` keyed on `.fileLine > p` while making the size a `<p>` comes out pixel-identical — but only by accident, that rule's `margin: 0 0 0 10px` happening to zero the UA block margins for it, and it leaks `overflow-wrap: anywhere` onto the size (inert, but only because `white-space: nowrap` is there). Re-scope the rule to `.file-name` as it is now and the size `<p>` picks up the UA `margin-block: 1em` instead: **12.96px top and bottom, taking every file row from 37.3px to 60.9px** while the folder rows stay 37.3px. It takes an explicit `margin: 0 0 0 auto` on `.file-size` to get back to identical — a guard to write and to keep, for nothing gained.

## Why `overflow-wrap: anywhere` and not `break-word`

The name is a flex item with `min-width: auto`, so it cannot shrink below its own min-content width, and a name with no break opportunity — no spaces, no hyphens, the `ThisIsOneEnormousUnbreakableCamelCase…` shape — forced the `<p>` wider than the row. `.panelFilesContainer` sets `overflow-y: auto` and no `overflow-x`, which per spec makes the `visible` axis compute to `auto`, so the panel silently became a *horizontal* scroll container: measured `clientWidth` 613 against `scrollWidth` 742 at a 1300px viewport, and 303 against 635 at 640px.

The name itself was only clipped at the panel border, but the size was the real casualty — with the `<p>` overflowing, `margin-left: auto` collapses to 0 and `span.file-size` lands past the panel's right edge, so such a row was the one file row in a listing showing no size at all.

Two things worth not re-deriving. **The panel divs were never the problem**: `#leftPanelFiles`/`#rightPanelFiles`, `.file-list-item` and `.fileLine` all measure exactly the container's `clientWidth` throughout (their `min-width: auto` does not apply on a column flex container's cross axis), so only the `<p>` overflows — which is what makes the panel *look* narrower than its content once scrolled right, and why a `width: 100%` on `.filesList` is a no-op that fixes nothing. And **`overflow-wrap: break-word` does not work here**, nor does adding `min-width: 0` to the `<p>`, alone or together: all three measured `scrollWidth` still 742. `break-word` does not reduce the min-content *contribution* that the automatic minimum size of both nested flex containers is computed from; `anywhere` does, which is equally why `anywhere` needs no `min-width: 0` beside it.

Verified with the rule in place at 1300px and 640px: `scrollWidth === clientWidth` on the container and on every row, all six size right-edges on one pixel, short names untouched (37px row height before and after), long names wrapping mid-word onto a second line.

## The size's own styling

The name is the row's primary item and the size is deliberately stepped back from it: `font-size: 0.9em` and `color: #757575` against the name's plain black, in the `"Courier New", Courier, monospace` stack that `#completedTransfersBody > tr > td:first-child` already uses for its timestamps — the one other place in the GUI showing a column of numbers. That font makes `font-variant-numeric: tabular-nums` on the same rule redundant, since Courier's digits are equal-width anyway; it is kept as the fallback for whatever a system substitutes.

The alignment is measured identical to the pixel across every row at 1300px, 900px and 640px viewports.

`#757575` is a shade darker than the `gray` of `span.path-hint` next to it for a reason: it is the lightest grey that still clears WCAG AA on the panel's white background (**4.61:1**, verified in the browser, where `gray` gives 3.95:1), which matters more here than for the path hint because this text is also the smaller of the two. That ratio is a property of the two colours alone and does not move with `font-size`, so touching the `em` value does not call for a re-measurement — it went 0.85em → 0.9em and stayed 4.61:1. What a size change *can* move is the threshold the ratio has to clear, since WCAG drops AA to 3:1 for large text, but that starts at 24px (or 18.66px bold) and this rule tops out at 12.96px, so the 4.5:1 bar applies at either value.

The unit is `em` and not `rem` so it keeps composing with `gui-mobile.css`'s `.filesList { font-size: 0.9em }` — 14.4px name / 12.96px size on a desktop width, 12.96px / 11.66px below 720px (measured; that second size is hypothetical, 720px being exactly where the size stops being shown).

## Why the size is hidden below 720px

The reason is where the size sits: `.filesPanelWrapper` has `min-width: 300px` and `#files` has `overflow-x: auto`, so the two panels stop narrowing and start scrolling sideways instead, which puts the right edge of every row — and therefore the size — out of view (measured: at a 400px viewport `#files` hides 230px). Hiding it does not stop the scrolling, it only stops there being anything worth reading behind it.

A viewport media query is the right trigger and not a stand-in for a container query, because the two panels are `flex: 1 0` with an equal basis and so are always half the viewport minus the fixed chrome — panel width cannot diverge from viewport width here.

Note the two thresholds are not the same number: hiding starts at 720px while the sideways scrolling only starts near 630px (at 640px the panels are 305px and everything still fits), so in that band the size is dropped while it would still have been reachable. That is deliberate — 720px is where the rest of the mobile layout switches over, a 305–345px panel holding a checkbox, an icon, a wrapping name *and* a monospace number is cramped anyway, and one breakpoint in that file is worth more than a second one tuned to `min-width` arithmetic that would silently drift the moment `min-width` or the paddings change.

Verified the rule's scoping leaves the transfers tables alone: the `#currentTransfers` headers are still `# / Name / Size / Speed / Progress` at 640px.

## The `openPath()` re-entrancy bug

Without the generation guard every response rendered into whatever the panel had become by the time it arrived: refreshing a 19-entry directory twice on a slow remote gave **38 rows against a `filesCount` of 19** (both callbacks appended, each overwriting the count with its own length), and rows left over from the earlier call carried a `dataset.path` from a directory the panel was no longer showing, so clicking one navigated somewhere `panelsPaths` disagreed with.

Not a data-safety bug — each row's `dataset.path` is absolute and self-consistent, so a copy/move/delete always acted on the file the row actually named — but a real navigation and display defect. The re-entry paths are ordinary: a folder clicked twice, refresh pressed again because a slow listing looked stuck, and `createFolderClicked()` in `src/folder.ts` calling `refreshClicked()` after a mkdir.

Verified by holding both `/operations/list` responses open over the DevTools protocol and releasing them one at a time — the superseded one renders nothing and leaves `filesCount` at `-`.
