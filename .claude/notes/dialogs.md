# Dialogs — why `<dialog>` and a function, and what was measured

Supporting notes for the **Dialogs** section of `CLAUDE.md`.

## Why not a custom element

Considered explicitly (the class it needs was judged not to be the obstacle — `target: ES2022` emits classes natively and the Build section only asks for an emit re-diff once one exists). It loses on three other counts:

- The natural form, a customized built-in (`class … extends HTMLDialogElement` + `<dialog is="…">`), is not supported by Safari and WebKit has said it will not be. An autonomous `<rclone-dialog>` would therefore have to create a real `<dialog>` inside itself to get `showModal()`'s behaviour — one more layer around the same code.
- What custom elements are good for is dialog content authored as markup, and the convenient form of that (named `<slot>`s for header, body, buttons) needs Shadow DOM, which walls the content off from `gui.css`. Without Shadow DOM the element has to move its own children around by hand.
- Every dialog in the GUI is filled with runtime data (the current path, the selected names, the dropped queue items, validation errors), so callers would build it in code either way.

The callers only ever see `showDialog()` / `showMessage()` / `showConfirmation()`, so the module can become a custom element later without touching a call site.

## Why the look is browser-independent

`alert()` is browser chrome and no CSS reaches it. `<dialog>` is an ordinary element whose UA defaults are a short, spec-defined list (border, `1em` padding, `Canvas` background, centring, a faint `::backdrop`, a `max-width`/`max-height` on `:modal`), and `gui.css` overrides every one of them. What does differ per engine is native form controls, inside a dialog or not — hence `.dialog-button`/`.dialog-input`/`.dialog-close` with `appearance: none; font: inherit` (controls do not inherit the page font by default).

## The `display` trap

Author rules beat UA rules regardless of specificity, so any `display` on `.dialog` overrides `dialog:not([open]) { display: none }` and a closed dialog renders in the page flow. Nothing in the GUI keeps a closed dialog in the DOM today, but the rule keeps that from being a latent bug. The flex column is `.dialog > form`, and `.dialog-body` scrolls inside it (`max-height: calc(100dvh - 2rem)` on the form) so header and footer stay on screen.

## Default button and Enter

Implicit submission presses the form's first submit button in tree order, so only the last (default) button is `type="submit"`. While it is `disabled`, Enter does nothing at all — that is the spec's implicit-submission rule (a default button that cannot be activated means no submission), and not separately measured here. Measured over CDP: one Enter in the New folder input produced exactly one `/operations/mkdir` XHR (events `keydown`, `keypress`, `click` on the Create button, `submit`, `keyup`), and one click on Create also exactly one.

## Backdrop click

`pointerdown` and `click` both have to target the dialog element. Verified: press in the input, move to `(5, 5)`, release → the dialog stays open; press and release at `(5, 5)` → it closes with `returnValue` `""`.

## The verification run (2026-10-30)

Chromium headless shell 156.0.8078.73, rclone v1.75.2, two `alias` remotes over scratch directories, `rcd --rc-no-auth --transfers 2`, driven over CDP with real mouse and key events. All of these held:

- No remote chosen: Search, Refresh, New folder and Copy each give the warning dialog with the original `alert()` text; focus on OK; Escape closes and removes it and focus returns to the button that opened it; Enter presses OK.
- New folder: focus in the input; empty name, `a/b`, `..` each give the inline error with `aria-invalid="true"` and the dialog stays open; typing clears both; `  new folder 'x' & <y>  ` is trimmed, created and listed, and focus returns to the New folder button; inside a `chmod 555` folder rclone's 500 gives "rclone could not create the folder…" with Create re-enabled; `Fetch.failRequest` on mkdir gives "Could not reach rclone…".
- Delete: nothing selected opens nothing; the dialog lists the ticked items with their row icons; Cancel has focus, so Escape and an immediate Enter both cancel without disabling the Delete button; the red Delete queues it and the file is gone from disk.
- Dropped items: `/operations/copyfile` answered 500 by `Fetch.fulfillRequest`, two files queued with an allowance of 2 → 6 refused requests, then **one** "Removed from the queue" dialog listing both.
- 400px mobile viewport: the dialog is 368px wide with 16px either side.
- Stacking: a message opened over the New folder dialog is on top; Escape closes only it.
- Tab from the last footer button lands once on `BODY` — the browser-UI stop, the address bar in a headed browser — then on the ×. No element behind the dialog ever received focus.

Two observations that are not bugs:

- After a dialog is opened by a mouse click, the programmatically focused button shows no focus ring, because `:focus-visible` follows the last input modality. Opening from the keyboard shows it.
- Rows hidden by the search filter cannot be part of a Delete: `showSearch()` hides the whole `.controls` row, Delete included, and `hideSearch()` un-hides every row. So the confirmation's list is everything ticked, which on a long listing includes rows scrolled out of view.

Firefox and Safari were **not** checked from the container (only `chromium-headless-shell` exists there).

## rclone's reason in the New folder dialog (2026-10-30)

What rclone sends, measured with `curl -i` against `rcd`: every rc error has a JSON body `{"error": …, "input": …, "path": …, "status": …}` with `Content-Type: application/json` — a refused mkdir is a 500 (`mkdir /…/x: permission denied`), a remote missing from the config a 500 (`didn't find section in config file ("nosuchremote")`), a missing parameter a 400 (`Didn't find key "remote" in input`), an unknown endpoint a 404 (`couldn't find method …`). A wrong password is a `401` with `Content-Type: text/plain` and the body `401 Unauthorized`, which is why `getRcloneError()` keys on the header.

Async submissions are accepted regardless: `operations/copyfile` with a nonexistent `srcFs` remote, `sync/copy` with a nonexistent source folder, and `operations/copyfile` with `srcRemote`/`dstRemote` missing altogether all returned a 200 with a `jobid` when sent with `_async: true`. That is the measurement behind leaving the queue dialog without a reason.

Verified in the dialog over CDP: the real `chmod 555` refusal shows `rclone could not create the folder: mkdir …/locked/x: permission denied`, wrapped inside the dialog (body `scrollWidth` equal to its `clientWidth`) with Create re-enabled and focus back in the field; a faked JSON 400 shows its message (only a 500's was read before); a faked `text/plain` 401 and a faked `text/html` 500 both give the fallback text with Create re-enabled. That the old code hung on the HTML 500 is from reading it (`JSON.parse` of the body inside `onload`, before `resolve`), not from a run of the old build.

## A trap for CDP harnesses

`Runtime.enable` replays the console messages the page already logged, so a second harness run against a page that is still loaded from an earlier run starts with that run's messages. The first full run here appeared to show every mkdir failure twice; a replay with an XHR counter proved one request each, the extra pair being the crashed first run's last messages. A `Page.navigate` sent *after* `Runtime.enable` does not prevent it; sending `Runtime.enable` only once the navigation has landed does (verified on the rerun), and counting requests (e.g. by wrapping `XMLHttpRequest.prototype.open`) is the robust check either way.
