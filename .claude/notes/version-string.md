# The GUI version string — the five release guards

Supporting notes for the **Version string** section of `CLAUDE.md`.

## Why every `sed` here is the stock one

`docker/README.md`'s build section reads the version back with `sed -n 's/^const guiVersion: string = "\(.*\)";$/\1/p' ../src/main.ts` — **bare `sed`, deliberately**, because that file is instructions for whoever builds the image and `gsed` exists only where Homebrew put it, so a Linux reader following the README would get `command not found`.

The expression uses nothing GNU-specific (POSIX BRE grouping, `-n …p`), so every host's stock `sed` runs it. That is **not** a concession to BSD `sed` and shouldn't be recorded as one — the release machine has `gsed` installed anyway — it is simply plain `sed` syntax, and `-nE` with `(.*)` would be equally portable (BSD `sed` has `-E` too) if the backslashes ever grate.

**Nothing in that script needs GNU `sed` any more, and the `gsed` detection is gone along with `$sedCommand`.** What used to need it was *only* the **in-place** edit of the settings path (`sed -i` takes no suffix argument there, while BSD `sed -i` requires one and would eat the following argument as the suffix) — that was the whole justification for the branch, and it is why every call in the script went through `$sedCommand`. That edit now happens inside the image instead, where `sed` is BusyBox's, so both remaining uses are the POSIX extractions above and the script runs on a stock macOS `sed`. The `which sed` check and its `exit 2` stay, `sed` still being required, so no exit code moved.

The reason to record this rather than just delete the paragraph: "*don't delete the detection block on the grounds that the extractions don't need it*" is what this note used to say, and it was right at the time. The premise changed, not the reasoning.

## Why `RCLONE_VER` is derived from the `Dockerfile` instead

That asymmetry is deliberate: rclone's version has a real `ARG RCLONE_VERSION_VALUE="v<version>"` default in the `Dockerfile` — **that line is where the bundled rclone version lives** — so the extraction is `sed -n 's/^ARG RCLONE_VERSION_VALUE="v\(.*\)"$/\1/p' ./Dockerfile` and strips the `v` the tag does not carry.

The `--build-arg RCLONE_VERSION_VALUE="v$RCLONE_VER"` that then passes it straight back is a tautology, and it is kept on purpose: it is what lets an `export RCLONE_VER='…'` by hand after those lines still move the tag *and* the arg together.

`GUI_VERSION_VALUE` gets no such default, because the GUI version lives in `guiVersion` in `src/main.ts` and a default spelled out in the `Dockerfile` would silently drift from it.

## What the five guards are worth

They are checked in this order, exiting 4 through 8.

**The tag check is the strongest** — date-independent and with no false positives, since a `v<version>` that already exists means the version was not bumped, full stop. Its one requirement is that the previous release was tagged locally, which holds on the release machine but cannot be assumed in the dev container, where the SSH remote is unreachable and tags arrive only from the host: `git describe` once stopped at `v2026.7.31` while two later releases had shipped, and on 2026-11-01 it reached `v2026.10.10` with `v2026.8.2` and `v2026.9.12` still absent.

**The committed check catches a genuinely invisible failure**: the archive is built from the working tree while the tag will point at a commit that may still hold the old version — the image would ship a version that neither the release commit nor its tag have, and that was the exact state of this repo when the check was written. That reasoning used to be phrased as "`tsc` runs *above* the `git stash`", which was a more roundabout way of saying the same thing and stopped being literally true when the stash went away; the check itself is untouched and is worth exactly as much as before.

**The date check is the weakest of the five**, a bump legitimately being made a day before publishing, so it is the only one with an escape hatch of its own (`--skip-date-check`, formerly `GUI_VERSION_DATE_CHECK=0`) rather than being a plain refusal. `--dev` skips it as well, but only together with the tag and commit checks (see the dev mode section).

**The format check exists because the tags and the label are unpadded**, so `2026.09.13` would otherwise produce a `v2026.09.13` next to `v2026.9.12` and a label that sorts differently from every other release.

## Four details of that block

It sits **below** the `sed` and `tsc` detection — so the exit codes stay in ascending order — and **above** the `tsc` call, so a failure costs nothing and cannot leave a half-prepared tree. The one exit code out of that order is 9, the unknown-argument refusal: it comes before everything else, since the arguments decide what the rest of the script does, and it took the next free number rather than renumbering the eight that are already documented.

Today's date is `"$(date +%Y).$((10#$(date +%m))).$((10#$(date +%d)))"` and **not `date +%Y.%-m.%-d`**, because `%-` padding suppression is a glibc extension and the release machine is the macOS one (`10#` is what keeps `08`/`09` out of octal).

The format test is `grep -qE` and **not** bash's `[[ =~ ]]`, which would read more naturally next to the script's existing `[[ ]]` usage, because macOS ships bash 3.2 and only 5.2 could be verified in the dev container.

The script's closing line reports the version that went into the archive, which is informational only now that the README derives the same value rather than being copied from that output.

## Dev mode: `-d`/`--dev`

For an image meant only for running locally, which is not a release. It was first proposed as `--skip-version-check-in-git`, skipping the commit check alone, and that would not have been enough: on 2026-11-01 `src/main.ts` held `2026.10.10` and `v2026.10.10` was tagged, so a plain run exited 6 and never got as far as the commit check (measured). Between releases that is the normal state, and a version bumped on an earlier day trips the date check as well. So `--dev` skips **the three checks that ask whether this is a release** — tag, commit and date (6, 7, 8) — and keeps the extraction and the format (4, 5), which a dev build still needs: the README's `GUI_VER` line is the same extraction, and the image tag is built from its value.

Three details:

- The three checks sit in the `else` of one `if [ "$devBuild" -eq 1 ]` rather than each getting an extra `&&` like the date check's override, so the skipped set is visible in one place and a dev build runs no `git` at all (checks 6 and 7 being the script's only `git` calls).
- The arguments are a `for`/`case` loop and not `getopts`, which takes short options only, while `--dev` is the spelling the README uses. With a single option there is nothing to bundle, so `-dx` is simply an unknown argument.
- `--skip-date-check` is not folded into it: a release published the day after its bump still wants the tag and commit checks. The two together are redundant but harmless.

What a dev build does **not** change is the version itself: the footer and `org.opencontainers.image.version` show the last release's version, and `VCS_REF` names `HEAD` even when the tree is dirty. That is why the script ends a dev build with a `[WARNING]`, and why the README has such an image tagged `:dev` only — with the release build's two `--tag` lines it would take over the local `rclone_…-gui_<version>` and `latest` tags of the release it is not.

Building an **existing release** from its tag also needs `--dev`, the tag existing by definition, and that works only for tags made after `--dev` was added: the script in `v2026.9.13` and `v2026.10.10` (checked) has the tag check and nothing that skips it, the environment variable only ever covering the date check. So the README's old sentence offering `GUI_VERSION_DATE_CHECK=0` for "a package with an older version" was wrong for that case all along — it only ever covered a version that is not tagged yet and is not today's date, i.e. a late release.

## `--skip-date-check` used to be an environment variable

It was `GUI_VERSION_DATE_CHECK=0` until the script took arguments for `--dev`, and was turned into a flag for two reasons: one mechanism for overrides rather than two, and an `export`ed variable stays set in that shell and silently disables the check for every later run there, where a flag lasts only for the run it is typed on.

The variable was **dropped, not kept beside the flag**, since keeping both is the duplication the change removed. That fails safe: an old `GUI_VERSION_DATE_CHECK=0 ./docker/…` is simply ignored now, so on a day that is not the version's it stops at exit 8, whose message names the flag. The flag is long-only because it is rare release-day use, a long name reads clearly in shell history, and `-d` is taken anyway.

## Verification

All five branches were verified in a throwaway git repo (pass; uncommitted bump → 7; existing tag → 6; `2026.09.13` → 5; yesterday's date → 8, and 0 again with the override; missing line → 4), never by running the real script against the working tree, which back then would have unstaged the staged changes on its `git stash pop`. **That hazard is gone** — the script no longer stashes anything, so it can now be run against the real tree, and `./docker/prepare-for-building-the-image.sh --dev` leaving `git status --porcelain` unchanged and `git stash list` empty is itself one of the checks worth repeating.

Dev mode and `--skip-date-check` were verified the same way on 2026-11-01, in a `git clone` of the repo into a scratch directory named `rclone-rc-web-gui` (the directory check needs that name), with all 23 runs as expected: on the tagged `2026.10.10`, no argument → 6 and `--skip-date-check` → 6 too; `-d`, `--dev` and `-d --dev` → 0 with the archive written and the warning printed; `--bogus`, `-d --bogus`, `-dx`, `--skip-date` and `-s` → 9 with no archive; an uncommitted bump to today → 7, also 7 with `--skip-date-check`, and 0 with `--dev`; the same bump committed → 0 with no argument, i.e. the release path unchanged; yesterday's date committed → 8, still 8 with `GUI_VERSION_DATE_CHECK=0` (the old variable ignored, the message naming the flag), then 0 with `--skip-date-check`, with `--skip-date-check -d` and with `-d`; `2026.09.13` with `-d` → 5; a missing line with `-d` → 4; `-d` run from `docker/` → 1. `git status --porcelain` and `git stash list` were both empty afterwards.

## Two things the guards deliberately do not cover

**Two releases on the same day** have no room in a `YYYY.M.D` scheme at all: the tag check correctly refuses the second one, and the answer is a decision about the scheme (`2026.9.13.1`), not more script.

The checks are **version-specific** — other uncommitted changes, in `src/main.ts` or anywhere else, are still packed into the archive, and that is accepted rather than an oversight. It is also now *uniform*: while the script still stashed, `js/` came from the working tree via `tsc` but `index.html`, `css/` and `images/` came from `HEAD`, so an uncommitted stylesheet silently did not ship while an uncommitted module did. Everything comes from the working tree now. A sixth guard refusing a dirty tree outright would make guard #4 trivially true and is a release-policy decision, not a consequence of that clean-up.

## The other version literals in `docker/README.md`

Only the `export GUI_VER=` line was ever functional. The three remaining literals in that file (the `cosign verify` example, the `docker image inspect` label dump, and the `docker-compose.yaml` snippet) are illustrative prose with their own historical context, and nothing derives them.

## Four rejected alternatives

A `--bump` flag writing today's date into `src/main.ts`: the version is a deliberate choice of publishing date, not something to have written for you. (It used to have a mechanical objection as well — it would have had to run above the `git stash`, or the `git checkout -- .` at the end reverted it — and that one no longer applies, the script having neither.)

A git hook: not versioned, and the author works across three machines.

A flag per check, starting with `--skip-version-check-in-git`: a dev build between releases trips the tag check first, so it would have needed a second flag straight away (see the dev mode section).

A dev build marking the version in the footer, e.g. a `-dev` suffix `sed`-ed into the compiled `js/main.js`: the README's `GUI_VER`, and so the image tag and the label, read `src/main.ts` and would disagree with the footer, which is exactly the drift a single source of the version exists to prevent. The `:dev` image tag marks the image from outside instead.
