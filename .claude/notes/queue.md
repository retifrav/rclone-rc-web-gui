# The client-side queue — the measurements behind the slot accounting

Supporting notes for the **Client-side queue** section of `CLAUDE.md`.

## Why the allowance is a store and not the slider

`getActiveQueueSlots()` reads `rcloneTransfers`, an exported `let` in `settings-ui.ts` holding the number rclone last *confirmed*. It is deliberately not mirrored into `settings.userSettings` (that object is the hand-edited config file, and this number lives in rclone), but it is mirrored *somewhere*, because the slider could not serve as the store.

The slider follows the knob while rclone is only told on `change`, so through a drag the two disagree, and `processQueue()` is driven by a timer and so has no settled moment to be called at the way the header indicators did. A tick landing in that window budgeted the whole tick from a number the user had not settled on, and handed a folder job its `_config.Transfers` out of it — measured before the fix, with rclone on 2 and the knob *held* at 20, a 12-file folder went out with `"_config":{"Transfers":12}`; after it, `2`.

The window was never only the drag either: it covered the `/options/set` round trip too, and indefinitely after one that failed.

## Why a 200 from `/options/set` confirms nothing

rclone documents that endpoint as silently ignoring an option it does not know, and warns that not every option takes effect when changed that way. `Transfers: 0` or `-3` is answered 200 while rclone ends up on 1 — measured, both values, both times a plain `HTTP 200` with `options/get` then reporting `1`.

So `setMaximumAllowedRcloneTransfers()` re-reads **unconditionally** rather than only on failure. That costs one extra `/options/get` per commit — on release, never per pixel, but note a range input fires `change` on every arrow keypress, so held auto-repeat pays one set *and* one get per step.

## Why it is an exported `let` and not a getter

So that the compiler holds the single writer: assigning to it from another module is `TS2632: Cannot assign to 'rcloneTransfers' because it is an import` (verified). A getter would also have sat one word from `getMaximumAllowedRcloneTransfers()` while being an entirely different kind of thing.

Live ES-module bindings are what make the named import see each update, which is safe here for the same reason the four import cycles are: nothing in `src/` reads across modules at module-evaluation time.

## Why the fallback is 1, and why the `NaN` guard went away

Its initialiser is a literal `1`, agreeing with the markup's `value="1"`, the `<output>`'s `1` and `gui.css`'s static green `accent-color` — so a failed `/options/get` at load leaves the queue serial and the UI honest (verified by holding that request open for a whole session: slider 1, both icons dark, separator hidden, and a queued folder submitted with `_config.Transfers: 1` rather than `NaN` or `undefined`).

The `NaN` half of the old guard went with the `parseInt`: `JSON.parse` cannot produce a `NaN`, and a response missing `Transfers` throws at the slider assignment that sits *above* the store write, so the store cannot take a bad value.

## Why the count is skipped entirely at an allowance of 1

It cannot change anything: every item is worth one slot whatever is in it, nothing is ever stepped over (the head always fits when a slot is free), and the queue is already a plain one-at-a-time affair. Verified — `--transfers 1` produces no `/operations/size` call whatsoever.

Items queued in that state keep `fileCount` at `-1`, and `countQueuedFolderFiles()` goes and gets the counts when rclone confirms a **different** allowance — from any of the three paths that reach the `/options/get` callback (load, the settings tab's `onShow`, the re-read after a set), and gated on the value having actually changed.

That gate is not optional now that the call lives there instead of in the slider's `change` listener: the callback runs on every settings-tab open, and an item whose `/operations/size` is merely still *in flight* also has `fileCount` at `-1`, so counting unconditionally would fire another full recursive walk of every queued folder on every tab open. Verified: five open/close cycles with two folders queued and the allowance unchanged give five `/options/get` and **zero** `/operations/size`, while a `--transfers` changed behind the GUI's back and picked up by `onShow` gives exactly one per uncounted folder — a case the old `change`-listener call site could not cover at all.

The rest of the machinery is deliberately *not* special-cased for 1: `/job/list` is what serializes the queue in the first place, and the per-job `/core/stats` still earns its keep by letting the next item start while a job is only finishing off.

## Why an uncounted folder waits for the whole allowance

Not merely the slots that happen to be free: `_config.Transfers` is fixed for the life of a job and cannot be raised later, so a folder started on one spare slot crawls along on that one slot forever.

That was measured — a 12-file folder let in on a single spare slot stayed at one transfer for its whole life, and for a 2-file-folder-then-12-file-folder queue at `--transfers 3` it works out about 12 time units against 5 for making the second folder wait.

## What `/operations/size` costs

It is a full recursive traversal server-side (a small `{count, bytes}` answer, but the walk still happens, so a big cloud folder gets walked once here and again by the copy job), and queueing N folders at once fires N of these straight away. Nothing else can supply the number: rclone itself only learns a folder's contents after the job is running and has listed the source.

## Why `/job/list` and not the `transferring` counter

The obvious gate is `currentTransfersCount`, and it is wrong. Verified: while `/sync/copy` re-syncs an already-synced folder, `/core/stats` for that job's group carries **neither a `transferring` nor a `checking` key at all** for the job's whole life, even as `checks` climbs from 0 to the full file count (re-measured on a 4000-file folder forced onto a single checker via `_config: {"Checkers": 1}`, polled every 250ms — `has("transferring")` and `has("checking")` were both `false` on every sample, including one caught at `checks: 0` with the job still running).

Note `CLAUDE.md` used to say those two arrive as `[]`, which understated it: they are omitted outright, exactly as `transferring` is when rclone is idle, so no `.length` can even be reached.

A folder job therefore looks idle for as long as it takes to walk the source, and every tick would submit another item next to it. That is not theoretical — with the counter as the gate, queueing 2 folders and 2 files at `--transfers 3` put **7** files in flight (3 + 3 + 1): all three items went out on one tick because the counter read 0, and each folder then used its own full allowance. Adding `checking.length` does not help, as it is empty too.

## Why `Promise.all` replaced a countdown

The hand-rolled `awaitingAnswers--` countdown the callback contract could stall: a per-job `/core/stats` that never arrived never decremented it, so `submitFromQueue()` was not reached **at all** for that tick.

Measured A/B against the pre-change build with one per-job `/core/stats` failed by the DevTools protocol while a 6-file folder job held 6 of 8 transfers and two files sat queued: the old build slipped the submission by exactly one 5s tick (failure at t+4.2s, submission at t+9.2s), the new one submitted on the same tick (0.0s gap).

Each per-job request is given its own rejection handler returning **`getRunningJobCost(job, null)`**, so a request that never made it charges exactly what a non-200 already charges (the job keeps its whole allocation) and the `Promise.all` cannot be left hanging. Routing that through `getRunningJobCost()` rather than repeating `job.allocatedSlots` inline is deliberate: the two failure modes are then provably the same answer rather than coincidentally equal ones.

## The queue used to drain into an unreachable `rcd`

A failed `/core/stats` left the counter at its last value, and if that was `0` every tick submitted into nothing while the item had already been spliced off the front. Killing `rcd` right after queueing six items lost all six; the same test now loses none and the queue resumes when `rcd` comes back.

## Why the retry bound is not optional

An item rclone refuses is usually refused for good (a remote that is gone, a path that no longer exists), an unbounded retry would re-send it every 5s forever, and a *folder* item doing that holds every slot each time it is tried.

Two things to know here: a request that never arrived does **not** come through this path at all, because `requestRclone` rejects for that case and the adapter's empty rejection handler absorbs it without ever calling back; and because submissions carry `_async`, rclone answers 200 with a `jobid` even for a doomed operation and fails inside the job, so a submission-time rejection is mostly about auth and malformed requests rather than bad paths.

Known wrinkle, not worth machinery: when several items are rejected in the same tick they each `unshift` independently, so their order among themselves flips (two failures come back as `[second, first]`, and flip again on the next attempt).

## Why `removeFromQueue()` takes the item and not an index

The rows are only redrawn on a `/core/stats` poll while `submitFromQueue()` can splice several items out of the queue per tick, and from the middle of it rather than just the front now that it steps over items that do not fit, so an index captured at render time goes stale and would delete the wrong item.

## The GUI toggle that was dropped before shipping

An earlier draft had a `chbx-active-queue-slots-matches-allowed-transfers` checkbox to make the queue serial. `--transfers 1` already does exactly that and is the only control needed; don't reintroduce it.
