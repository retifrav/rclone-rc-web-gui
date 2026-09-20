# Icons and MIME types — where rclone's answer actually comes from

Supporting notes for the **Icons and human-readable sizes** section of `CLAUDE.md`.

`functions.getIconType(mimeType, fileName)` takes the **name as well as the MIME type**, because the MIME type alone cannot identify every file: rclone has no MIME table of its own, and for a local file `fs.MimeTypeFromName()` asks Go's `mime.TypeByExtension()`, which looks the extension up in the MIME database *of the machine running `rcd`* and returns `application/octet-stream` when nothing matches.

## The lookup is two lists with an early return

Not one flat sequence, which is worth getting right because it decides which file actually answers (`initMimeUnix()` in Go's `mime/type_unix.go`; all six paths and Go's builtin table are greppable in the `rclone` binary):

1. The **shared-mime-info databases**, `/usr/local/share/mime/globs2` then `/usr/share/mime/globs2`. The **first one that loads wins and the rest is skipped** — Go's own comment is "Stop checking more files if mimetype database is found".
2. Only if *neither* of those loads, the **fallback** list, all four of which are then loaded: `/etc/mime.types`, `/etc/apache2/mime.types`, `/etc/apache/mime.types`, `/etc/httpd/conf/mime.types`. Note `/etc/apache/mime.types` without the `2` — `CLAUDE.md` used to list five paths in one order and omitted it.

In *this* container the fallback branch is what runs: neither `globs2` exists, `/etc/mime.types` does (owned by Debian's `media-types`), and that file is where every type below actually comes from.

## Three consequences, all re-measured live

- **The spelling varies by host.** `.mkv` is `video/matroska` under Debian's `media-types` — `grep matroska /etc/mime.types` shows the very line the answer comes from — and `video/x-matroska` elsewhere, so the old switch's `case "video/x-matroska"` matched nothing here and `.mkv` fell through to the default icon. Enumerating exact strings is therefore the wrong shape for the media families, and `type.startsWith("video/" | "audio/" | "image/")` replaced the nine cases that used to spell them out — which also brought in `.mov`, `.wmv`, `.ogv`, `.m2v`, `.wma`, `.m4a`, `.wav`, `.aiff`, `.heic`, `.webp`, `.avif`, `.bmp`, `.tiff` and `.psd` for free.
- **Some extensions are in no database at all**, so no MIME test can ever reach them: `.vob`, `.divx`, `.m2ts`, `.rmvb`, `.f4v`, `.3gp` and `.3g2` all arrive as `application/octet-stream`, and mapping *that* to `film.svg` would give every unrecognised file a film icon. `.mts` (`model/vnd.mts`) and `.asf` (`application/vnd.ms-asf`) are typed, but not as `video/*`. Hence `videoFileExtensions` and the extension fallback, consulted **only after** every MIME test has failed — the stored MIME type of a cloud object stays authoritative, and a file with no extension is unaffected.
- **A host with none of those six files** — the project's own `alpine:latest` image, which adds only `tzdata` — falls back to Go's builtin table, which types `.html`, `.css`, `.js`, `.json`, `.xml`, `.pdf`, `.wasm` and a few images and *nothing else*, so `.mp4`/`.mkv`/`.mp3`/`.zip`/`.txt` are all `application/octet-stream` there. That is why `videoFileExtensions` lists the common containers too and not just the exotic ones; it is inert wherever the MIME type already answers. (Inferred from the binary's contents — `docker` is not available in the dev container, so this one is not measured end to end.)

## Two more details

**MIME parameters are stripped once** (`mimeType.split(";")[0].trim()`), which is what collapsed the duplicated `text/plain` / `text/plain; charset=utf-8`, `text/css` / `text/css; …` and `text/html` / `text/html; …` cases into one apiece, and made `text/srt; charset=utf-8` a plain `text/srt`; `text/javascript` was added next to `application/javascript` at the same time, since that is the spelling both Debian and Go's builtin table use for `.js`/`.mjs` and neither matched before.

**`.ts` is deliberately absent** from `videoFileExtensions`: it is a transport stream in a video folder and TypeScript everywhere else, and it arrives as `text/vnd.trolltech.linguist; charset=utf-8` (a Qt translation file) in this container, so it keeps the generic icon rather than mislabelling source files. `.rm` is left alone for the same kind of reason — the database calls it `audio/x-pn-realaudio`, so the prefix test gives it the music icon.
