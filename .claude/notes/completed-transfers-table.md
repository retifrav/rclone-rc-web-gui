# The completed transfers table — measurements behind the reconcile

Supporting notes for **The completed transfers table is reconciled, not rebuilt** section of `CLAUDE.md`.

## A refresh that brings nothing new does zero DOM writes

Verified with a `MutationObserver` on the `<tbody>`: 0 added, 0 removed, 0 batches across four consecutive ticks with 1500 rows on screen.

## The list is not capped at 100, and rclone's own documentation says it is

`core/transferred`'s help text reads *"Note only the last 100 completed transfers are returned"*, which is true only when a `group` is passed; with no group the endpoint answers `groups.sum(ctx).Transferred()`, the sum over **every** stats group, each pruned separately past `100 + --transfers`. Every rc job is a group of its own, so the total is roughly that per job ever run, up to `--max-stats-groups` (default 1000) groups — and no flag caps the sum.

Measured: 25 `/sync/copy` jobs × 60 files → **1500 entries, 684 KB of JSON per poll**, and a single 150-file job settles at exactly **104** entries (`100 + --transfers 4`, 46 pruned).

So a reader checking upstream docs will conclude the table cannot grow and that conclusion is wrong; re-derive it with 25 jobs rather than trusting either the doc line or this paragraph.

## Measured cost of the rebuild this replaced

Median of 5 in Chromium, including the forced layout: 9 ms at 120 rows, 22 ms at 500, **86 ms at 1500** (76 ms re-measured in the real GUI against the real stylesheet, one sample as high as 115 ms) and **243 ms at 5000** — a quarter of a second of blocked main thread every 2 seconds, and the interval goes down to 1 s. The reconcile answers the same two sizes in **0.7 ms and 3.5 ms**.

`JSON.parse` is *not* the bottleneck and never was (0.74 ms at 1500, 2.24 ms at 5000), so don't go looking at the parsing.

What the reconcile does **not** help is the payload itself: 684 KB every tick is rclone's side, `core/transferred` has no "since" parameter, and narrowing it would mean one request per group off `core/group-list`, which is worse. The one-off fill after a page reload still costs the full rebuild price.

## One user-visible defect it fixes, and one it does not

The second is worth knowing because it looks like it should.

Rebuilding dropped any **text selection** inside the table on every refresh, so a file name could not be selected and copied out of the list while polling was on (verified on the real 1500-row table with the exact old shape: `"f36.bin"` → `""`).

**Scroll position was *not* lost**, despite `#completedTransfers` being a `max-height: 700px; overflow-y: auto` scroll container: the wipe and the refill happen in one task with no layout in between, so the browser never lays the empty table out and `scrollTop` is never clamped — measured 900 → 900 across the old rebuild. A synthetic test that reads `scrollTop` between the wipe and the refill *does* show it collapse to 0, which is the trap: that read forces a layout the real code path never performs. Scroll only moves when the listing genuinely gets shorter (measured 30000 → 524 when 1500 rows became 50), and that happens under the reconcile too.

## Why the key separator is `"\u0000"` and not `"\n"`

It has to be a character that cannot occur in **`group`** — what is in `name` is irrelevant, since the first separator always ends the group — and a newline does not qualify. rclone takes a `_group` from whoever submits the job and accepts a newline in it silently (verified: `core/group-list` reports a group named `job/1\nevil`), and `/core/transferred` answers for *every* group, other rc clients' included, so `{"job/1", "evil\nx.bin"}` and `{"job/1\nevil", "x.bin"}` are two different transfers with one identical key.

Neither half is reachable from this GUI — it never sends `_group`, and the local backend encodes control characters in names, so a real newline in a file name arrives as `␊` (verified, and `--local-encoding None` does *not* turn that off, so the encoding is not the configurable one) — but a backend whose default encoding lacks `Control`, and S3's is `Slash,InvalidUtf8,Dot`, passes a raw newline straight into `name`.

A NUL closes it at no cost: rclone will take one in a `_group` too, but no POSIX or Windows file name can contain one, so the `name` half of such a pair cannot exist. `getCompletedTransferSignature()` uses NUL for the same reason, `error` being an arbitrary rclone string, and a signature two transfers can share is a row that never gets updated.

Note a file name *can* legitimately hold a newline — don't "simplify" this on the assumption that it cannot; `find -type f | wc -l` over such a tree reports 5 for 3 files, which is the same hazard one layer down.

## Why each row carries a `signature`

Not defensiveness — it is the only thing standing between the table and a permanently wrong outcome, for two reasons:

- A move that fell back to a copy arrives as two entries, and it is the **outer** one that carries the error when the copy succeeded but deleting the source did not. It becomes done a moment after the inner one, so a refresh can catch the inner one alone and render a green `OK` that the next refresh has to turn into `error`. Verified deterministically by intercepting `/core/transferred` and answering the clean entry alone, then both: the row flips `OK`/green → `error`/red with exactly **1 removed and 1 added** and the count still 1, and feeding the identical payload again is a complete no-op with the `<tr>` still the same object. Timing this against a real move is not an option — the two entries are ~30 µs apart, which is why the canned response is the method here.
- rclone hands out job ids from 1 again after a restart, so `job/4` plus the same file name can name an entirely different transfer, and `/core/transferred` carries no `executeId` to tell the launches apart with (unlike `/job/list`, which is why the queue can compare one). A differing `started_at` is what rebuilds such a row instead of leaving the previous run's timestamp on screen.

The signature deliberately holds `started_at` even though the two duplicate entries are only ~30 µs apart and so render the same second: when the collapse's kept entry flips from the inner to the outer one, that row is rebuilt once. One row, once, and in exchange the row provably matches the current entry in every field it shows rather than in one special-cased field.

## Why the tail-trim is load-bearing

`index.html` ships a placeholder `<tr>` of four `-` cells inside `#completedTransfersBody`; the old blanket wipe disposed of it as a side effect. It has no key in the `Map`, so every real row is inserted *in front of* it and without the trim it would sit at the bottom of the table for the life of the page. The trim is safe because after the removal pass every tracked row has been placed at or before `node`, so the tail can only hold untracked nodes.

## The walk self-heals

Verified rather than assumed: rows swapped out behind its back (the test replaced all 1500 with clones) are all re-attached in order on the next tick and the leftovers trimmed, ending on a cell-by-cell match. In normal operation the move branch never fires at all — new entries sort to the top and the existing rows keep their relative order, so realistic growth measured `built: 4, moved: 0, removed: 0`.

The removal pass is **surgical**: resetting one group's stats in the *middle* of the sort order removed exactly its 60 rows (`removed: 60, added: 0`, one batch) and left a cell-by-cell match against a from-scratch render.

## A timestamp checkpoint is the obvious alternative and it silently loses records

Don't retry it. The idea is to keep the newest `started_at` seen and treat anything newer as new. Two measured facts kill it.

`/core/transferred` returns only *completed* transfers and the array is in **start** order: a copy of one 40 MB file plus three tiny ones at `--transfers 4` throttled to 2 MiB/s answered with the three tiny entries alone for 15+ seconds while `BIG.bin` sat in `/core/stats` → `transferring`. When `BIG.bin` finally finished it appeared at **array index 0** with `started_at` *earlier than all three* tiny entries (…896 against …901/…978/…011) and `completed_at` 17 s later. A checkpoint taken from the tiny files would therefore have skipped it **permanently** — and this is the normal case, not an edge one: it needs only `--transfers > 1` and files of differing size.

The same fact rules out "take the tail of the array", since a newly-completed entry can appear anywhere in it. A `completed_at` checkpoint would mostly work but rests on nanosecond distinctness and clock monotonicity, and still cannot express a row disappearing on a prune or an outcome changing on a later poll.

## Why the current transfers table stays rebuilding

It is bounded by `--transfers` plus the queue, so a handful of rows, and every cell it shows — speed, the `<progress>` value, the queue rows — changes on every tick anyway, so there is nothing to reuse. Its rows also carry per-row cancel listeners, where the completed table's carry none, which is what makes node reuse free of listener bookkeeping over here.

## Verification

Over the DevTools protocol against a live `rcd`, console empty throughout: the empty state on load (block hidden, `(X)` 0, placeholder trimmed); 1500 rows with `(X)` equal to the row count and **zero mismatches on all 1500 rows compared cell by cell against a from-scratch render**; zero DOM writes across four steady ticks; scroll position and a text selection both surviving several ticks; a 150-file job pruned by rclone to 104 with the count still matching; one group's stats reset removing exactly its 60 rows; an `rcd` restart leaving 0 rows, `(X)` 0 and the block hidden with no stale rows; the outcome-flip and no-op payloads above; and the six collapse cases re-run on this render path — cross-remote file move 3 raw entries → 1 row `OK`, copy 1 → 1, empty-file move 3 → 1 row `0 B`, same-remote move 1 → 1, 3-file folder move 9 → exactly 3, and copy-ok/delete-fails 3 → 1 row **`error`** in red.
