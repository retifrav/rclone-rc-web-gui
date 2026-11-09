# Served by `rclone gui` — the rclone side and the verification

Supporting notes for the **Served by `rclone gui`** section of `CLAUDE.md`.

## What `rclone gui` does

Read off `cmd/gui/gui.go` at `v1.76.0`. The command (`versionIntroduced: v1.74`, and the `[path]` argument is already in v1.75.2) runs two servers, the GUI and the rc API:

- **The source** comes from `guiSourceFS()`: the bundle embedded in the binary when no path is given, `os.DirFS()` for a directory, `zip.OpenReader()` for a regular file ending in `.zip`, and an error for anything else. `guiHandler()` then refuses a bundle without `index.html` at its root (`GUI bundle has no index.html`), which is why the release package, wrapped in `build/`, cannot be passed as it is.
- **Unknown paths fall back to `index.html`** — `guiHandler()` rewrites `r.URL.Path` to `/` for any path with no file behind it. That is what makes `/login` serve this GUI at all, and since `/login` has no trailing slash, `index.html`'s `./js/…`, `./css/…` and `./images/…` resolve to `/js/…` and so on, which exist.
- **Ports**: both servers bind `localhost:0` (a free port each) unless `--addr`/`--api-addr` are given. **Credentials**: unless `--no-auth`, the user is `gui` and the password `random.Password(128)` unless `--user`/`--pass` are given.
- **The link** comes from `buildLoginURL()`: with auth, the GUI's URL with the path `/login` and the query `url=<rc URL>&user=…&pass=…`, the rc URL being `rcServer.URLs()[0]` and so ending in `/`, and including the `--rc-baseurl` path when one is set. **With `--no-auth` it is the bare GUI URL, with no `url` either**, which is the case the GUI cannot discover the API in.
- **CORS** comes from `resolveAllowOrigin()`: an explicit `--rc-allow-origin` wins; otherwise it is the GUI's own origin, or `*` when the GUI is bound to a wildcard address with auth on (a wildcard bind with `--no-auth` keeps the GUI's origin and logs why).
- It starts the rc server with `opt.WebUI = false`, `opt.Serve = false` and no `Files`, so `rcserver` opens no browser of its own. The only one is `rclone gui`'s, and `--no-open-browser` suppresses it — unlike `rcd`'s `--rc-web-gui-no-open-browser`, which v1.76.0 ignores (see `docker/CLAUDE.md`).

## Verification run, 2026-11-09

Against the container's v1.75.2 and a checksum-verified v1.76.0 in the scratchpad, serving the repository root after `tsc`, with an `alias` remote over a scratch folder in a throwaway `--config`. Each case was loaded in `chromium-headless-shell` over the DevTools protocol, which recorded every rc request (method, URL, decoded `Authorization`, status) and the console. After that the script selected the remote in the left panel:

- **`rclone gui --no-open-browser --transfers 1 .`, the logged link**, on both versions: the footer shows the rclone version, the panel lists the folder, every POST goes to the API port with the link's `gui:` credentials and gets 200, every CORS preflight (`OPTIONS`) gets 200, and the console has no errors.
- **`--rc-baseurl /rc`** (v1.76.0): the link's `url` is `http://127.0.0.1:<port>/rc/`, and every request goes to `/rc/core/…` and so on with 200. That is the case `origin` would have broken.
- **`--no-auth --api-addr 127.0.0.1:5572`** (v1.76.0): the link is the bare GUI URL, the GUI falls back to `js/settings.js`'s host, and everything answers 200 with no `Authorization` sent.
- **A crafted `?url=http://127.0.0.1:9/` with no `user`/`pass`**, and **`?url=javascript:alert(1)&user=a&pass=b`**: both are ignored, and the requests go to `js/settings.js`'s `127.0.0.1:5572` (unreachable in that run, hence `ERR_CONNECTION_REFUSED`), never to the link's address.
- **Regression, `rcd --rc-user u --rc-pass p` with `login_token`** (v1.76.0, `PATH` hidden from it as in the image): opened at the URL rclone logs, every request carries `u:p` and gets 200.

The edited `src/settings.ts` (a three-line comment above `rcloneSettings`, value lines untouched) was put through the entrypoint's `sed` before and after: the outputs differ in those three comment lines only, and all six substitutions still apply.

## Two traps in re-running this

- **`Runtime.enable` replays the console messages of the page that is already loaded**, so a probe that reuses a tab reports the previous case's errors as this one's. Navigate to `about:blank` first.
- **`rcd` with `--rc-user`/`--rc-pass` protects the served files too**, so loading `/?login_token=…` without credentials gets a 401 on `index.html` itself and the GUI never runs. Use the URL rclone logs, which carries `user:pass@` as well.
