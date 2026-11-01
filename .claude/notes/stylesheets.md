# Stylesheets — the split and its verification

Supporting notes for the **Stylesheets** section of `CLAUDE.md`.

## How the split was made

`css/gui.css` was 775 lines when it was split (2026-11-01) into `gui.css`, `transfers.css`, `panels.css`, `tabs.css` and `dialogs.css`, with `gui-mobile.css` left as it was. Every new file was assembled from **exact line ranges** of the original with `sed -n`, so no rule was retyped. Checked by diffing the sorted non-blank lines of the original against those of the five files: the only lines missing were the `/* --- header tabs --- */` and `/* --- dialogs --- */` section markers, which the file names replace. Comments were edited only where they point at a rule that now lives in another file (`tabs.css` → `.select-all` in `panels.css`, `dialogs.css` → the header tab buttons in `tabs.css`), plus a `/* --- settings tab --- */` marker and a one-line comment over the header tab buttons in `tabs.css`.

The assignment followed where the markup is: `table` is used only by the two transfer tables, and `.controls`, `.lastButtons`, `.input-query` and `button.with-icon` only by the file panels, so those went to `transfers.css` and `panels.css` rather than staying generic. `pre` is used nowhere at all today and stayed in `gui.css` as a plain element rule.

## Which rules changed their relative order

Splitting by concern is not a contiguous cut — the original interleaved them — so some rules moved to the other side of others:

- the transfer tables' rules (including `td > img` and `#currentTransfersBody img`) now come after `.icon`, `.header > .icon`, `pre` and the indicators, and before the panel rules;
- the header tab buttons (`.header > input.icon` and its two states) now come after the panel controls, the panel rules and the indicators;
- the panel controls (`div.controls button…`, `button.with-icon`) now come after `pre`, the indicators and `#currentTransfersBody img`;
- the indicators and the separator now come before everything except the page rules.

Every such pair was checked by hand: either the two never match the same element, or they differ in specificity (`td > img` (0,0,2) against `.icon` (0,1,0), for example), so their order decides nothing. The one tie that does exist, `.filesList > *` against `.loadingAnimation`, was kept in its original order by putting both in `panels.css`. That hand check is what the comparison below confirms.

## The computed-style comparison

It is kept as **`.claude/scripts/compare-styles.mjs`**, and re-running it is one command from the repo root:

```sh
TMPDIR=<scratch dir> node .claude/scripts/compare-styles.mjs [<revision>]    # HEAD by default
```

It compares the working tree's stylesheets against those of `<revision>`, so the usual run — rules moved, not yet committed — needs no argument. Exit code **0** means no differences *and* the negative control was noticed, **1** means differences (printed one line per element, `<baseline> -> <working tree>`), **2** means the harness itself failed. It runs `tsc`, creates the test remotes under `os.tmpdir()` (hence `TMPDIR`), starts `rclone rcd` and `chromium-headless-shell` itself and stops both on the way out, each in a process group of its own so Chromium's zygotes go too, and removes the temporary folder. A run takes about a minute. It needs port **5572** free, the default `js/settings.js` talking to `http://127.0.0.1:5572` and the page having to be same-origin with it; Chromium's DevTools port is picked by Chromium (`--remote-debugging-port=0`, read back from `DevToolsActivePort`). The page states it drives are tied to `index.html`'s ids and to the GUI's behaviour, so a timeout in it after a markup change means the script needs updating, not that the CSS is wrong.

How it works: the real GUI is served by `rclone rcd --rc-no-auth --transfers 4 --bwlimit 20k` from the repo root with two `alias` remotes over temporary folders, and `chromium-headless-shell` is driven over the DevTools protocol from node. The idea is to compare **within one page state** rather than across two page loads, so nothing about the data can differ: the revision's stylesheets — the `<link>`s of its `index.html`, read with `git show`, in their order — are injected as `<style>` elements with the working tree's `<link>`s `disabled`, and that is toggled back and forth on the same DOM. The script refuses a baseline stylesheet holding an `@import` or a `url()`, which an inline `<style>` would resolve against the page rather than against `css/`; there are none today.

Per comparison, the computed value of every property of every element is recorded in both modes, along with `::before`/`::after` (the `*:before, *:after` box-sizing rule) and `::backdrop` for each `<dialog>`. Before each snapshot every running animation is `finish()`ed, and the infinite one (the spinner's `spin`) is paused at `currentTime = 0`, since the swap gives the `@keyframes` a new identity and can restart them.

Five states, each at **1280px and 400px** (the latter inside `gui-mobile.css`'s `max-width: 720px`), each in the **light and the dark colour scheme** (the system preference emulated with `Emulation.setEmulatedMedia`, which every `light-dark()` follows when no theme is chosen, and none is in a fresh profile), and each both plain and with `CSS.forcePseudoState` forcing `hover`, `focus`, `focus-visible`, `focus-within` and `active` on **every** node at once:

1. both panels listed, one row ticked, a finished copy and a finished check (`tr.clickable`) in the completed table, a bandwidth-limited copy in flight in the current one, a spinner appended to a panel (the real one is gone as soon as the listing lands) and `#completedTransfersTrimmed` shown;
2. the settings tab open, the left search row with a 2-character query (`:invalid`) and the right one filtering rows away;
3. the donation tab open instead;
4. the check results dialog open, with its `.dialog-list`;
5. the New folder dialog with its validation error (`.dialog-error`, `aria-invalid`), with a confirmation (`.danger`, a `<code>` in the body) and an error message stacked on top of it.

Two more checks run before the comparisons, and either one failing exits with 2. A **negative control** in state 1: the baseline with only the `.loadingAnimation` rule moved to the front of its first sheet, i.e. a split that gets the one tie wrong, must come out as differences on the spinner and nowhere else — it came out as exactly `margin-left` and `margin-inline-start` `0px -> 15px`. And forcing has to take effect: `#btn-settings`'s `background-color` goes from `rgba(0, 0, 0, 0)` to `rgb(224, 224, 224)` (the `:hover` rule) under a forced `hover`.

Result for the split (baseline `HEAD`, i.e. the single `gui.css`, run before the dark scheme existed, so light only): **0 differences in all 20 comparisons** (780 to 906 entries each), with no failed request and no console error during the run. To make sure that a real difference does get reported, it was also run against `ee53031~1`, the commit before `.dialog-success`/`.dialog-failure` were added: exit 1, and the only differences were `p.dialog-failure { color: rgb(0, 0, 0) -> rgb(255, 0, 0) }` (plus the 16 properties that follow `color`) in the check results dialog state, at both widths.

### Why the script does what it does

The traps it works around, so that they are not rediscovered when it has to be changed:

- **The transfers polling has to be stopped before the snapshots**, or the current transfers table is rebuilt between the two of them and the element lists stop lining up. `import('/js/settings.js').then(m => { m.userSettings.timerRefreshEnabled = false; })` does it with no visible change, the tick no-oping on `=== true` (see the refresh loop section); unticking the checkbox would change what is on screen.
- **The `:invalid` query has to be typed with `Input.insertText`**, not assigned to `.value`: a value is *too short* only once the user has edited it (see the search section).
- **A check row only appears for a check submitted through the GUI** (`check.ts` synthesises it), so the Check button has to be clicked and the queue's and `pollChecks()`'s 5 s ticks waited out — about 15 s.
- **The output folds what merely repeats**: a property that changes exactly as `color` does (border, caret, outline, `text-decoration` colours and the like all default to `currentColor`) and a `::before`/`::after` repeating its element are left out of the printed line, or one `color` change reads as 50 lines. The counts printed are the unfolded ones.
- A throwaway `--user-data-dir` is needed anyway, for the disk-cache reason in `items-counter.md`, and the cache is disabled over the protocol on top of that.
