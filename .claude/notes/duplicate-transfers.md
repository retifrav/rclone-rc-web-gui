# One moved file reported twice — the measurements and the two wrong fixes

Supporting notes for the **One moved file is reported twice** section of `CLAUDE.md`.

## The three entries

Measured against the container's rclone, an `operations/movefile` between two filesystems (so `os.Rename` fails with `EXDEV`) gives **three** entries for a single file:

| # | `bytes` | `size` | `checked` | `what` | comes from |
|---|---------|--------|-----------|--------|------------|
| A | `0` | 3000000 | `false` | `transferring` | `operations.move()`'s own transfer |
| B | 3000000 | 3000000 | `false` | `transferring` | the `Copy()` it falls back to |
| C | `0` | 3000000 | **`true`** | `deleting` | `DeleteFile()` on the source |

C is a check and was always filtered. **A and B are identical in every field of rclone's `TransferSnapshot` except `bytes`** — same `name`, `size`, `group`, `error`, `srcFs`, `dstFs`, `what`, `checked`, and `started_at`/`completed_at` ~30 µs apart, which `toLocaleString("en-GB")` renders the same. The GUI renders none of `bytes`, so the two rows were pixel-identical.

## The cause

In rclone's `fs/operations/operations.go`: `moveOrCopyFile()` picks `Op = MoveTransfer` → `move(…, isTransfer: true)`, which registers A, tries `fdst.Features().Move`, takes `fs.ErrorCantMove` ("Can't move, switching to copy") and calls `Copy()` — which registers B — without ever removing A from `StatsInfo.startedTransfers`, the slice `/core/transferred` serialises verbatim.

## This is not new, and the `checked` filter used to cover it

Bisected with real release binaries: 1.50.2, 1.55.1, 1.60.1, 1.63.1, 1.64.0, 1.64.2 and **1.65.0** all render **one** row because A arrives as `checked: true`; **1.65.1** through 1.75.1 render **two** because it arrives as `checked: false`.

rclone commit `fbdf71ab6456` ("operations: fix files moved by rclone move not being counted as transfers", see rclone#7183) introduced `MoveTransfer`/`isTransfer` and was backported into the v1.65.1 point release; before it, `move()` always used `NewCheckingTransfer(src, "moving")`. So the last good rclone is **v1.65.0**, and it has been broken since January 2024 — long enough that "this is new" is the wrong instinct.

## Four things that follow, all measured

- **Only this one list is wrong.** `/core/stats` → `transferring` shows **one** entry (verified with a `core/bwlimit rate=250k` move sampled four times, GUI row count 1 throughout), because `transferMap.items` is `map[string]*Transfer` keyed by `tr.remote` — A and B collapse onto one key. The same keying is why the counters do not double either: `DoneTransferring()` guards `s.transfers++` on `existed`, so one moved file reads `transfers: 1`, `totalTransfers: 1`, `bytes: 2000000`. The current-transfers table and `getRunningJobCost()` need nothing.
- **A copy, and a move rclone does server-side, are already right** — a copy never enters `move()`, and a successful server-side move skips the `Copy()` step, so each gives one entry. That is why this looks intermittent: it needs two *different* remotes, which is enough on its own, since `SameConfig()` compares remote names and `--server-side-across-configs` is off by default, so even two `local` remotes on one filesystem take the copy fallback.
- **`/sync/move` on a folder has the identical shape** — 2 surviving entries per file, measured on a 3-file folder — so the one collapse covers folder moves too.
- `accounting.MaxCompletedTransfers` defaults to 100 and `PruneTransfers()` culls past `100 + --transfers`, so the phantoms also halve the useful history for moves. That cap is **per stats group, not global**, and the GUI asks for every group at once — see `.claude/notes/completed-transfers-table.md`, and don't read this bullet as a bound on how long the list can get.

## Both obvious narrower fixes are wrong, so don't retry either

**`bytes === 0`** (which used to sit commented out in `updateCompletedTransfers()` as `//|| completedTransfers[t]["bytes"] === 0`) fails three ways: a server-side move's only entry has `bytes: 0`, so same-remote moves would vanish entirely; an **empty file has `bytes: 0` on both A and B**, so it would vanish too; and a failed move has `bytes: 0` on both.

**"Keep whichever entry has the most bytes"** fails differently and worse — when the copy succeeds but deleting the source does not (verified with a read-only source directory), **A carries the error and B is clean**, so picking B by byte count shows a green `OK` for a move that left the source behind.

What does hold everywhere: within one job, `group` + `name` names exactly one operation, so the collapse keys on those, keeps the first entry and folds in any error from the ones it drops — which is also why it needs the checks removed first, C sharing both fields with A and B and not always coming last.

## Verification

Over the DevTools protocol against a live `rcd` with real mouse clicks, two `local` remotes and `--transfers 3`: a cross-remote file move → 1 row `OK` (raw response still carrying 2); a copy → 1 row; an empty file move → 1 row `0 B`; a 3-file folder move → exactly 3 rows; a same-remote move → 1 row (the raw response having only 1 entry, the case `bytes === 0` would have erased); a copy-ok/delete-fails move → 1 row **`error`** (the case the byte-count rule would have called `OK`); a copy-fails move → 1 row `error`; four files plus a 3-file folder queued together → exactly 7 rows, one per file; and the `(X)` count equal to the rendered row count throughout. Console empty.
