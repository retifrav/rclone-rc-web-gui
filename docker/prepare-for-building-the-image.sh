#!/bin/bash

currentDir="$(basename "$PWD")"
if [ "$currentDir" != "rclone-rc-web-gui" ]; then
    echo '[ERROR] This script should run from the rclone-rc-web-gui repository root' >&2
    exit 1
fi

# check for sed command being available, and make sure to use gsed variant in case of Mac OS
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

# compile TypeScript sources into JavaScript
echo 'Checking for tsc...'
which tsc
if [ $? -ne 0 ]; then
    echo "[ERROR] Did not find tsc (TypeScript compiler)" >&2
    exit 3
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
find . -type f \( -name index.html -o -name *.js \) -exec \
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
