# What was verified against the rc API, and when

Supporting note for the **Build** section of `CLAUDE.md`. Everywhere in that file, "verified" or "measured" against the rc API means against the dev container's rclone at the time of writing, with no version pinned (the binary is updated by hand, so every literal recorded would go stale).

**Re-run the checks rather than trusting this page.** The things that go wrong are the incidental details of a shape, not the shape.

## Last full re-derivation: 2026-09-19

Against a `--rc-no-auth` `rcd` with a throwaway tree of 4000+ files.

Every *load-bearing* claim held: the 18 endpoints, the idle omission of `transferring`, `core/transferred` always sending `transferred`, `options/get` carrying `Transfers`, `options/set` answering 200 for a `Transfers` rclone then ignores, the `jobid`-as-string coercion, the `executeId` beside `jobid`, `runningIds` including the asking request, and every single MIME mapping.

**Four details were found wrong** and were corrected in `CLAUDE.md` and these notes at the time:

- `transferring`/`checking` are *omitted* from `/core/stats`, not `[]`, during a folder walk.
- In-flight transfer entries carry no `what`.
- The MIME lookup is two lists with an early return, not one flat five-path sequence.
- The folder-`Size` example values previously recorded were macOS/APFS-specific.

## Found later the same day

`/core/transferred` reports a single moved file **twice** when rclone falls back to a copy. That one was bisected across nine release binaries rather than only checked against the container's — see `.claude/notes/duplicate-transfers.md`.

## Added on 2026-10-31

`/operations/check` and `/job/status` (now 20 endpoints), measured for the Check operation — see `.claude/notes/check.md` for the result shapes, the progress counters (including why neither `totalChecks` nor `listed` is a total) and the job expiry.

## Checked against v1.76.0 on 2026-11-09

With a checksum-verified v1.76.0 binary in the scratchpad, the container itself still being on v1.75.2. All 20 endpoints from the `grep` are in its `rc/list`. Against v1.75.2 that registry lost the six `pluginsctl/*` endpoints (the old web GUI's plugin system, deleted along with `--rc-web-gui`) and gained `operations/getfile` and `operations/index`, none of which the GUI calls. `rcd --rc-web-gui` without a path exits 1 with `--rc-web-gui has been superseded by the 'rclone gui' command`. The whole GUI was then driven in Chromium through `rcd` with `login_token` and through `rclone gui` (see `.claude/notes/rclone-gui.md`), with every request answering 200.

Read off the v1.76.0 source rather than measured: **directory operations are now counted as checks** (`f998f5bb99`). Making, removing and updating directories show under `checking` and add to `checks` while they run, but are created with `NewCheckingTransferNoHistory` (`7fe402585e`) and so **never appear in `/core/transferred`**, which leaves the completed table, its row count and the per-job budget behind the trimmed-list hint untouched. The GUI reads `checking` nowhere and `checks` only for check jobs, which make no directories.

## Fields rclone sends that no `rc*` type mentions

Purely additive, so the structural reads are unaffected: `core/version` adds `osArch`/`osKernel`/`osVersion`, `core/stats` adds `listed`, four `serverSide*` counters (`serverSideCopies`, `serverSideCopyBytes`, `serverSideMoves`, `serverSideMoveBytes`) and, since v1.76.0, `updatedDirs`, and async submissions return `executeId` next to `jobid`.

The transfer entries are the one place worth spelling out, because the extras are **not the same on both endpoints**:

- **In flight** (`/core/stats` → `transferring[]`) adds `srcFs`, `dstFs`, `eta` and `speedAvg` — and **no `what`**, despite an earlier version of `CLAUDE.md` having claimed one.
- **Completed** (`/core/transferred` → `transferred[]`) adds `what` on every entry, but `srcFs`/`dstFs` only on *some*: measured, that array comes back with exactly two distinct key sets, the shorter one lacking both. The entries missing them are the check-only ones (`what: "checking"`, `checked: true`, `bytes: 0`), i.e. files a sync compared and did not copy. Nothing in `src/` reads any of the four — but don't add `srcFs`/`dstFs` to `rcTransferred` as required fields on the strength of one sample that happened to have them.
