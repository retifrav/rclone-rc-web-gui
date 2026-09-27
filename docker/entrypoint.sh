#!/bin/sh

# using `-e` so that a failed `sed` below isn't followed by rclone happily serving
# web UI whose `settings.js` is 404 (which is what an unwritable `js/settings/` mount
# would look like), and `-u` here is to catch a variable that ended up being unset somehow
set -eu

# not allowed to start rclone without credentials (`--rc-user ""` and
# `--rc-pass ""`), and credentials need to be quoted (so empty values
# wouldn't feed next arguments in there place, thus breaking the command)
if [ -z "${RCLONE_USER:-}" ] || [ -z "${RCLONE_PASS:-}" ]; then
    echo '[ERROR] You must set both RCLONE_USER and RCLONE_PASS (-e RCLONE_USER=rclone -e RCLONE_PASS=s0m3pa55w0rd)' >&2
    exit 1
fi

# the rclone config can not be baked into the image, because its folder is meant
# to be mounted, and a bind mount hides whatever the image has there. So it is created
# here on the first ever start or an existing one is picked up as it is on the host
configDir="$(dirname "$RCLONE_CONFIG")"
configTmp="$configDir/.rclone.conf.tmp"
if [ ! -f "$RCLONE_CONFIG" ]; then
    echo "No rclone.conf file yet, creating a new one with the default 'disk' remote"
    mkdir -p "$configDir" 2>/dev/null || true
    # `umask` instead of `chmod` afterwards, because a config can end up holding obscured passwords,
    # and rclone itself rewrites it with 0600 anyway
    #
    # it is written to a temporary file next to it and only then renamed, so that a failure
    # in the middle of that could not leave a half-written config behind, which the next start
    # would find with the `-f` check above and then never touch
    if ! (umask 077; printf '[disk]\ntype = alias\nremote = /data\n' > "$configTmp"); then
        rm -f "$configTmp" 2>/dev/null || true
        # the shell has already printed its own "can't create" reason above this
        printf '[ERROR] Could not create %s\n' "$RCLONE_CONFIG" >&2
        printf '        The folder mounted at %s is not writable by uid %s\n' "$configDir" "$(id -u)" >&2
        printf '        You should either take ownership of it on the host:\n' >&2
        printf '            chown -R %s:%s /path/to/config\n' "$(id -u)" "$(id -g)" >&2
        printf '        or run the container as the user that owns it:\n' >&2
        printf '            docker run --user 1027:100 ... (or `user: "1027:100"` in compose)\n' >&2
        exit 1
    fi
    # same folder, so this is a rename(2), which keeps the inode and therefore the 0600
    mv "$configTmp" "$RCLONE_CONFIG"
else
    echo 'Found existing rclone.conf, will not overwrite it'
fi

# since we are at ENTRYPOINT, it will not care about already existing files,
# so it needs to be checked for an existing file before going and overriding stuff
settingsDir="$PATH_TO_WEB_GUI/js/settings"
settingsFile="$settingsDir/settings.js"
settingsTmp="$settingsDir/.settings.js.tmp"
if [ ! -f "$settingsFile" ]; then
    echo 'No settings.js file yet, creating a new one'
    # same story as with the config above: the default is read from outside the web UI folder,
    # `sed`ed into a temporary file inside the mounted one and only then renamed into place.
    # This used to be a `mv` of the default followed by a `sed -i`, and that could not work
    # for a container running as any user other than the image's own 1000: the mount is a different
    # filesystem, so `mv` became copy-then-delete, and deleting the default required write access
    # to `js/`, which belongs to the image
    if ! sed "
s/host: \"http:\/\/127.0.0.1:5572\",/host: \"$RCLONE_ALLOW_ORIGIN_SCHEME:\/\/$RCLONE_ALLOW_ORIGIN_HOST:$RCLONE_ALLOW_ORIGIN_PORT\",/g
s/user: null,/user: \"$RCLONE_USER\",/g
s/pass: null,/pass: \"$RCLONE_PASS\",/g
s/someExampleRemote/disk/g
s/\"startingFolder\": \"path\/to\/some\/path\/there\"/\"startingFolder\": \"\"/g
s/\"pathToQueryDisk\": \"\"/\"pathToQueryDisk\": \"\/\"/g
" "$PATH_TO_SETTINGS_DEFAULT" > "$settingsTmp"; then
        rm -f "$settingsTmp" 2>/dev/null || true
        # the shell has already printed its own "can't create" reason above this
        printf '[ERROR] Could not create %s\n' "$settingsFile" >&2
        printf '        The folder mounted at %s is not writable by UID %s\n' "$settingsDir" "$(id -u)" >&2
        printf '        You should either take ownership of it on the host:\n' >&2
        printf '            chown -R %s:%s /path/to/settings\n' "$(id -u)" "$(id -g)" >&2
        printf '        or run the container as the user that owns it:\n' >&2
        printf '            docker run --user 1027:100 ... (or `user: "1027:100"` in compose)\n' >&2
        exit 1
    fi
    # same folder, so this is a rename(2): no second filesystem to copy across, no ownership to preserve
    # and nothing to unlink out of the image's own `js/`
    mv "$settingsTmp" "$settingsFile"
else
    echo 'Found existing settings.js, will not overwrite it'
fi

# the `--rc-addr` has to be exactly `:5572` (or whichever port is chosen),
# as it won't work with `localhost:5572` or `127.0.0.1:5572`
# (unless you are using `host` network for this container, which you shouldn't)
#
# `exec` replaces this shell, which is PID 1, so that rclone becomes PID 1 itself
# and receives the SIGTERM from `docker stop` instead of being SIGKILL'ed later on
exec rclone rcd --rc-web-gui-no-open-browser --rc-addr ":$RCLONE_PORT" \
    --rc-allow-origin "$RCLONE_ALLOW_ORIGIN_SCHEME://$RCLONE_ALLOW_ORIGIN_HOST:$RCLONE_ALLOW_ORIGIN_PORT" \
    --rc-user "$RCLONE_USER" \
    --rc-pass "$RCLONE_PASS" \
    --transfers 1 \
    "$PATH_TO_WEB_GUI/"
