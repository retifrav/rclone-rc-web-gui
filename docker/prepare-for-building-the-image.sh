#/bin/bash

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
COPYFILE_DISABLE=1 tar -cvf $contentsArchive \
    ../css/ \
    ../images/ \
    ../js/ \
    ../favicon.png \
    ../index.html

cd ..
rm -r ./js/*

# revert Docker-related changes
git checkout -- .
# and restore from stash
if [[ $hasChanges == 1 ]]; then
    git stash pop
fi
