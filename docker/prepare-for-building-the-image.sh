#!/bin/bash

currentDir="$(basename "$PWD")"
if [ "$currentDir" != "rclone-rc-web-gui" ]; then
    echo '[ERROR] This script should run from the rclone-rc-web-gui repository root' >&2
    exit 1
fi

# check for sed command being available, and make sure to use gsed variant in case of Mac OS
# (for in-place edits with `sed -i`)
sedCommand=sed
osName=$(uname)
if [ "$osName" == "Darwin" ]; then
    sedCommand=gsed
    echo "This seems to be Mac OS, will use gsed (install it with Homebrew, if you haven't yet)"
else
    echo "Doesn't look like Mac OS, will use normal sed"
fi
echo

echo 'Checking for sed...'
which $sedCommand
if [ $? -ne 0 ]; then
    echo "[ERROR] Did not find $sedCommand" >&2
    exit 2
fi
echo

echo 'Checking for tsc...'
which tsc
if [ $? -ne 0 ]; then
    echo "[ERROR] Did not find tsc (TypeScript compiler)" >&2
    exit 3
fi
echo

# the web UI version lives only in `src/main.ts`, and both the image tag and the OCI annotation
# are derived from it (see docker/README.md), so there is nothing to keep in sync, but it is still
# totally possible to simply forget to bump it at all
echo 'Checking the UI version...'
guiVersion=$($sedCommand -n 's/^const guiVersion: string = "\(.*\)";$/\1/p' ./src/main.ts)
if [ -z "$guiVersion" ]; then
    echo '[ERROR] Could not extract guiVersion from src/main.ts' >&2
    exit 4
fi

# YYYY.M.D without leading zeros
if ! printf '%s' "$guiVersion" | grep -qE '^[0-9]{4}\.([1-9]|1[0-2])\.([1-9]|[12][0-9]|3[01])$'; then
    echo "[ERROR] Version $guiVersion is not a YYYY.M.D date without leading zeros" >&2
    exit 5
fi

# if that version has been released already, then most likely maintainer forgot to bump it
if git rev-parse -q --verify "refs/tags/v$guiVersion" > /dev/null; then
    echo "[ERROR] Tag v$guiVersion exists already, so the version likely needs bumping" >&2
    exit 6
fi

# an uncommitted bump would mean the image shipping a version that is neither in the release commit
# nor in its tag, as tsc compiles the working tree, while the `git stash` takes those changes away again
guiVersionCommitted=$(git show HEAD:src/main.ts | $sedCommand -n 's/^const guiVersion: string = "\(.*\)";$/\1/p')
if [ "$guiVersion" != "$guiVersionCommitted" ]; then
    echo "[ERROR] Version $guiVersion is not committed yet (HEAD has ${guiVersionCommitted:-none})" >&2
    exit 7
fi

# the version is meant to be the publishing date, but a bump could have been made a day before publishing,
# hence the override. And that is not `date +%Y.%-m.%-d`, because the `%-` padding suppression
# is a GNU extension, which is absent on Mac OS (while `10#` is what keeps `08`/`09` from being read as octal)
today="$(date +%Y).$((10#$(date +%m))).$((10#$(date +%d)))"
if [ "$guiVersion" != "$today" ] && [ "${GUI_VERSION_DATE_CHECK:-1}" != "0" ]; then
    echo "[ERROR] Version $guiVersion is not today's date ($today)" >&2
    echo "    Bump it in src/main.ts, or re-run with GUI_VERSION_DATE_CHECK=0" >&2
    exit 8
fi

echo

echo 'Compiling TypeScript into JavaScript...'
tsc
echo

# save uncommitted changes, if any, before making Docker-related changes
hasChanges=0
if [[ `git status --porcelain` ]]; then
    hasChanges=1
    git stash
    echo
fi

# retarded workaround for impossibility to map/mount a single existing file from container to host
[ -d ./js/settings/ ] || mkdir ./js/settings/
mv ./js/settings.js ./js/settings.js.default
find . -type f \( -name index.html -o -name '*.js' \) -exec \
    $sedCommand -i "
s/\.\/js\/settings.js/\.\/js\/settings\/settings.js/g
s/\.\/settings.js/\.\/settings\/settings.js/g
" {} \;

echo 'Packing everything for deployment with ADD...'
cd ./docker
contentsArchive=contents.tar
[ -f ./$contentsArchive ] && rm ./$contentsArchive
# `-C ..` instead of `../` prefixes on every item, because whether that prefix ends up
# in the archived member names depends on the tar: GNU tar strips it while creating
# the archive, macOS libarchive keeps it, and an archive whose members are `../css/...`
# is one that GNU tar then refuses to unpack at all. Docker's `ADD` sanitizes the paths
# itself either way, so this is about being able to inspect and test `contents.tar` locally
#
# also `--no-xattrs`, because bsdtar on Mac OS archives extended attributes, so files carry
# `com.apple.quarantine`, `com.apple.provenance` and others into the image layer
COPYFILE_DISABLE=1 tar -cvf $contentsArchive --no-xattrs -C .. \
    css \
    images \
    js \
    favicon.png \
    index.html

cd ..
rm -r ./js/*

# revert Docker-related changes
git checkout -- .
# and restore from stash
if [[ $hasChanges == 1 ]]; then
    git stash pop
fi

echo
echo "Done, the UI version in the archive is $guiVersion"
