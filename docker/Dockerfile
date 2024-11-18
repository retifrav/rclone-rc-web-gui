# could have used https://rclone.org/install/#docker as the base image
# (and probably should)
FROM alpine:latest

ARG PATH_TO_WEB_GUI="/var/www/rclone-rc-web-gui"
# RCLONE_VERSION seems to be used by rclone, so it's better not to export it,
# although it is not(?) an environment variable here, so it wouldn't hurt anyway
ARG RCLONE_VERSION_VALUE="v1.68.1"
# don't rely on it, as the port is still hardcoded in ENTRYPOINT
ARG RCLONE_PORT="5572"

# environment variables cannot be before FROM, because there it is still the "global scope"
ENV USER="rclone"
ENV GROUPNAME="$USER"
ENV UID="1000"
ENV GID="1000"
# had to split it into scheme and address because of sed stumbling upon `//`
ENV RCLONE_ALLOW_ORIGIN_SCHEME="http"
ENV RCLONE_ALLOW_ORIGIN="localhost:$RCLONE_PORT"
#
ENV RCLONE_USER="rclone"
ENV RCLONE_PASS="enolcr"

#WORKDIR $PATH_TO_WEB_GUI
#ADD contents.tar ./

RUN mkdir -p $PATH_TO_WEB_GUI
ADD contents.tar $PATH_TO_WEB_GUI/
RUN sed -i "s/host: \"http:\/\/127.0.0.1:5572\",/host: \"$RCLONE_ALLOW_ORIGIN_SCHEME:\/\/$RCLONE_ALLOW_ORIGIN\",/g" $PATH_TO_WEB_GUI/js/settings.js
RUN sed -i "s/user: null,/user: \"$RCLONE_USER\",/g" $PATH_TO_WEB_GUI/js/settings.js
RUN sed -i "s/pass: null,/pass: \"$RCLONE_PASS\",/g" $PATH_TO_WEB_GUI/js/settings.js
RUN sed -i 's/someExampleRemote/disk/g' $PATH_TO_WEB_GUI/js/settings.js
RUN sed -i 's/"startingFolder": "path\/to\/some\/path\/there"/"startingFolder": ""/g' $PATH_TO_WEB_GUI/js/settings.js
RUN sed -i 's/"pathToQueryDisk": ""/"pathToQueryDisk": "\/"/g' $PATH_TO_WEB_GUI/js/settings.js
# retarded workaround for impossibility to map/mount a single existing file from container to host
RUN mkdir $PATH_TO_WEB_GUI/js/settings
RUN mv $PATH_TO_WEB_GUI/js/settings.js $PATH_TO_WEB_GUI/js/settings/
RUN find $PATH_TO_WEB_GUI -type f -exec sed -i 's/\/settings.js/\/settings\/settings.js/g' {} \;

RUN mkdir /data

RUN cd /tmp
RUN wget https://downloads.rclone.org/${RCLONE_VERSION_VALUE}/rclone-${RCLONE_VERSION_VALUE}-linux-amd64.zip
RUN unzip -j "./rclone-${RCLONE_VERSION_VALUE}-linux-amd64.zip" "rclone-${RCLONE_VERSION_VALUE}-linux-amd64/rclone" -d "/bin"
RUN rm ./rclone-${RCLONE_VERSION_VALUE}-linux-amd64.zip

RUN addgroup \
    --gid $GID \
    $GROUPNAME \
    && adduser \
        --disabled-password \
        --gecos "" \
        --ingroup $GROUPNAME \
        --uid $UID \
        $USER
RUN chown -R $USER:$GROUPNAME $PATH_TO_WEB_GUI /data
USER $USER

# not needed really, but it is useful to explicitly check
# that rclone can run at all
RUN rclone --version

RUN printf "[disk]\ntype = alias\nremote = /data\n" > ~/.config/rclone/rclone.conf

EXPOSE $RCLONE_PORT

# the `--rc-addr` has to be exactly `:5572` (or whichever port is chosen),
# as it won't work with `localhost:5572` or `127.0.0.1:5572`
# (unless you are using `host` network for this container, which you shouldn't)
#
# also `--rc-addr` does not accept an ARG here (probably because of the starting `:`,
# or I don't know what the fuck), so the port can not be customized with $RCLONE_PORT here
ENTRYPOINT [ "sh", "-c", "rclone rcd --rc-web-gui-no-open-browser --rc-addr :5572 --rc-allow-origin $RCLONE_ALLOW_ORIGIN_SCHEME://$RCLONE_ALLOW_ORIGIN --rc-user $RCLONE_USER --rc-pass $RCLONE_PASS --transfers 1 /var/www/rclone-rc-web-gui/" ]
# would probably be nicer to split arguments between ENTRYPOINT and CMD, so users could override those,
# but this shit cannot work with variables - https://github.com/moby/moby/issues/5509 - so everything
# has to go to ENTRYPOINT with a `sh -c` workaround
#CMD [ "--rc-allow-origin", "http://localhost:5572", "--rc-no-auth" ]
