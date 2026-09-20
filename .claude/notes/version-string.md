# The GUI version string — the five release guards

Supporting notes for the **Version string** section of `CLAUDE.md`.

## Why the README uses bare `sed` and not `$sedCommand`

`docker/README.md`'s build section reads the version back with `sed -n 's/^const guiVersion: string = "\(.*\)";$/\1/p' ../src/main.ts` — **bare `sed`, deliberately**, because that file is instructions for whoever builds the image and `gsed` exists only where Homebrew put it, so a Linux reader following the README would get `command not found`.

The expression uses nothing GNU-specific (POSIX BRE grouping, `-n …p`), so every host's stock `sed` runs it. That is **not** a concession to BSD `sed` and shouldn't be recorded as one — the release machine has `gsed` installed anyway — it is simply plain `sed` syntax, and `-nE` with `(.*)` would be equally portable (BSD `sed` has `-E` too) if the backslashes ever grate.

What does genuinely need GNU `sed` is *only* the **in-place** edit in the prepare script: `sed -i` takes no suffix argument there, while BSD `sed -i` requires one and would eat the following argument as the suffix. That single construct is the whole justification for the `gsed` branch, and it is why every call in that script goes through `$sedCommand`. So don't reach for `$sedCommand` in the README, and don't delete the detection block on the grounds that the extractions don't need it.

## Why `RCLONE_VER` is derived from the `Dockerfile` instead

That asymmetry is deliberate: rclone's version has a real `ARG RCLONE_VERSION_VALUE="v<version>"` default in the `Dockerfile` — **that line is where the bundled rclone version lives** — so the extraction is `sed -n 's/^ARG RCLONE_VERSION_VALUE="v\(.*\)"$/\1/p' ./Dockerfile` and strips the `v` the tag does not carry.

The `--build-arg RCLONE_VERSION_VALUE="v$RCLONE_VER"` that then passes it straight back is a tautology, and it is kept on purpose: it is what lets an `export RCLONE_VER='…'` by hand after those lines still move the tag *and* the arg together.

`GUI_VERSION_VALUE` gets no such default, because the GUI version lives in `guiVersion` in `src/main.ts` and a default spelled out in the `Dockerfile` would silently drift from it.

## What the five guards are worth

They are checked in this order, exiting 4 through 8.

**The tag check is the strongest** — date-independent and with no false positives, since a `v<version>` that already exists means the version was not bumped, full stop. Its one requirement is that the previous release was tagged locally, which holds on the release machine but *not* in the dev container, where the SSH remote is unreachable and `git describe` stops at `v2026.7.31` while `2026.8.2` and `2026.9.12` have shipped.

**The committed check catches a genuinely invisible failure**: `tsc` runs *above* the `git stash`, so the archive is built from the working tree while the tag will point at a commit that may still hold the old version — the image would ship a version that neither the release commit nor its tag have, and that was the exact state of this repo when the check was written.

**The date check is the weakest of the five**, a bump legitimately being made a day before publishing, so it is the only one with an escape hatch (`GUI_VERSION_DATE_CHECK=0`) rather than being a plain refusal.

**The format check exists because the tags and the label are unpadded**, so `2026.09.13` would otherwise produce a `v2026.09.13` next to `v2026.9.12` and a label that sorts differently from every other release.

## Four details of that block

It sits **below** the `sed` and `tsc` detection — so `$sedCommand` is already resolved and the exit codes stay in ascending order — and **above** the `tsc` call and the stash, so a failure costs nothing and cannot leave a half-prepared tree.

Today's date is `"$(date +%Y).$((10#$(date +%m))).$((10#$(date +%d)))"` and **not `date +%Y.%-m.%-d`**, because `%-` padding suppression is a glibc extension and the release machine is the macOS one (`10#` is what keeps `08`/`09` out of octal).

The format test is `grep -qE` and **not** bash's `[[ =~ ]]`, which would read more naturally next to the script's existing `[[ ]]` usage, because macOS ships bash 3.2 and only 5.2 could be verified in the dev container.

The script's closing line reports the version that went into the archive, which is informational only now that the README derives the same value rather than being copied from that output.

## Verification

All five branches were verified in a throwaway git repo (pass; uncommitted bump → 7; existing tag → 6; `2026.09.13` → 5; yesterday's date → 8, and 0 again with the override; missing line → 4), never by running the real script against the working tree, which would have unstaged the staged changes on its `git stash pop`.

## Two things the guards deliberately do not cover

**Two releases on the same day** have no room in a `YYYY.M.D` scheme at all: the tag check correctly refuses the second one, and the answer is a decision about the scheme (`2026.9.13.1`), not more script.

The checks are **version-specific** — other uncommitted changes, in `src/main.ts` or anywhere else, are still compiled into the archive, which is the script's own long-standing stash-and-restore design rather than an oversight.

## The other version literals in `docker/README.md`

Only the `export GUI_VER=` line was ever functional. The three remaining literals in that file (the `cosign verify` example, the `docker image inspect` label dump, and the `docker-compose.yaml` snippet) are illustrative prose with their own historical context, and nothing derives them.

## Two rejected alternatives

A `--bump` flag writing today's date into `src/main.ts`: it would have to run above the `git stash`, or the `git checkout -- .` at the end reverts it — and the version is a deliberate choice of publishing date, not something to have written for you.

A git hook: not versioned, and the author works across three machines.
