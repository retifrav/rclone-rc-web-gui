#!/bin/sh

# using `-e` so that a failed `mv` below isn't followed by rclone happily serving
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
if [ ! -f "$RCLONE_CONFIG" ]; then
    echo "No rclone.conf file yet, creating a new one with the default 'disk' remote"
    mkdir -p "$configDir" 2>/dev/null || true
    # `umask` rather than a `chmod` afterwards, because a config can end up holding
    # obscured passwords - and rclone itself rewrites it with 0600 anyway
    if ! (umask 077; printf '[disk]\ntype = alias\nremote = /data\n' > "$RCLONE_CONFIG"); then
        # the shell has already printed its own "can't create" reason above this
        printf '[ERROR] Could not create %s\n' "$RCLONE_CONFIG" >&2
        printf '        The folder mounted at %s is not writable by uid %s\n' "$configDir" "$(id -u)" >&2
        printf '        You should either take ownership of it on the host:\n' >&2
        printf '            chown -R %s:%s /path/to/config\n' "$(id -u)" "$(id -g)" >&2
        printf '        or run the container as the user that owns it:\n' >&2
        printf '            docker run --user 1027:100 ... (or `user: "1027:100"` in compose)\n' >&2
        exit 1
    fi
else
    echo 'Found existing rclone.conf, will not overwrite it'
fi

# since we are at ENTRYPOINT, it will not care about already existing files,
# so it needs to be checked for an existing file before going and overriding stuff
if [ ! -f "${PATH_TO_WEB_GUI}/js/settings/settings.js" ]; then
    echo 'No settings.js file yet, creating a new one'
    # same story as with the config above
    if ! mv "$PATH_TO_WEB_GUI/js/settings.js.default" "$PATH_TO_WEB_GUI/js/settings/settings.js"; then
        printf '[ERROR] Could not create %s\n' "$PATH_TO_WEB_GUI/js/settings/settings.js" >&2
        printf '        The folder mounted at %s/js/settings is not writable by uid %s -\n' "$PATH_TO_WEB_GUI" "$(id -u)" >&2
        printf '        `chown -R %s:%s` it on the host or run the container as its owner\n' "$(id -u)" "$(id -g)" >&2
        exit 1
    fi
    sed -i "
s/host: \"http:\/\/127.0.0.1:5572\",/host: \"$RCLONE_ALLOW_ORIGIN_SCHEME:\/\/$RCLONE_ALLOW_ORIGIN_HOST:$RCLONE_ALLOW_ORIGIN_PORT\",/g
s/user: null,/user: \"$RCLONE_USER\",/g
s/pass: null,/pass: \"$RCLONE_PASS\",/g
s/someExampleRemote/disk/g
s/\"startingFolder\": \"path\/to\/some\/path\/there\"/\"startingFolder\": \"\"/g
s/\"pathToQueryDisk\": \"\"/\"pathToQueryDisk\": \"\/\"/g
" "$PATH_TO_WEB_GUI/js/settings/settings.js"
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
