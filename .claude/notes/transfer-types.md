# Transfer types — why the progress fields are optional

Supporting notes for the **Transfer types** section of `CLAUDE.md`.

## Why there is a type per endpoint and not one shared `rcTransfer`

The older shared type declared the union of both endpoints' fields as ten required ones, which made every field look always-available — reading one in the wrong handler gave `undefined` at runtime with no type error.

## Why `bytes`/`speed`/`percentage` are optional on `rcTransferring`

Not defensiveness — it is the shape rclone actually sends. `transferMap.rcStats()` starts each entry from `tr.rcStats()`, which sets only `name`/`size`/`srcFs`/`dstFs`, and merges the progress in afterwards **only** `if acc := progress.get(tr.remote); acc != nil`. So a transfer that is registered but not yet moving data (opening the source, hashing, waiting for a transfer slot) arrives as `name`/`size`/`group` alone.

It bit for real: `updateCurrentTransfers()` assigned the missing `percentage` straight to `<progress>.value`, which is a `TypeError` ("value being assigned is not a finite floating-point value" in Firefox, "The provided double value is non-finite" in Chromium — both throw, and `NaN` throws the same way), killing that whole refresh. Submitting several queue items per tick makes landing a poll inside that window far likelier, which is how it surfaced.

Note `percentage: 0` *is* sent for a transfer that has an accounting object and simply has not moved a byte yet — 0 and absent are different states, and only absence is the problem.

## That window is not reproducible local-to-local

So don't take a clean run as evidence the guards are unnecessary. Attempted deliberately — eight 3MB files copied at `Transfers: 8`, `/core/stats` polled as fast as curl would go — and every sample had all eight entries complete with `bytes`/`speed`/`percentage`, because a local source attaches the accounting object immediately.

What the run *does* confirm is that the entries carry the three fields once accounting exists, and the conditional merge quoted above is still the shape of rclone's own code. Reproducing the absence wants a source that is slow to open (a real cloud remote, or a throttled `rclone serve`), which is also the environment it was first hit in.

## The redundant half of the second guard in `updateCurrentTransfers()`

The `currentTransfers !== undefined` half is redundant at runtime — `addQueueElementsOnly` is only left `false` when the first guard found a non-empty array — but the flag hides that from the compiler, so it has to be spelled out.

## Fields nothing reads

`rcStats.lastError` is optional (sent only once something has failed) and `rcStats.eta` is `number | null` (`null`, not 0, while there is nothing to estimate). Nothing reads either — `rcStats`'s only consumer reads `transferring` alone.

For the fields rclone sends that no `rc*` type mentions at all, see `.claude/notes/rc-api-verification.md`.
