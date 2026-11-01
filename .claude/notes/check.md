# The Check operation — measurements

Supporting notes for the **Check operation** section of `CLAUDE.md`. Measured on 2026-10-31 against the container's rclone (v1.75.2 at the time), with a throwaway tree of 4005 files: two `alias` remotes over a `src/` and a `dst/` where some files were missing, one differed in size, and one had the same size and modification time but different content. Re-run rather than trust; the shapes are what matter.

## Why there is no checksum probing

The request was to probe each remote's checksum support (or read SFTP's `shell_type`/`md5sum_command`/`sha1sum_command` via the rc API) and fall back to size-only. None of that is needed, because rclone does it itself:

- `operations/check` intersects the two remotes' hash sets and, when that is empty, compares sizes only without any error. The result says `hashType: "none"` (measured with a `:chunker,remote=…,hash_type=none:` destination, whose `operations/fsinfo` reports `Hashes: []`).
- For SFTP, rclone autodetects the remote shell and the `md5sum`/`sha1sum` commands on first use and stores them in the config, and the remote's hash set (`operations/fsinfo` → `Hashes`) already reflects them. `config/get` would add nothing, and it returns the remote's entire config section, credentials included.

The real concern is **cost, not support**: the local backend has `SlowHash: true`, so a checksum check reads every byte of every file on both sides (SFTP does the same on the server). Hence a user-facing switch, off by default, rather than an automatic choice.

## `SizeOnly` and `hashType`

`_config: {"SizeOnly": true}` is honoured by `operations/check`: a same-size, different-content pair is reported in `differ` without it and passes with it. But **`hashType` is `md5` in both cases**, because rclone computes the common hash type before it looks at `SizeOnly`, so the result alone cannot say whether hashes were compared. The GUI therefore keeps its own `sizeOnly` per check. It sends `SizeOnly: false` explicitly too, so that an `rcd` started with `--size-only` cannot silently turn the checksums off.

## `MaxDepth`, and why filters are left alone

Measured on 2026-11-01 (rclone v1.75.2) over HTTP against a real `rcd --max-depth 1 --exclude '*.log'`, with a tree where one file was missing on the destination three folders down (`a/b/c/deep.txt`), one differed two folders down (`a/b/two.txt`), and an uncopied `skipped.log` sat at the top:

- `operations/check` is recursive by default, but the global `--max-depth` limits it, and then the result is **`success: true`, `status: "OK"`**, with `match: ["top.txt"]` only. With `_config: {"MaxDepth": -1}` the same `rcd` reported `missingOnDst: ["a/b/c/deep.txt"]` and `differ: ["a/b/two.txt"]`, so the per-job override works.
- `/options/get` reports the flag as `main.MaxDepth` (`-1` when unset, `1` here), and `/options/set` changes it at runtime (set to `2`, then read back as `2`). `/job/status` of a finished check carries `differ`, `error`, `hashType`, `missingOnDst`, `missingOnSrc`, `status` and `success` and nothing about depth. A note in the results dialog was considered and rejected for those reasons: it would need the value recorded at submission (a read when the dialog opens can be stale), and it would sit behind a green `OK` row that nobody has a reason to click.
- `skipped.log` stayed unreported even with `MaxDepth: -1`, as `--exclude` still applied. The check deliberately leaves filters alone: overriding them would list every excluded file as missing, and folder copies honour them too, so a check that honours them agrees with what was copied.
- Under `--max-depth 1` folder copies are still limited: `sync/copy` of the same source copied only `top.txt` (loopback). So "Copy X, then Check X" on such an `rcd` reports the deeper files as missing, which is true. "Copy the failed files again" then fixes it, since `operations/copyfile` of `a/b/c/deep.txt` (with `IgnoreTimes: true`, like the requeued copies) worked under the same `--max-depth 1`.

## Result shapes (`/job/status` of an async check)

| Case | job `error` | job `success` | `output` |
|---|---|---|---|
| differences found | `""` | `true` | `success: false`, `status: "3 differences found"`, lists filled |
| all fine | `""` | `true` | `success: true`, `status: "OK"`, lists `[]` |
| `srcFs` folder does not exist | `""` | `true` | `success: false`, `status: "directory not found"`, lists `[]` |
| cancelled via `/job/stop` | `""` | `true` | `success: false`, `status: "context canceled"`, **partial lists** (an interrupted file can land in `error`) |
| unknown remote | `didn't find section in config file ("nope")` | `false` | `{}` |

So only a failed *call* lacks a result, and `output` may be read only when `error === ""`. The lists (`missingOnDst`, `differ`, `error`, `missingOnSrc`) are `[]` when empty, while the ones not asked for (`match`, `combined`) are `null`. `/job/status` carries a `group` (`"job/N"`) but **no `progress` field**, so progress needs the job's own `/core/stats`.

A `srcFs` pointing at a file is a synchronous 500, `is a file not a directory`. That is why the check works on the open folders and not on the selection: a ticked file would need a `_filter.IncludeRule` on its parent folder, which does work (`{"IncludeRule": ["/README.md"]}` narrowed a check to one file) but would need rclone glob escaping of the name.

## Progress counters, and why there is no percentage

From `/core/stats` with `group: "job/N"` while a 4005-file check ran, and at the end:

- `totalChecks` is `checks` plus the ones in flight (163 → 164, then 4000 → 4000; during a checksum check of six huge files it read 4011 = 4005 + 6), so it is **not** a total. rclone discovers the files as it lists them and never knows the count in advance.
- `listed` is not one either. In a 14 s checksum check of a source of 4014 files in 46 folders, it reached its final 8117 within 1.5 s and stayed there: 4014 + 46 source entries plus 4057 destination entries. It counts both sides and the folders, so destination-only files and the folder count make it useless as a total of source files. On a slow cloud remote, listing and checking interleave as well, so it would keep growing.
- At the end: `checks` 4000 (every pair, the differing ones included), `errors` 7 (5 missing + 2 differing), and `/operations/size` of the source counted 4005. So `checks + missing` is exactly the source, while `checks + errors` overshoots by the number of differing files (4007). `checks` alone would undercount by every missing file, which is the common failure after a broken copy, so the counter shows `checks + errors`.
- A check is counted only when it completes, so a few huge files sit at 0 until they all finish together (six 10 GB sparse files hashed in parallel: 0 for ~15 s, then done).

The first version did show `checks + errors` against a `/operations/size` total, fired alongside the running check. It was removed as overhead that bought an imprecise percentage:

- the walk is a whole extra listing of the source, and for a size-only check listing is the entire cost of the check (both sides), so that is about half as much work again — on a cloud remote, half as many API calls again;
- on a quick check the total often arrived after the check had already finished (the barrier run showed `- | 0 files` first);
- and the percentage was approximate anyway: capped to hide the differing files' overshoot, and stuck at `0/6` for the big-file case above.

So the running row has an indeterminate `<progress>` (no `value` at all, `position` −1) and `N files checked in m:ss`, both from what the poll already fetches plus the GUI's own `startedAt`.
- In `/core/transferred` every file check is an entry with `checked: true`, `what: "checking"`. A 4000-file check left **102** entries in its group, which is past the 100 the trimmed-list hint tests for, so the hint has to skip check jobs' groups.

## Expiry and restarts

rclone removes a finished job after `--rc-job-expire-duration` (default 60 s, checked every `--rc-job-expire-interval`, default 10 s). Asking about it after that is a 500 `{"error": "job not found"}`. With `--rc-job-expire-duration 5s` and the GUI frozen (auto-refresh off) for 30 s, `/job/list` no longer had the check, yet the GUI had already collected its result, because `pollChecks()` runs independently of the refresh. After an rcd restart mid-check, the old job id was `job not found` on the new instance; the check finished as "no result" after three polls (~15 s). If the id had existed on the new instance, the `executeId` comparison would have caught it instead.

## Copying the failed files again

- `operations/copyfile` with `srcRemote`/`dstRemote` = `sub/deeper/missing-deep.txt` and `dstFs` = the destination root **creates `sub/deeper/`** on the way, so the relative paths from the check result can be used as they are.
- Without `_config.IgnoreTimes` a destination file with the same size and modification time but different content is **skipped** (it still read `BBBB` afterwards). With it, the file is copied (`AAAA`). A checksum check finds exactly that kind of file, so the requeued copies carry `IgnoreTimes: true`.

## Barrier, verified

With `/core/bwlimit` at 1 MiB/s and `--transfers 2`, three 3 MB files were queued for copying and a check of the same folders right behind them. Two copies ran, then the third. The check stayed queued until the third had finished, started about three seconds later (the next queue tick), and reported OK.
