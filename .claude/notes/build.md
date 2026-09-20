# Build and `tsconfig.json` — why the compiler options are what they are

Supporting notes for the **Build** section of `CLAUDE.md`. Every option argued for here is one a reader is tempted to add back.

## Why `module`/`moduleResolution` are not set

`module` is inherited from `target` (ES2022 → ES module output, which is what `index.html` loads — verified: no `require(`, no `exports.`, no `__esModule` in `js/`), and the resolution mode has nothing to disambiguate because every import is relative and there are no dependencies. The emitted JS is identical either way.

## Why there is no `lib` array

The default for an ES2015+ `target` already pulls in `DOM` and `DOM.Iterable` alongside the target's own library, so `target: ES2022` covers everything on its own.

It used to be listed as `["DOM", "DOM.Iterable", "ES2017"]`, and had to be, only because `target` was ES6 — whose default lib lacks `Array.prototype.includes`, which `asyncOperations.includes(query)` in `src/functions.ts` needs, failing with `TS2550`. Raising `target` removed that reason. Since an explicit `lib` *replaces* the default entirely, reintroducing one would drag `DOM`/`DOM.Iterable` back in as a maintenance burden for no gain.

## The ES2022 retarget was verified inert

With `lib` deleted and `target` raised, all five files `js/` held at the time came out **byte-identical** to the ES6 build. That holds because `src/` has no classes, `async`/`await`, generators or private fields, so ES2022's `useDefineForClassFields: true` default has nothing to act on.

The one behavioural gain is library surface: ES2022 makes `Object.hasOwn` available (used by `updateRemotesSelects()`/`remoteChanged()`), which under the old `lib` failed with the same `TS2550`.

If classes, `async`/`await`, generators or private fields are ever introduced, re-diff the emit rather than assuming.

## Why `js/settings.js`'s types are all optional

An entry present but missing `startingFolder` used to concatenate the string `"undefined"` into the path and open `remote:/undefined`.

The reads use `Object.hasOwn(settings.remotes, remote)` rather than `!== undefined` because a remote may legitimately be named after an `Object` member — `rclone config create toString …` is accepted — and a bare `!== undefined` resolves such a name through `Object.prototype` instead of rejecting it.
