# Module layout — naming and the import cycles

Supporting notes for the **Module layout** section of `CLAUDE.md`.

## Why `settings-ui.ts` is called that

It owns the *contents* of the settings tab (the `#settings` div in `index.html`): both sliders, the polling checkbox, manual refresh, `/options/get` and `/options/set`. It does **not** own that block's visibility any more, nor the donation block's, which it used to — both moved to `tabs.ts`.

It is named after the GUI section it drives rather than after the rc endpoints it calls. It was `options.ts` immediately after the split, and that name said nothing about the fact that this is the *UI of the Settings tab*, which invited reading it as a sibling of `src/settings.ts` — which it is not, that one being the user-editable runtime config. The hyphen makes it the only multi-word module name in the project, accepted because no single word separates "the Settings tab's controls" from `settings.ts` without going back to naming the module after `/options/*`.

It exports no DOM element at all any more — the transfers slider is private to the module, and what crosses the boundary is a number.

## Why `tabs.ts → settings-ui.ts` must stay one-way

The tab registry names `getMaximumAllowedRcloneTransfers` as the settings tab's on-show hook, and nothing in `settings-ui.ts` needs anything back.

Both decoupled alternatives were rejected:

- A `registerTab()` exported by `tabs.ts` and called from each tab's own module scatters the list so that "which tabs exist?" stops having one answer.
- A `CustomEvent` dispatched on the block has no precedent anywhere in `src/` (there is not one `dispatchEvent` in the codebase) and falls under the same "more indirection than this GUI is worth" stance as the callback registry.

## Why the four import cycles are safe

**Nothing is read at module-evaluation time**: every cross-module access happens inside a function that first runs at or after `window.onload`, and the `getElementById` consts are initialised before that (module scripts are deferred, so the DOM is parsed). Breaking them would take a callback registry, which is more indirection than this GUI is worth.

Don't "fix" one by parking shared state in `main.ts` either — **nothing imports `main.ts`**, and that is worth keeping.

## History of the `queue.ts` ↔ `settings-ui.ts` cycle

Both halves used to run off the transfers slider instead — the allowance read straight from `inputMaximumAllowedTransfers`, the folder-file count fired from that slider's `change` — and both moved for the reason in `.claude/notes/queue.md`. The cycle itself is unchanged and still deliberate; don't take the fact that only a number crosses it now as an invitation to break it.

## Why `settings-ui.ts` uses named imports

It *must* use a named import for `transfers.js`, because `transfers` is a local name in there twice (rclone's `--transfers`) and would shadow a namespace import. It is also the one module where a namespace import would be awkward for a second reason: `settings` is already taken by `import * as settings from "./settings.js"`, and a hyphenated module has no legal identifier to be imported as anyway.
