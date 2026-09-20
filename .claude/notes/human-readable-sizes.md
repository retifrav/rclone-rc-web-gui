# `getHumanReadableValue()` — the rank boundary and the trailing zeros

Supporting notes for the **Icons and human-readable sizes** section of `CLAUDE.md`.

## Why there are four ranks now

It used to bottom out at MB, which is tolerable for transfers but useless in a directory listing, where `0.00 MB` was every row of a listing of sources or configs and an empty file looked just like a 9 KB one.

The MB and GB branches still use the same divisors and the same two decimals they always did, so the transfers tables and the `(… left)` disk-space suffix on the remote dropdown read as they always did. The `B` rank goes through `Math.round()` because `/core/stats` sends `speed` as a float and a fraction of a byte would otherwise reach the speed column — verified live under `core/bwlimit rate=30k`, where that column reads `31.06 KB/s` where it used to say `0.03 MB/s`, and a pinned `30720` B/s reads `30 KB/s`.

## Why there is no TB rank

Nothing asked for one, and adding it would silently change the disk-space suffix for a large remote (`9313.23 GB` → `9.09 TB`), so GB is the tail and may exceed 1024.

## Why the rank is chosen from the rounded value

`fitsInRank()`, `Math.round(value * 100) < 1024 * 100` — because two decimals are what actually gets shown. 1048575 bytes are 1023.9990 KB, which `.toFixed(2)` renders as `"1024.00"`, so picking the rank off the raw value labelled a size a few bytes short of the next rank with the rank *below* it: `1024.00 KB` where it should read `1 MB`.

It bit at every boundary, including one that predates the lower ranks (`1073741823` → `1024.00 MB`) and the byte rank, where a float speed of `1023.6` B/s printed `1024 B/s`. Now those read `1 MB`, `1 GB` and `1 KB/s`, while `1048570` still correctly reads `1023.99 KB`.

## Why trailing zeros are dropped

`getRankValue()`, so two decimals are a maximum and not a fixed width: `1 KB` / `1 MB` / `2 MB` rather than `1.00 KB`, and `1.5 KB` / `123.7 KB` / `1.4 GB` rather than `1.50 KB`.

It is `Number(value.toFixed(2)).toString()` — `toFixed` does the rounding, `Number` parses the padded string back and `toString()` prints the shortest form. No exponent can come out of that for the range these ranks produce (1 to a few thousand at two decimals); `1e21` and up is where `toString()` switches, which is nine ranks above GB.

The visible cost is that the decimal points no longer line up in the column, only the units do — which is already true of a listing mixing `999 B` with `48.81 KB`, so nothing was gained by padding.
