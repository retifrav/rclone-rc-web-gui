#/bin/sh

# since we are at ENTRYPOINT, it will not care about already existing files,
# so it needs to be checked for an existing file before going and overriding stuff
if [ ! -f ${PATH_TO_WEB_GUI}/js/settings/settings.js ]; then
    echo 'No settings.js file yet, creating a new one'
    mv $PATH_TO_WEB_GUI/js/settings.js.default $PATH_TO_WEB_GUI/js/settings/settings.js
    sed -i "
s/host: \"http:\/\/127.0.0.1:5572\",/host: \"$RCLONE_ALLOW_ORIGIN_SCHEME:\/\/$RCLONE_ALLOW_ORIGIN_HOST:$RCLONE_ALLOW_ORIGIN_PORT\",/g
s/user: null,/user: \"$RCLONE_USER\",/g
s/pass: null,/pass: \"$RCLONE_PASS\",/g
s/someExampleRemote/disk/g
s/\"startingFolder\": \"path\/to\/some\/path\/there\"/\"startingFolder\": \"\"/g
s/\"pathToQueryDisk\": \"\"/\"pathToQueryDisk\": \"\/\"/g
" $PATH_TO_WEB_GUI/js/settings/settings.js
else
    echo 'Found existing settings.js, will not overwrite it'
fi

# the `--rc-addr` has to be exactly `:5572` (or whichever port is chosen),
# as it won't work with `localhost:5572` or `127.0.0.1:5572`
# (unless you are using `host` network for this container, which you shouldn't)
rclone rcd --rc-web-gui-no-open-browser --rc-addr :$RCLONE_PORT \
    --rc-allow-origin $RCLONE_ALLOW_ORIGIN_SCHEME://$RCLONE_ALLOW_ORIGIN_HOST:$RCLONE_ALLOW_ORIGIN_PORT \
    --rc-user $RCLONE_USER \
    --rc-pass $RCLONE_PASS \
    --transfers 1 \
    $PATH_TO_WEB_GUI/
