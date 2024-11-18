#/bin/sh

sed -i "s/host: \"http:\/\/127.0.0.1:5572\",/host: \"$RCLONE_ALLOW_ORIGIN_SCHEME:\/\/$RCLONE_ALLOW_ORIGIN_HOST:$RCLONE_ALLOW_ORIGIN_PORT\",/g" $PATH_TO_WEB_GUI/js/settings.js
sed -i "s/user: null,/user: \"$RCLONE_USER\",/g" $PATH_TO_WEB_GUI/js/settings.js
sed -i "s/pass: null,/pass: \"$RCLONE_PASS\",/g" $PATH_TO_WEB_GUI/js/settings.js
sed -i 's/someExampleRemote/disk/g' $PATH_TO_WEB_GUI/js/settings.js
sed -i 's/"startingFolder": "path\/to\/some\/path\/there"/"startingFolder": ""/g' $PATH_TO_WEB_GUI/js/settings.js
sed -i 's/"pathToQueryDisk": ""/"pathToQueryDisk": "\/"/g' $PATH_TO_WEB_GUI/js/settings.js

# retarded workaround for impossibility to map/mount a single existing file from container to host
[ -d "$PATH_TO_WEB_GUI/js/settings" ] || mkdir $PATH_TO_WEB_GUI/js/settings
mv $PATH_TO_WEB_GUI/js/settings.js $PATH_TO_WEB_GUI/js/settings/
find $PATH_TO_WEB_GUI -type f -exec sed -i 's/\/settings.js/\/settings\/settings.js/g' {} \;

# the `--rc-addr` has to be exactly `:5572` (or whichever port is chosen),
# as it won't work with `localhost:5572` or `127.0.0.1:5572`
# (unless you are using `host` network for this container, which you shouldn't)
rclone rcd --rc-web-gui-no-open-browser --rc-addr :$RCLONE_PORT \
    --rc-allow-origin $RCLONE_ALLOW_ORIGIN_SCHEME://$RCLONE_ALLOW_ORIGIN_HOST:$RCLONE_ALLOW_ORIGIN_PORT \
    --rc-user $RCLONE_USER \
    --rc-pass $RCLONE_PASS \
    --transfers 1 \
    $PATH_TO_WEB_GUI/
