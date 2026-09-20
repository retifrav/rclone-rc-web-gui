# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency-free, two-panel (Norton Commander style) web GUI for [`rclone rcd`](https://rclone.org/commands/rclone_rcd/). Plain HTML/CSS + TypeScript compiled to browser ES modules — no framework, no bundler, no package.json, no tests, no linter, no CI. Every action is an `XMLHttpRequest` POST to the [rc API](https://rclone.org/rc/).

## Build

**Before changing `tsconfig.json`, read `.claude/notes/build.md`** — it holds why `module`/`moduleResolution` and `lib` are deliberately absent, and the emit diff that proved the ES2022 retarget inert.

```sh
tsc  # src/*.ts -> js/*.js (js/ is gitignored)
```

`tsconfig.json` has `strict`, `noEmitOnError`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `target: ES2022`, `outDir: ./js`, and — required by TypeScript 7, which otherwise fails with `TS5011` — an explicit `rootDir: ./src`. `module`/`moduleResolution` are deliberately **not** set and there is deliberately **no `lib` array**. Don't add either: the emitted JS is identical, and an explicit `lib` *replaces* the default that already supplies `DOM`/`DOM.Iterable`.

**TypeScript 7.x is the only compiler this project targets** (the dev container has 7.0.2). Nothing needs to stay compatible with 5.x, so don't preserve or reintroduce constraints that only existed for it, and don't test against it.

`src/` has no classes, `async`/`await`, generators or private fields, which is what keeps the emit independent of `target`. **If any of those are ever introduced, re-diff the emit** rather than assuming.

There is nothing to run locally other than `rclone rcd` itself pointed at the repo root, e.g. `rclone rcd --transfers 1 --rc-user U --rc-pass P .` and then <http://127.0.0.1:5572>. `rclone` *is* installed in the dev container — an upstream static binary at `/usr/local/bin/rclone`, built for whichever architecture the host is (so it follows `uname -m`, and the container is x86-64 on two of the three hosts). It is **not** Debian's package, so `dpkg`/`apt` know nothing about it and **`rclone --version` is the only way to find out what is in here** — it reports the version and the `os/arch` in one go. No version number is written into this file on purpose: the binary is updated by hand and every literal recorded here went stale the moment it was.

- The image's rclone is pinned by `ARG RCLONE_VERSION_VALUE` in `docker/Dockerfile`, which is the only source of truth for it. Compare it against `rclone --version` rather than against anything written here.
- The container may be **ahead** of what users run, not only behind, so before relying on an rc field or endpoint, check when it was added at <https://rclone.org/rc/>.
- The GUI calls **18** rc endpoints and all of them exist in the container's rclone, along with the fields the GUI reads. Don't trust that count on sight — it once said 15 while the real number was 14 — so re-derive it with `grep -rhoE '"/[a-z]+/[a-zA-Z]+"' src/*.ts | sort -u` (which catches the ones `getFolderOperation()`/`getFileOperation()` return too, as those are literals in `src/functions.ts`) and check the list against `jq -r '.commands[].Path' <<< "$(rclone rc --loopback rc/list)" | sort`. Note the key is capitalised `Path`, not `path`.

Everywhere below, "verified" or "measured" against the rc API means against the container's rclone at the time of writing, with no version pinned for the reason above. **Re-run the checks rather than trusting them**: the last full re-derivation found four incidental details wrong while every load-bearing claim held. `.claude/notes/rc-api-verification.md` records what was checked, when, and which fields rclone sends that no `rc*` type mentions.

`rclone rc --loopback <command>` runs an rc command in-process with no server, which is the cheap way to inspect the API — `rclone rc --loopback rc/list` dumps the whole registry of available commands.

`rcd` serves the directory it is pointed at over the same port as the rc API, so running it from the repo root with `--rc-no-auth` on 5572 makes the GUI same-origin with the API and the default `js/settings.js` (`host: "http://127.0.0.1:5572"`, `user`/`pass` `null`) works untouched — no CORS setup needed. `tsc` first, since `index.html` loads `./js/*.js`. The GUI can then be driven headlessly with `chromium-headless-shell` over the DevTools protocol to check rendering and the console.

`js/settings.js` (compiled from `src/settings.ts`) is the *user-editable runtime config* — host, credentials, remotes, timers. Editing `src/settings.ts` changes the shipped defaults; end users edit the compiled `js/settings.js` after deployment. Because that hand-editing happens **after** compilation, nothing type-checks it, so every field of `Remote` is declared optional and `remotes` is typed `{[key: string]: Remote | undefined}` — the compiler then forces both read sites to handle an absent entry *and* an absent field. The reads must also use **`Object.hasOwn(settings.remotes, remote)`** rather than `!== undefined`, because a remote may legitimately be named after an `Object` member. Note the *object literal* in `src/settings.ts` must not be touched (see the Docker section); only the types around it.

## Architecture

### Module layout

**Before moving code between modules or touching an import cycle, read `.claude/notes/module-layout.md`** — it holds why the cycles are safe, why `tabs.ts → settings-ui.ts` must stay one-way, and the two decoupling schemes that were rejected.

Ten files under `src/`, split by concern rather than by size. `src/main.ts` is **only the bootstrap** — the `guiVersion` constant, the three footer `<span>`s, `/core/version` and `window.onload` — and everything else owns one part of the GUI:

- `src/functions.ts` — the request layer, the `rc*` response types, `panelsPaths` and the pure helpers.
- `src/settings.ts` — the shipped defaults that become `js/settings.js`.
- `src/panel.ts` — the two file panels: `openPath()`, the remote dropdowns (`/config/listremotes`, `/operations/about`), `refreshClicked()`, and the copy/move/delete buttons up to the point where a selection becomes queue items.
- `src/queue.ts` — `transfersQueue`, `activeQueueJobs` and everything that fills and submits them. Owns no DOM element of its own.
- `src/transfers.ts` — the two transfer tables and the `/core/stats` + `/core/transferred` polling behind them.
- `src/tabs.ts` — the header tabs: which of the collapsible `.header-tab` blocks is open, and nothing else.
- `src/settings-ui.ts` — the *contents* of the settings tab (the `#settings` div in `index.html`): both sliders, the polling checkbox, manual refresh, `/options/get` and `/options/set`. It does **not** own that block's visibility, which is `tabs.ts`'s. It exports `getMaximumAllowedRcloneTransfers()` for that module to call as the settings tab's on-show hook, on top of the `rcloneTransfers` store it exports for the queue, and it exports no DOM element at all.
- `src/folder.ts`, `src/search.ts` — one panel control each.

Only `settings.js`, `functions.js` and `main.js` have `<script type="module">` tags in `index.html`; every other module is reached through imports, so a new one needs no tag (the same way `folder.js`/`search.js` never had one). The Docker `sed` rewrites `./settings.js` as well as `./js/settings.js`, so a new module importing settings is handled too.

Four import cycles exist and are deliberate:

- `queue.ts` ↔ `transfers.ts` — the queue calls `refreshView()` after submitting, while `updateCurrentTransfers()` renders the queued rows into the same `<tbody>` as the in-flight ones and so reads `transfersQueue`/`removeFromQueue()`.
- `queue.ts` ↔ `settings-ui.ts` — `getActiveQueueSlots()` reads the allowance off the `rcloneTransfers` store (which `settings-ui.ts` exports for exactly that), while the `/options/get` callback calls `countQueuedFolderFiles()`.
- `panel.ts` ↔ `folder.ts` — `createFolderClicked()` calls `refreshClicked()` after a mkdir. This is the pre-split `main.ts` ↔ `folder.ts` cycle, moved.
- `panel.ts` ↔ `search.ts` — the filter and `clearSearch()` call `updateFilesCount()`, because hiding or revealing rows changes what the panel's select-all checkbox is a summary of (see the items counter section).

`tabs.ts → settings-ui.ts` is **not** one of them and must stay one-way. The cycles that do exist are safe because **nothing is read at module-evaluation time**; don't "fix" one with a callback registry, and don't park shared state in `main.ts` — **nothing imports `main.ts`**, and that is worth keeping.

Import style is whatever leaves a moved function body reading as it did before: `import * as functions` / `* as settings` / `* as folder` / `* as search`, but **named imports between `main`/`panel`/`queue`/`transfers`/`settings-ui`**. `settings-ui.ts` in particular *must* use a named import for `transfers.js` — `transfers` is a local name in there twice.

### Request layer

**Before touching `sendRequestToRclone()`, read `.claude/notes/request-layer.md`** — it holds the measurement behind the two-argument `.then()`, which is the one thing in here that looks like a style choice and is not.

`functions.requestRclone<T>(query, params)` is the single choke point for all rc calls: XHR POST, `Authorization: Basic` from `rcloneSettings.loginToken` (takes precedence, read from the `login_token` URL query parameter on load) or `user`/`pass`, JSON body, and it automatically injects `_async: true` for any query listed in `functions.asyncOperations`. Response shapes are declared as `rc*` types in `src/functions.ts`.

A request has **three** outcomes, and `requestRclone()` is the only place all three can be told apart: it resolves with the parsed response on a 200, resolves with **`null`** when rclone answered with anything else, and **rejects** when the request never made it to rclone at all. `functions.sendRequestToRclone<T>(query, params, callback)` is a three-line adapter over it that collapses the third case back into "the callback is simply never called", which is the contract all but one of the 16 call sites are written against; only `processQueue()` needs the distinction and so goes to `requestRclone()` directly. XHR is deliberately kept as the transport.

**The adapter must stay `.then(fn, function() {})` and must never become `.then(fn).catch(…)`** — a `.catch()` would also capture every exception thrown by `fn` and report it as a failed request, and measurably reports it *not at all*.

Promises are used through **`.then()`, never `async`/`await`**, which is what keeps the byte-identical-emit claim in the Build section true and needs no emit re-diff. `debounce()` in the same file already constructs a `Promise`, so this is not a new idiom there.

Every callback that reads its response therefore annotates the parameter `… | null` and opens with `if (rez === null) { return; }` — the `| null` is what makes the compiler enforce the guard, so keep it when adding a call. No logging is needed in the guard. Three deliberate exceptions: the `/operations/list` guard also logs, and the two fire-and-forget callbacks (`/operations/mkdir` and `/options/set`) never read the response, so they need no guard. The idiom for those is a **zero-argument `function()`** with the unused parameter kept beside it as `//function(rez)` — not a `_rez`-prefixed parameter, which appears nowhere in `src/`. The `/sync/*` and `/operations/{copy,move,delete}file` submissions read the `jobid` out of the response (typed `rcJobSubmission | null`) and hand it to `rememberQueueJob()`, which does the guarding for all three — a `null` there means the item's slots were never taken. The `/operations/about` guard is not a bare `return`: the disk query is decorative, so on failure it still adds the remote to the dropdown without the `(… left)` suffix, or the remote would vanish from the list entirely.

### Transfer types: one per endpoint, not one shared

**Before touching these types or the handlers that read them, read `.claude/notes/transfer-types.md`** — it holds the rclone-side reason the progress fields are optional, and why a clean local-to-local run is not evidence the guards are unnecessary.

`/core/stats` → `transferring[]` and `/core/transferred` → `transferred[]` look alike but are **not** the same object, so there is a type per endpoint rather than one shared `rcTransfer`:

- `rcTransferCommon` — `name`, `size`, `group`; the only fields genuinely always in both.
- `rcTransferring` = common + **optional** `bytes?`, `speed?`, `percentage?`. In-flight: progress, no outcome yet.
- `rcTransferred` = common + `bytes`, `error`, `checked`, `started_at`, `completed_at`. Finished: an outcome, no progress.

Those three being optional on `rcTransferring` is not defensiveness, it is the shape rclone actually sends: a transfer that is registered but not yet moving data (opening the source, hashing, waiting for a transfer slot) arrives as `name`/`size`/`group` alone. It bit for real — `updateCurrentTransfers()` assigned the missing `percentage` straight to `<progress>.value`, which **throws** in both engines and killed that whole refresh. So that function reads `speed`/`percentage` into locals through an `undefined` check and shows such a transfer at zero; `bytes` stays declared but unread there.

`speed`/`percentage` therefore do not exist on completed entries, and `error`/`checked`/`started_at`/`completed_at` do not exist on in-flight ones — the compiler now enforces that. `functions.sortJobs()` is called on *both* arrays and is therefore typed `rcTransferCommon`; **it may only ever touch the common fields** (it keys on `group`).

Verified against the container's rclone: `transferring` is **omitted entirely** from `/core/stats` when idle, hence `rcStats.transferring?:` and the `| undefined` on `updateCurrentTransfers()`. `/core/transferred` by contrast always sends `transferred`, as `[]` when empty, so that one stays required.

The timestamps are ISO-8601 **strings**, not `Date`s (`JSON.parse` cannot produce a `Date`); `updateCompletedTransfers()` wraps `started_at` in `new Date(...)` before formatting, and `rcListItem.ModTime` is the same story.

`/job/stop` takes `jobid` as a JSON *string* here — `cancelTransfer()` derives it by slicing `group` (`"job/2"` → `"2"`) and rclone coerces it to an int, so despite `rcRequest.jobid?: string` this works. Success is `{}`; an unknown id is a 500 `{"error":"job not found"}`, which `requestRclone` flattens to `null`. A job stopped this way then reports `finished: true` with `error: "context canceled"` on `/job/status`, and the cancellation is asynchronous — the status immediately after the 200 can still read `finished: false`.

### One moved file is reported twice

**Before touching `collapseDuplicateTransfers()`, read `.claude/notes/duplicate-transfers.md`** — it holds the three-entry measurement, the rclone version bisection, and the two narrower fixes that are wrong.

`/core/transferred` reports **one moved file as two entries** whenever the destination has no usable server-side move, and they are not distinguishable one at a time — hence `functions.collapseDuplicateTransfers()`, which `updateCompletedTransfers()` runs over the response before rendering it. A single `operations/movefile` across filesystems produces three entries: the `move()` transfer, the `Copy()` it falls back to, and the source `DeleteFile()`. The third is a check and was always filtered; **the first two are identical in every field except `bytes`**, which the GUI does not render, so the two rows were pixel-identical.

**This is not new** — it has been so since v1.65.1 (January 2024), the last good rclone being v1.65.0, so "this is new" is the wrong instinct here.

Three things not to do:

- **Don't "fix" the current-transfers table or `getRunningJobCost()` to match.** `/core/stats` → `transferring` shows one entry and the counters do not double, both because `transferMap.items` is keyed by `tr.remote`. Only the `/core/transferred` list is wrong.
- **Don't filter on `bytes === 0`** (it used to sit commented out in `updateCompletedTransfers()`). It erases same-remote moves, empty files and failed moves.
- **Don't keep whichever entry has the most bytes.** When the copy succeeds but deleting the source does not, the *outer* entry carries the error and the inner one is clean, so byte count picks the clean one and shows a green `OK` for a move that left the source behind.

What does hold everywhere: within one job, `group` + `name` names exactly one operation, so the collapse keys on those (through `functions.getTransferKey()`, shared with the render so the two cannot drift), keeps the first entry and folds in any error from the ones it drops. It needs the checks removed first, the delete entry sharing both fields with the other two and not always coming last.

A copy, and a move rclone does server-side, are already right and give one entry each — which is why this looks intermittent. It needs two *different* remotes, and that is enough on its own: even two `local` remotes on one filesystem take the copy fallback, since `SameConfig()` compares remote names and `--server-side-across-configs` is off by default. `/sync/move` on a folder has the identical shape, so the one collapse covers folder moves too.

### The completed transfers table is reconciled, not rebuilt

**Before touching `reconcileCompletedTransfers()` or the key and signature helpers, read `.claude/notes/completed-transfers-table.md`** — it holds the cost measurements, why the NUL separator is not a free choice, the two reasons the signature is load-bearing, and the timestamp-checkpoint alternative that silently loses records.

`updateCompletedTransfers()` does **not** wipe the `<tbody>` and rebuild it. It filters the checks, collapses the duplicates and sorts as before, then hands the result to `reconcileCompletedTransfers()`, which diffs it against `renderedCompletedTransfers` — a `Map` of the rows currently on screen — and touches only what actually changed. **A refresh that brings nothing new does zero DOM writes.**

**The list is not capped at 100, and rclone's own documentation says it is.** `core/transferred`'s help text is true only when a `group` is passed; with no group it sums **every** stats group, each pruned separately past `100 + --transfers`, and no flag caps the sum. Measured: 25 jobs × 60 files → 1500 entries, 684 KB of JSON per poll. So don't conclude from upstream docs that the table cannot grow.

**Identity is `group` + `name`, through `functions.getTransferKey()`**, which `collapseDuplicateTransfers()` calls as well so the two cannot drift. **The two fields are joined with a `"\u0000"`, and the separator is not a free choice** — it has to be a character that cannot occur in `group`, and a `"\n"` does not qualify. `getCompletedTransferSignature()` uses NUL for the same reason. Don't "simplify" either back to a printable separator.

**Beside the key each row carries a `signature`** — `started_at`, `error` and `size`, i.e. the fields the row actually shows — and a key whose signature has changed gets that one row rebuilt. This is not defensiveness: without it a move whose delete failed can keep a green `OK` permanently, and a job id reused after an `rcd` restart can keep the previous run's timestamp on screen.

The reconcile is a removal pass and then a single walk:

- Rows whose key is absent from the response are removed and dropped from the `Map`. This is what keeps the table equal to rclone's list when a group gets pruned or the daemon restarts.
- Then a `node` cursor walks the sorted list. A key not in the `Map` is built and inserted before `node`; a changed signature is rebuilt in place (moving `node` on first when it is that very row, so the replacement lands in the same slot); an unchanged row either *is* `node`, in which case the cursor just advances and nothing is written, or gets moved in front of it. `insertBefore()` with a `null` reference appends, so the end of the table needs no special case.
- **The walk ends in a tail-trim that removes everything from `node` onward, and that is load-bearing**: `index.html` ships a placeholder `<tr>` of four `-` cells inside `#completedTransfersBody` which the old blanket wipe disposed of as a side effect, and which otherwise sits at the bottom of the table for the life of the page.

A useful side effect of the walk, verified rather than assumed: it **self-heals**, re-attaching rows swapped out behind its back on the next tick.

**The current transfers table is deliberately left rebuilding, and should stay that way** — it is bounded by `--transfers` plus the queue, every cell it shows changes on every tick anyway, and its rows carry per-row cancel listeners where the completed table's carry none.

### Panel identity and paths

**Before changing a panel row's markup or `gui.css`'s rules for it, read `.claude/notes/panel-paths.md`** — it holds why a folder gets no size, why `overflow-wrap: anywhere` cannot be `break-word`, the `<p>`-vs-`<span>` measurement, the 720px reasoning, and the bug the re-entrancy guard fixed.

The two panels are addressed everywhere by their DOM ids, `"leftPanelFiles"` / `"rightPanelFiles"`, passed around as a `filesPanelID: string`. `functions.panelsPaths[filesPanelID]` holds the currently open rclone path in the form `remote:/some/path` (empty string = no remote chosen yet, which is the guard condition in most handlers).

`panel.openPath()` is the core of navigation: it splits the path at the last slash into `fs` (base) + `remote` (leaf) for `/operations/list`, rebuilds the panel's DOM, and records the path in `panelsPaths`. Copy/move parameter shape differs by item kind — folders use `srcFs`/`dstFs` (`/sync/copy`, `/sync/move`), files use `srcFs`+`srcRemote`/`dstFs`+`dstRemote` (`/operations/copyfile`, `/operations/movefile`). `functions.getFolderOperation()` / `getFileOperation()` map an operation name to the rc endpoint.

Each rendered row is `div.file-list-item > [checkbox, div.fileLine]`, where the `.fileLine` carries `dataset.type` (`"file"` | `"folder"`) and `dataset.path`. `addToQueue()` reads selection via `input[name=fileListItem]:checked` and then `nextElementSibling.dataset` — **that sibling relationship is load-bearing**.

Inside the `.fileLine` the children are `img.icon`, `p.file-name` and — **for files only** — `span.file-size`, holding the listing's `Size` run through `functions.getHumanReadableValue()`. Two guards decide whether that third child exists at all: **`IsDir === false`**, because a listing's `Size` for a folder is a number of no known use and folders are shown without a size rather than with a wrong one; and **`Size >= 0`**, a negative size being how a backend says it does not know one (which happens for *files* too, not only folders). An empty file needs no case of its own — it comes out of the formatter as `0 B`.

The `..` row has no size either — it is a bare `.fileLine` with no `.file-list-item` wrapper and no checkbox, built before the listing request even goes out. Its name is a `p.file-name` like any other row's, the class being there purely for the CSS; `src/search.ts` never reaches it, scoping its query to `.file-list-item > .fileLine`.

**The name carries `.file-name` so that nothing addresses it by position**, and the class must stay on **all three** name elements (`openPath()`'s two plus the static `..` rows in `index.html`) because `gui.css` keys the name's `margin`/`overflow-wrap` and the `.path-hint` colour on it. **The size stays a `<span>`.** One consequence of the size living inside the `.fileLine`: that element's own `textContent` is now name + size (`"a-subfolder20 B"`), so **a row's name must be read off `.file-name`, never off the `.fileLine`** — nothing in `src/` does the latter, but a test harness comparing `.fileLine.textContent` to a file name will silently stop matching.

The alignment is `.fileLine > .file-size` with `margin-left: auto`, the same right-push the GUI already uses for `.lastButtons`, so no grid or table is involved. `flex-shrink: 0` and `white-space: nowrap` make a long name wrap instead of squeezing the size, and `padding-left: 10px` is what keeps the two texts apart once a wrapped name has grown right up to the size, the auto margin having collapsed to 0 by then. `font-variant-numeric: tabular-nums` is only so the digits are equal-width in the column.

That wrapping is why **`.fileLine > .file-name` carries `overflow-wrap: anywhere`** — without it an unbreakable name turns `.panelFilesContainer` into a *horizontal* scroll container and pushes the size past the panel's right edge. **`break-word` does not work here and neither does `min-width: 0`**, alone or together; don't substitute either.

The size is stepped back from the name with `font-size: 0.9em` and `color: #757575` (the lightest grey clearing WCAG AA on white, 4.61:1) in the `"Courier New", Courier, monospace` stack. The unit is `em` and not `rem` so it keeps composing with `gui-mobile.css`'s `.filesList { font-size: 0.9em }`.

**Below 720px the size is not shown at all** — `gui-mobile.css` sets `display: none` on it inside the one media query that file consists of, because that is where the panels stop narrowing and start scrolling sideways, taking the right edge of every row out of view. The rule is scoped `.fileLine > .file-size`, so the transfers tables keep their own Size column on a narrow screen.

`openPath()` is **re-entrant**, and `panelsListingGeneration` in `src/panel.ts` is what keeps that from corrupting a panel. Each call takes `++panelsListingGeneration[filesPanelID]` into a local `generation`, and the `/operations/list` callback returns early unless it still holds the panel's current number, so only the newest listing renders. Three details of that guard are deliberate:

- It is a **counter, not a comparison** of the captured `path` against `panelsPaths[filesPanelID]` — that cheaper-looking version is the one a reader will try to simplify it to, and it fails because a refresh re-opens the *same* path, so both callbacks would find their path still current.
- It is **per panel**, so a listing on the left cannot invalidate one in flight on the right.
- It sits **below** the animation removal and the `rez === null` block rather than at the top of the callback: removing this call's own animation is already a no-op once a newer call has detached it, and a failing remote should still be reported even when the listing it failed for has been superseded (that being the deliberate logging exception noted in the request layer section).

Still unguarded on purpose: everything `openPath()` does synchronously (clearing the panel, resetting the items counter to `-`, the `..` row, the animation, and all three state writes — `panelsPaths`, `panelsListingGeneration` and `panelsItemsCount`). Re-entrant calls run those in order and the last one wins, which is the wanted outcome.

### The items counter and select-all

**Before touching `updateFilesCount()` or the select-all wiring, read `.claude/notes/items-counter.md`** — it holds the ordering bug that the compiler cannot catch, why the selected count is recounted off the DOM, and two traps in verifying any of this over the DevTools protocol.

The `Items:` counter in each panel header shows the listing total on its own (`19`), `-` before a listing has landed, and **`selected/total` (`3/19`) while at least one row's checkbox is ticked**. Next to it is that panel's **select-all checkbox** (`#leftPanelSelectAll`/`#rightPanelSelectAll`), which ticks or unticks the rows and carries the tri-state summary of the selection. `updateFilesCount(filesPanelID)` in `src/panel.ts` writes both of them and is the only thing that does; it runs from `initPanels()` (the initial state), both `openPath()` sites, the panel's `change` listener, `selectAllChanged()`, `operationClicked()` right after `addToQueue()` returns, and — for the select-all state only — `clearSearch()` and the search filter in `src/search.ts`.

**The render must come after the rows are appended, not before.** The counter text does not care, which is exactly the trap: the select-all state is derived from the rendered rows, so rendering first leaves the checkbox disabled on every listing that *does* have items in it.

The two `<span class="filesCount">`s carry `id="leftPanelFilesCount"`/`"rightPanelFilesCount"`, so the module declares them as consts and picks one with a `filesPanelID` ternary; the two panel divs are reached through **`getFilesPanel(filesPanelID)`**, which is `openPath()`'s one way of getting at a panel. The select-all checkbox sits **inside the header's existing counter `<div>`**, before the `Items:` label (`☑ Items: 3/19`), and gets one `gui.css` rule (`.select-all { vertical-align: middle; margin: 0 5px 0 0 }`) so the gap is not whatever each browser's asymmetric UA margin happens to be.

The total lives in **`panelsItemsCount`** (per panel, `-1` = no listing, rendered `-`), a sibling of `panelsListingGeneration`, and still comes from the response array's length, never from counting rows. The **selected count, by contrast, is counted off the DOM on every render**, with `addToQueue()`'s own `input[name=fileListItem]:checked` selector. That asymmetry is deliberate: both `addToQueue()` and `selectAllChanged()` set `checked` directly, which fires no `change` event, so a tally kept up by the listener would silently drift. Using that same selector is also what makes the counter agree with the buttons about **rows the search filter has hidden** — a ticked row that has scrolled out of the filter still counts *and* still gets queued.

**Select-all acts on the rows that are on screen only**, which is what makes "filter, then select all" the way to select a subset: type a query, tick the header box, press Escape (the selection survives it), then Copy. `getVisibleItemCheckboxes()` decides what is on screen by testing the `.file-list-item`'s inline `style.display` — the very property `search.ts` writes — so it cannot drift from the filter, and `selectAllChanged()` then assigns `checked` and calls the render itself. Its own three-way state follows: **ticked** when every visible row is selected, **`disabled`** when there are no visible rows at all (no listing yet, or a query matching nothing), and **`indeterminate`** whenever something is selected but it is not all of them. That last one is keyed on the *whole* selection rather than the visible part.

Which is also why **`src/search.ts` calls `updateFilesCount()`** — from `clearSearch()` and from the end of the debounced filter — and therefore imports `panel.ts`, making a fourth deliberate import cycle. Without it the next click on the box would *untick* and appear to do nothing at all.

The wiring is **one delegated `change` listener per panel div** in `initPanels()`, not one per checkbox in `openPath()`, since `change` bubbles and those divs are emptied with `removeChild` without ever being replaced. The two select-all boxes need listeners of their own, being in the headers. `operationClicked()` doing the post-`addToQueue()` render is what keeps `queue.ts` from having to import this module back.

### Client-side queue

**Before touching the slot accounting, read `.claude/notes/queue.md`** — it holds why the allowance is a store rather than the slider, why `/job/list` and not the `transferring` counter, and the measurements behind every number in here. The slider widget and its two header indicators have their own note, `.claude/notes/transfers-slider.md`.

`transfersQueue` in `src/queue.ts` is a plain array of `QueueItem`. `processQueue()` runs on a timer (`timerProcessQueue`, 5s), asks `/job/list` which of its own jobs are still running, and then submits as many items as fit in the free slots, one `submitQueueItem()` call each. The queue is per-browser-tab and lost on reload; already-submitted jobs keep running in `rclone` because they were sent with `_async`.

The unit being capped is **transfers, not queue items**, and the two differ because a folder operation is a single job that rclone runs up to `--transfers` files inside:

- `getActiveQueueSlots()` is the allowance — rclone's own `--transfers`, read off **`rcloneTransfers`**, an exported `let` in `settings-ui.ts` holding the number rclone last *confirmed*. It is written in exactly one place, the `/options/get` callback, which is what makes it a number rclone *reported* rather than one the GUI assumed — and that distinction is load-bearing, because **a 200 from `/options/set` confirms nothing**, so `setMaximumAllowedRcloneTransfers()` re-reads **unconditionally** rather than only on failure. It is an exported `let` and not a getter so that the compiler holds the single writer (`TS2632`), and it falls back to a literal `1`, agreeing with the markup's `value="1"` and `gui.css`'s static green `accent-color`, so a failed `/options/get` at load leaves the queue serial and the UI honest. **Don't read the slider for this** — through a drag and across the `/options/set` round trip the knob and rclone disagree, and a tick landing in that window budgets from a number the user has not settled on.
- `getQueueItemAllocation()` is what an item about to be submitted may use: 1 for everything except a folder copy or move (a file copy or move by definition, and a delete of either kind, since rclone deletes with checkers rather than transfers). A folder asks for as many transfers as it has files, capped by the allowance, since that is the most it could ever use. The number goes to rclone as that job's own `_config.Transfers`, so the job physically cannot exceed it — the cap is enforced by rclone rather than assumed.
- **With the allowance at 1 no count is asked for at all**, because it cannot change anything. Items queued in that state keep `fileCount` at `-1`, and `countQueuedFolderFiles()` goes and gets the counts when rclone confirms a **different** allowance — from any of the three paths that reach the `/options/get` callback (load, the settings tab's `onShow`, the re-read after a set), **gated on the value having actually changed**. That gate is not optional: the callback runs on every settings-tab open, and counting unconditionally would fire a full recursive walk of every queued folder each time.
- The file count comes from `countQueueItemFiles()`, which asks `/operations/size` once as the item is added to the queue and parks the answer in the item's `fileCount` (`-1` = never arrived). Nothing else can supply it: rclone itself only learns a folder's contents after the job is running and has listed the source. Two costs to know about — `/operations/size` is a full recursive traversal server-side, and queueing N folders at once fires N of these straight away.
- Where the count is unknown the folder falls back to the **whole** allowance, deliberately, and not merely the slots that happen to be free: `_config.Transfers` is fixed for the life of a job and cannot be raised later, so a folder started on one spare slot crawls along on that one slot forever. So such a folder waits for the allowance; what keeps the queue moving meanwhile is the next point.
- `getRunningJobCost()` charges a running job only what it can still use, from its own `/core/stats` group: whichever is larger of the files it has in flight and `totalTransfers - transfers`, capped by its allocation. So a folder holding 2 files is charged 2 even though it was allowed 3, and a folder down to its last file is charged 1 — the difference goes straight back to the queue, which is how a file item gets to run beside a folder that cannot fill its own allowance. Two cases deliberately keep the full allocation: a group that has nothing in flight *and* `totalTransfers` still 0 (it is listing or comparing and could yet come back wanting everything), and a group whose stats could not be fetched at all.
- `submitFromQueue()` walks the queue in the order things were added, but **steps over** an item that does not fit instead of stopping at it. This is what stops a folder waiting for the whole allowance from holding up every single file behind it. The folder keeps its place and goes out as soon as the allowance is free. Two consequences worth knowing: a folder still waits behind another folder, and a folder in a queue that keeps having files added ahead of it can be stepped over for as long as that goes on.

So `--transfers 1` is what makes the queue serial, and it is the only control: there is no separate GUI toggle, and adding one back would be redundant.

Why the queue needs slot accounting at all: `--transfers` parallelises files *within* a single rclone job, so a queued single file is a one-transfer job and, without this, they ran strictly one at a time however high `--transfers` was set.

**Don't gate on the `transferring` counter.** `/core/stats` for a folder job's group carries neither a `transferring` nor a `checking` key *at all* while it walks the source, so the job looks idle and every tick submits another item next to it — measured at 7 files in flight where 3 were allowed.

`activeQueueJobs` is the state that replaced it: `{jobid, executeId, dataType, allocatedSlots}` pushed by `rememberQueueJob()` from each submission's response, pruned every tick against `/job/list`. A tick is therefore `/job/list` plus one `/core/stats` per surviving job (at most the allowance, so a handful), and `processQueue()` waits for all of them through a **`Promise.all`** over `requestRclone()` before calling `submitFromQueue()` once — the one place in this codebase that waits on more than one response, and the only reason the request layer has a promise-returning form at all. Each per-job request is given its own rejection handler returning `getRunningJobCost(job, null)`, so a failed request charges exactly what a non-200 charges and the `Promise.all` cannot be left hanging. Two traps it exists to avoid:

- `runningIds` must be **intersected** with the ids submitted here and never simply counted, because every rc call over HTTP gets a job record, so the answer always includes the `/job/list` request asking the question (plus any `/core/stats` poll in flight beside it).
- **`executeId` has to be compared too**, because rclone hands out job ids from 1 again after a restart and a bare id would start matching an unrelated job.

A useful side effect: `processQueue()` now does nothing at all when `/job/list` fails, so a queue no longer drains into an unreachable `rcd`.

A *rejected* submission (rclone answered, with a non-200) puts the item back: `rememberQueueJob()` takes the whole `QueueItem` and `unshift`s it to the front on `null`, which is also why `copyOrMoveOperation()`/`deleteOperation()` take the item rather than the seven and five separate fields they used to. It is bounded by `queueSubmitAttempts` (3) counted in the item's own `submitFailures`, after which the item is dropped with a `console.error`. **The bound is not optional** — an unbounded retry re-sends a doomed item every 5s forever, and a folder item doing that holds every slot each time.

`removeFromQueue()` takes the `QueueItem` itself, not its row index, and bails via `indexOf() === -1`, because `submitFromQueue()` can splice several items out of the queue per tick and from the middle of it, so an index captured at render time goes stale and would delete the wrong item.

### Refresh loop

**Before touching `updateRefreshViewControls()` or the interval, read `.claude/notes/refresh-loop.md`** — it holds the bug the unconditional initial paint fixed, and why the `timerRefreshView` read-back is not the redundant line it looks like.

`refreshView()` polls `/core/stats` (current transfers) and `/core/transferred` (completed) on `timerRefreshView` (default 2s), toggleable in the settings tab. File listings are *not* auto-refreshed (`refreshFilesListing()` exists but is deliberately unused).

**`updateRefreshViewControls()` is the only authority on how the GUI looks while that toggle is on or off** — the `chbx-polling` checkbox itself, the `#indicator-gui-frozen` snowflake, and the choice between `#inputRefresh` (the interval slider) and `#manualRefresh` (the manual refresh button). It is called from `initSettingsUI()` **and** from the checkbox's own `change` listener, which is what leaves `settings.userSettings.timerRefreshEnabled` with exactly one writer (`= this.checked` in that listener) and no second paint site.

Four rules about it, each of which was a bug or is one waiting:

- **It paints the initial state too, unconditionally.** `js/settings.js` is hand-edited after deployment and can ship `timerRefreshEnabled: false`, which neither the markup nor the CSS can express, so no execution path leaves a correct UI if the call is skipped. This is deliberately *not* an instance of the "nothing runs for the initial state" stance the transfers indicators follow.
- **It writes `"contents"`, not `"flex"`**, to the two `.settings-item` rows it brings back — they generate no box of their own so that their label and controls land in the two columns of the `.settings-grid`, and `flex` would put the whole row in the label column.
- **Each element is written through its own ternary** rather than an `if`/`else`, because the original bug *was* two branches listing different element sets.
- **It reads the flag through `=== true`**, matching `transfers.ts`'s tick and `queue.ts:submitFromQueue()`, so a hand-edited `"false"` or `0` cannot tick the checkbox while polling stays off.

It must stay **paint-only**. The interval is created once in `initSettingsUI()` and is still created and still ticking while the flag is false — the tick no-ops on `=== true` — which is what makes the checkbox work with no start/stop path at all. `updateRefreshViewHeat()` likewise stays unconditional and above the call, being the sole writer of `#output-refresh-view-value` and the slider's `accentColor`.

`initSettingsUI()` also **reads `timerRefreshView` back off the slider** after assigning it (`settings.userSettings.timerRefreshView = parseInt(inputRefreshView.value)`), because a range input silently clamps and snaps an assigned value and — the validation and `alert()`s being gone — those attributes are now the only validation a hand-edited `js/settings.js` gets. Don't delete it as a no-op round trip: the assignment goes *through* the input, which is a filter and not a variable, and without it `timerRefreshView: 0` polls as fast as the browser's nesting clamp allows.

The interval is set by `input-refresh-view`, a 1–120 `type="range"` slider with `#output-refresh-view-value` beside it — same arrangement as the transfers slider: `input` calls `updateRefreshViewHeat()` for the label and the colour, `change` (on release) writes `settings.userSettings.timerRefreshView` and restarts the interval, which is why the timer is not torn down and rebuilt on every step of a drag. The colour scale is deliberately *not* a green → red ramp: **1 is red** on its own (rclone polled every single second), **2 is green** (the shipped default), and **3 upwards cools off** — hue 120 → 240 over the first half of the 3–120 range, then hue stops at blue and the lightness drops 42% → 20% instead, so 120 lands on navy. Hence the two special cases at the top of the function rather than one interpolation: the scale is discontinuous by design at 1.

### Wiring convention

**Each module declares the `document.getElementById` consts it works with and wires its own listeners**, in an exported `initX()` that `window.onload` calls: `initPanels()`, `initQueue()`, `initSettingsUI()`, `initTabs()`. `initTabs()` is order-independent even among those, because it fires no request until something is clicked; `initSettingsUI()` keeps its load-time `/options/get` regardless, since the header transfer indicators and the queue allowance need that value whether or not the settings tab is ever opened — and it is now the only thing that can ever fill `rcloneTransfers` on a page where that tab stays closed and the slider is never touched. That `initQueue()` runs *before* it is harmless: the queue's interval only fires 5s later, `processQueue()` returns immediately on an empty queue, the queue can only be filled by a user click, and the store is initialised at module-evaluation time in any case. `src/transfers.ts` needs none — its rows carry per-row listeners built during rendering, and `refreshView()` is called directly.

Everything is still duplicated symmetrically for left/right, so adding a panel control means: markup in `index.html` (twice, with `leftPanel…`/`rightPanel…` ids), two consts, two listeners — all of it in the module that owns the control, which keeps the symmetry inside one file. This replaces the older arrangement of every lookup and every `addEventListener` living in `src/main.ts`, which is what took that file to 1639 lines.

The one real ordering constraint in `window.onload`: `main.ts` reads `login_token` out of the URL **before** calling any `initX()`, because `requestRclone()` builds the `Authorization` header from it and each of them sends requests. The `initX()` calls are otherwise order-independent — the three requests they fire (`/config/listremotes`, `/options/get`, and the first `/core/stats`) are unrelated.

`src/folder.ts` and `src/search.ts` reach their panel via `btn.parentNode!.parentNode!…` walks, so they are coupled to the `index.html` nesting depth.

`createFolderClicked()` in `src/folder.ts` validates the typed name before sending it, because rclone takes `remote` as a literal path relative to `fs` and does **not** clean it: `a/b` would quietly build a hierarchy instead of the one folder asked for, and `..` would resolve outside `fs` (the only thing stopping `../x` by default is the local backend's `Dot` encoding — a remote configured `encoding=None` escapes the fs root, verified). So `/`, `\`, `.` and `..` are rejected with an `alert()`. Everything else goes through untouched — apostrophes, quotes, `&`, `<`, colons, commas and brackets are all legal in a folder name and must stay that way. The `.trim()` is deliberate and silently alters the name: leading/trailing whitespace is nearly always a slip, and many backends reject or rewrite it anyway (rclone has a `RightSpace` encoding for exactly that).

### Search

**Before touching the search box or its CSS, read `.claude/notes/search.md`** — it holds the three bugs this shape fixed (the `keyCode` whitelist, the two stale-query paths) and the five details of the validity hint, three of which are second attempts.

`src/search.ts` filters *already-rendered* rows in the DOM (debounced 200ms, min 3 chars) — it does not query rclone. It compares `normalize("NFC")` on both sides, because a name can arrive decomposed (NFD, `e` + U+0301 — what a remote fed from macOS tends to hold) and would otherwise never match the same name typed composed. `toLowerCase()` is left locale-blind on purpose (Turkish `I`/`ı`, `ß`/`SS` mismatch); `toLocaleLowerCase()` would trade one wrong answer for a locale-dependent one.

Because the filter is scoped to the rows that happen to be rendered, **the query box has to be emptied whenever those rows are replaced**, or it claims a filter nobody is applying. Two places do that: `openPath()` on every navigation (reaching the input through the `leftPanelSearchQuery`/`rightPanelSearchQuery` consts and a `filesPanelID` ternary, not a `parentNode` walk), and `hideSearch()`. The search block itself stays *open* with an empty input after a navigation, deliberately.

The query box is wired to **`input`**, and its `keyup` listener handles `Escape` only. **Don't reintroduce a key-identity test** — the old `keyCode` whitelist meant digits, space, punctuation, non-Latin input, IME composition and paste never fired the filter at all.

The **3-character minimum is announced by the markup, not by JS**: `minlength="3"` on the query input, plus `gui.css` rules keyed on `:invalid` that tint the field amber and reveal a `min. 3 characters` `<output>` *inside* it, just past the typed text. `searchQueryChanged()` therefore still returns early under 3 characters but logs nothing. Doing it in CSS is what keeps the cue from disagreeing with the field: per spec a value is *too short* only when the **user** last changed it and it is **not empty**, so emptying the box clears the tint and the hint for free. Four rules that are easy to undo by accident:

- The invalid cue is a **`background-color`, not a ring** — a ring sits under the browser's focus indicator, the field being focused for as long as anyone is typing in it.
- **`box-shadow: none` on the invalid input is load-bearing**: Firefox otherwise paints its own red glow on a `:user-invalid` field, which overstates a hint as an error.
- **`.input-query.search` is a grid** (`1fr auto`) with the input and the hint in the same cell, so the hint overlays the field and reserves nothing. `showSearch()` must therefore set `display: grid` inline, and the CSS rule must **not** declare `display` at all, or the search row is on screen before Search is ever clicked.
- `visibility`, not `display`, is what makes the **`aria-describedby`** on the input read correctly.

### Icons and human-readable sizes

**Before adding a file type or touching the size formatter, read `.claude/notes/mime-icons.md` and `.claude/notes/human-readable-sizes.md`** — the first holds where rclone's MIME answer actually comes from and why it differs per host, the second the rank-boundary bug.

`functions.getIconType(mimeType, fileName)` maps a listing entry to an SVG in `images/` (Bootstrap Icons); add new file types there. It takes the **name as well as the MIME type**, because the MIME type alone cannot identify every file: rclone has no MIME table of its own and asks the MIME database *of the machine running `rcd`*, which returns `application/octet-stream` when nothing matches and **spells the same type differently on different hosts**. Three rules follow:

- The media families are matched with `type.startsWith("video/" | "audio/" | "image/")` and **not** by enumerating exact strings — `.mkv` is `video/matroska` on Debian and `video/x-matroska` elsewhere, and the old exact `case` matched nothing in this container.
- `videoFileExtensions` and the extension fallback are consulted **only after** every MIME test has failed, so the stored MIME type of a cloud object stays authoritative. They exist because some extensions are in no database at all, and mapping `application/octet-stream` itself to `film.svg` would give every unrecognised file a film icon.
- MIME parameters are **stripped once** (`mimeType.split(";")[0].trim()`), which is what lets one `text/plain` case cover `text/plain; charset=utf-8`. And **`.ts` is deliberately absent** from `videoFileExtensions` — it is a transport stream in a video folder and TypeScript everywhere else.

`functions.getHumanReadableValue(sizeInBytes, metric)` has four ranks — `B`, `KB`, `MB`, `GB`. There is deliberately **no TB rank**: adding one would silently change the disk-space suffix for a large remote (`9313.23 GB` → `9.09 TB`), so GB is the tail and may exceed 1024. Two things about the two decimals are handled by helpers next to the function rather than inside its branches, and both must stay:

- **The rank is chosen from the rounded value, not the raw one** (`fitsInRank()`), because two decimals are what actually gets shown — otherwise a size a few bytes short of the next rank reads `1024.00 KB` where it should read `1 MB`.
- **Trailing zeros are dropped** (`getRankValue()`), so two decimals are a maximum and not a fixed width: `1 KB` rather than `1.00 KB`.

### Header tabs

**Before changing anything here, read `.claude/notes/header-tabs.md`** — it holds the measurements these rules rest on and the four chip-styling alternatives that were tried and failed.

The collapsible blocks between the header and the transfers — `#donation` and `#settings`, both `class="header-tab"` — are **mutually exclusive**, and `src/tabs.ts` is the only thing that opens or closes one. At most one block's height is ever added to the page, which is the whole point.

**Vocabulary, and it is now unambiguous**: "panel" always means a **file** panel (`src/panel.ts`, `panelsPaths`, `.filesPanel`, `.panelFilesContainer`, the README's "two-panel file manager"); "tab" means a header-toggled `.header-tab` block (`src/tabs.ts`). Watch out when renaming that class again: **`.panelFilesContainer` starts with the same eight characters** as the `.panel` it replaced, so a blanket `s/\.panel/…/` corrupts a file-panel rule, and `panels.ts` is not an available module name because `panel.ts` already exports `initPanels()`.

**The header icons are the tab strip — no strip is drawn anywhere.** `#btn-donation`/`#btn-settings` open their own tab, close it if it was already the open one, and switch straight from one to another. The visible label is the block's own `<h4>`, so the open tab names itself and a strip would be redundant; the button's `alt` (the accessible name, required on `input type="image"`) and `title` (the tooltip) are the labels, and both read `Donation`/`Settings` rather than "Show/hide …" because a click can now mean *switch*. Adding a tab is an entry in the `tabs` registry — the only list of which tabs exist — plus an `<input type="image">` in the header and a `div.header-tab` in `index.html`.

**The `|` between the status indicators and the tab buttons is conditional**: `#separator-indicators` is hidden by `gui.css` and shown only while at least one of the three indicators is on screen, since with all of them dark it would sit alone to the left of the tab buttons and separate nothing. `updateSeparatorIndicators()` in `src/settings-ui.ts` is its only writer, and it lives there rather than in `tabs.ts` because it follows the *indicators*, which that module owns — nothing about it changes when a tab opens. Three rules: it derives its state from the indicators' own inline `display` and the test must stay **`=== "block"`, not `!== "none"`** (an untouched indicator has an *empty* inline `display`, so `!== "none"` reads all three as visible on load); it has exactly **two call sites**, the ends of `updateRefreshViewControls()` and `updateRcloneTransfersIndicators()`; and it gets a rule of its own in `gui.css` rather than joining the indicators' `display: none` group.

The registry entry carries an optional **`onShow`** hook that runs every time the tab is opened, **including on a direct switch**, which is not a close followed by an open and is the easy thing to miss. The settings tab uses it for `getMaximumAllowedRcloneTransfers()`, so a `--transfers` changed through `/options/set` behind the GUI's back is picked up. It is called **after** the `display`/`aria`/`activeTab` writes, so a throwing hook cannot leave a tab that is on screen recorded as closed, and it must not fire on close.

Three things about the state:

- **`aria-expanded` is the only state and the CSS hangs off it** — no parallel `.active` class, which would be a second source of truth free to diverge from the a11y tree. It is written with `setAttribute` (there is no `ariaX` idiom in `src/`) and is **static in the markup** as `false`, so the a11y tree and the CSS agree before any JS runs and `initTabs()` needs no init pass — the same reasoning as the transfers indicators.
- **Visibility stays an inline `style.display` write**, per the habit documented above. Do not move the blocks to a class-based `.header-tab.open { display: block }` scheme: an inline `display` left behind by any forgotten code path beats a class rule outright and is invisible in the stylesheet. Mixing the two is the trap; the chip being class-free and attribute-keyed is what keeps them from mixing.
- **Nothing is persisted.** Closed on load, deliberately, like the queue. If that is ever revisited, note `getMaximumAllowedRcloneTransfers()` would then run twice on load — once from `initSettingsUI()`, once from `onShow`.

**There is deliberately no wrapper div** around the two blocks, and `role="tablist"`/`role="tab"` is deliberately not used either. A wrapper *inside* a block is a different matter and there is one: `.settings-grid` holds the settings tab's two `<h5>`s, which is why `.header-tab > h5` no longer matches anything and was deleted rather than kept, its margins moving onto `.settings-grid > h5`. `.header-tab > h4` still matches, the `h4` being left outside that wrapper.

The active tab is marked by a chip on its header button, `.header > input.icon[aria-expanded="true"]` — `#cbe8f6` fill with a `#02699C` border, box `calc(2rem + 8px)` with `padding: 3px` — and the **border is what carries the state, not the fill**, which is a measured contrast constraint and not a preference. Four further rules:

- The border is **always** 1px and only changes colour, so toggling is paint-only with no layout shift.
- **`.header > input.icon` must be mirrored in `gui-mobile.css`** and this is the easiest thing here to get wrong. It is specificity (0,2,1) and beats that file's `.header > .icon` (0,2,0) *regardless of the media query*, so without the mirror the buttons keep their desktop size below 720px while the three indicators shrink.
- The selector is scoped **`input.icon`, not `.icon`**, because the three status indicators are `<img class="icon">` direct children of `.header` too; element type is what separates the buttons from them. Equally, **do not wrap the two buttons** in anything — `.header > .icon` is a direct-child selector so they would fall back to `.icon`'s 1.2em, and `.header > *`'s 12px `margin-left` would land on the wrapper, leaving the buttons flush against each other. Nothing is added to or reordered in `.header`, so `.header > *:nth-child(1), *:nth-child(2)` still points at the `h1` and the yellow indicator.
- The `:hover` is scoped `[aria-expanded="false"]` rather than relying on source order, because `:hover` and `[aria-expanded="true"]` have **identical specificity** (0,3,1) and whichever came last would win.

Two last rules. **Never put `.header` inside a `<form>`** — there is none in `index.html`, which is the only reason these submit buttons are inert rather than navigating with `x`/`y` coordinates on every click. And both buttons carry **`draggable="false"`**, without which a press that drifts a few pixels before release starts an image drag and produces no `click` at all, so a slightly unsteady click on a tab does nothing; it is **not** redundant with the default despite their `draggable` IDL attribute already reporting `false`, so don't "simplify" it away on the strength of that value.

`getMaximumAllowedRcloneTransfers()` is **generation-guarded** — a plain number, there being one slider, with the guard below the `rez === null` block, the same shape as `panelsListingGeneration` in `panel.ts` — because releasing the transfers slider and immediately switching tab and back puts two `/options/get` in flight and XHR responses are not ordered. It had to be closed once the queue budgeted from that number: a stale answer no longer merely snapped the slider, it over-allocated the next folder job.

### Settings tab layout

**Before touching `.settings-grid` or `.settings-item`, read `.claude/notes/settings-tab-layout.md`** — it holds why the controls column is `1fr`, what each declaration is load-bearing against, and the `getClientRects()` trap a test harness hits here.

The settings tab's rows are a **two-column grid** — one column of labels, one of controls — so that every control starts at the same x, and both sliders carry the same `width: 16em` so they also end at the same x. The shape is `.settings-grid` (a wrapper *inside* `#settings`, holding the two `<h5>`s and the rows) with `.settings-item { display: contents }` on each row, so a row's own children — a label and one `.settings-control` — become items of that grid and therefore share its columns. Six things about it are load-bearing:

- **The grid cannot be `#settings` itself.** `tabs.ts` writes `display: block` to that element to open the tab, so a `display: grid` on it would be overwritten on the first click. Hence the wrapper, which also keeps the `h4` (outside it) matching `.header-tab > h4` while taking the two `h5`s out of `.header-tab > h5`'s reach — that rule is deleted, its margins now on `.settings-grid > h5`.
- **`display: contents` forces `settings-ui.ts`'s hand.** `updateRefreshViewControls()` writes `"contents"` and not `"flex"` when it brings `#inputRefresh` or `#manualRefresh` back. It also means `gui-mobile.css` can never give `.settings-item` a different display, an inline style beating a media query — so the layout stays two columns at every width rather than stacking below 720px, and there is deliberately **no second breakpoint** (same stance as `.file-size`).
- **Exactly two children per row** is what makes grid auto-placement land every row correctly with no explicit `grid-column` anywhere but the headings. Keep rows at two children and no `grid-column` is needed.
- **The controls column is `1fr`, not a second `auto`** — the group hairline spans both columns and would otherwise change length whenever the manual refresh row replaces the interval slider one, and the `fr` is what leaves the labels column content-sized. Without it a `justify-content: start` becomes mandatory; that declaration was removed as inert only *because* of the `1fr`.
- **`justify-items: start`** keeps the boxes content-sized rather than stretched across the `1fr` column, which is why `.settings-grid > h5` needs `justify-self: stretch` to opt back out — without it the heading shrinks to its own text width and drags the hairline with it.
- **The labels column is `auto`** rather than a hardcoded width, so rewording a label cannot silently break the alignment.

`.settings-control > input, > button` also get **`margin: 0`**, because the browsers' own margins differ per widget and are not even symmetric, which put the slider, the checkbox and the manual refresh button on three left edges 4px apart inside one column that exists to align them. The `gap: 6px` is the only spacing in there now. Same reasoning as `.select-all` in the files panel header.

Two smaller notes. The trailing `seconds` stays a `<label for="input-refresh-view">` so clicking it still focuses the slider. And `#manualRefresh`'s label is a **`<span>`, not a `<label for="btn-manualRefresh">`** — a button takes its accessible name from its contents, and clicking a label for one is not a useful affordance.

### Version string

**Before touching the version, the release tags or `docker/prepare-for-building-the-image.sh`, read `.claude/notes/version-string.md`** — it holds what each of the five guards is worth, why the README uses bare `sed` where the script uses `$sedCommand`, and the two alternatives that were rejected.

`const guiVersion` at the top of `src/main.ts` is bumped by hand and shown in the footer. It moved from semver to a date-based scheme (`"2026.6.28"`).

Being a compile-time constant it needs no rc call, so it is assigned directly in `window.onload` rather than inside the `/core/version` callback — it paints immediately and still shows when rclone is unreachable. Only the two *rclone* footer labels (`rcloneOS`, `rcloneVersion`) come from `/core/version`, which is requested exactly once on load; `refreshView()` polls only `/core/stats` and `/core/transferred`, so none of the three footer labels are touched by the refresh timer.

**That line is the only place the version is edited, and everything else derives from it.** `docker/README.md`'s build section reads it back with `sed` rather than spelling `GUI_VER` out as a literal, so the image tag (`rclone_<rclone version>-gui_<gui version>`) and the `org.opencontainers.image.version` label cannot drift from what the footer shows. That extraction is **bare `sed`, deliberately, not `$sedCommand`/`gsed`** — the README is instructions for whoever builds the image, and `gsed` exists only where Homebrew put it. The only construct that genuinely needs GNU `sed` is the **in-place** edit in the prepare script, which is the whole justification for that script's `gsed` detection.

`RCLONE_VER` is derived the same way but from a **different** source of truth: rclone's version has a real `ARG RCLONE_VERSION_VALUE="v<version>"` default in the `Dockerfile`, and **that line is where the bundled rclone version lives** — read it rather than any number written into this file. `GUI_VERSION_VALUE` gets no such default on purpose, since a default in the `Dockerfile` would drift from `guiVersion`.

**Forgetting the bump is guarded in `docker/prepare-for-building-the-image.sh`**, which refuses to pack `contents.tar` unless five things hold, checked in this order (exit codes 4 through 8):

1. the `guiVersion` line can be extracted at all;
2. it matches `^[0-9]{4}\.([1-9]|1[0-2])\.([1-9]|[12][0-9]|3[01])$` (the tags and the label are unpadded, so `2026.09.13` must not pass);
3. no `v<version>` tag exists yet — **the strongest of the five**, date-independent and with no false positives;
4. the working tree's value equals `git show HEAD:src/main.ts`'s — this one catches a genuinely invisible failure, `tsc` running *above* the `git stash`;
5. it equals today's date — **the weakest of the five**, and so the only one with an escape hatch (`GUI_VERSION_DATE_CHECK=0`) rather than a plain refusal.

The block sits **below** the `sed` and `tsc` detection and **above** the `tsc` call and the stash, so a failure costs nothing and cannot leave a half-prepared tree.

## Hard constraint: no `sync/sync`

Support for [`sync/sync`](https://rclone.org/rc/#sync-sync) is intentionally absent because it can destroy data, and the upstream author rejects PRs adding it (README, issue #10). Do not add it.

## Docker packaging

**Everything about the image lives in `docker/CLAUDE.md`**, which loads by itself as soon as a file in that directory is read. What follows is only the part that bites from *outside* that directory.

**Changing the literal default lines in `src/settings.ts` silently breaks the Docker image.** `docker/entrypoint.sh` generates `js/settings/settings.js` from the compiled `.default` by `sed`ing in environment variables, and those patterns match the literals exactly (`host: "http://127.0.0.1:5572",`, `user: null,`, `pass: null,`, `someExampleRemote`, …). So the *object literal* in `src/settings.ts` must not be touched — only the types around it.

`./docker/prepare-for-building-the-image.sh` **must be run from the repository root** and is destructive to the working tree: it checks the GUI version (five refusals — see the version string section), compiles, `git stash`es, rewrites the settings path, tars the GUI into `docker/contents.tar`, then `rm -r ./js/*`, `git checkout -- .` and pops the stash. It needs `tsc` and GNU `sed` (`gsed` on macOS).

The `Dockerfile` is **BuildKit-only** (`TARGETARCH` and `COPY --chmod`), so `DOCKER_BUILDKIT=0` fails outright rather than falling back. `org.opencontainers.image.version` is the **GUI** version, not rclone's, so it derives from `guiVersion` in `src/main.ts`.

Release packages come from `git archive`-style exports — `.gitattributes` marks `.github/`, `docker/`, dotfiles, `CLAUDE.md`, `/.claude/`, the Sublime project and `screenshot.png` as `export-ignore`. Note that puts `docker/CLAUDE.md` and `.claude/notes/` outside the release archives, which is intended.

## Code style

Match the existing code: Allman braces, 4-space indent, single-line `if (x) { return; }` guards, explicit `as HTMLDivElement`-style casts and `!` non-null assertions, `document.createElement` + `Object.assign` for DOM construction, `.concat()` favoured over template literals for path building, commented-out debug `console.debug`/`console.group` lines are kept on purpose. TS imports must carry the compiled extension (`from "./functions.js"`) because the browser loads them as native ES modules.

DOM construction is `createElement` + `Object.assign` + `createTextNode` **exclusively**: there is no HTML-string path in `src/` and no `innerHTML` assignment anywhere in it, so don't add one back. A `functions.htmlToElement(html)` helper used to exist for exactly one caller and was deleted rather than left unused — see `.claude/notes/code-style.md` for why, and for why the loading animation is `remove()`d rather than hidden, which is the one place the GUI does not follow its own `style.display = "none"` habit.

Note the project's stance: personal tool, tested only in Firefox, no cross-browser effort, no support guarantees.
