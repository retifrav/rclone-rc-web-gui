# could have used https://rclone.org/install/#docker as the base image
# (and probably should)
FROM alpine:latest

RUN apk add --no-cache tzdata

# RCLONE_VERSION seems to be used by rclone, so it's better not to export it,
# although it is not(?) an environment variable here, so it wouldn't hurt anyway
ARG RCLONE_VERSION_VALUE="v1.68.2"
# not sure, but looks like these can't really be exposed as ENV for user to override
ARG USER="rclone"
ARG GROUPNAME="$USER"
ARG UID="1000"
ARG GID="1000"

# environment variables cannot be before FROM, because there it is still the "global scope"
#
# - these should be ARG, but for ENTRYPOINT script they have(?) to be ENV (and aren't meant to be overridden)
#
ENV PATH_TO_WEB_GUI="/var/www/rclone-rc-web-gui"
ENV RCLONE_PORT="5572"
#
# - these are for overriding
#
# had to split it into scheme and address because of sed stumbling upon `//`
ENV RCLONE_ALLOW_ORIGIN_SCHEME="http"
ENV RCLONE_ALLOW_ORIGIN_HOST="localhost"
# the `RCLONE_PORT` is for `rclone rcd` inside the container,
# and `RCLONE_ALLOW_ORIGIN_PORT` is for whichever port will be
# mapped on the host at the public interface, as they are likely
# to be different and only the public one matters for CORS
ENV RCLONE_ALLOW_ORIGIN_PORT="5572"
ENV RCLONE_USER="rclone"
ENV RCLONE_PASS="enolcr"

#WORKDIR $PATH_TO_WEB_GUI
#ADD contents.tar ./

RUN mkdir -p $PATH_TO_WEB_GUI
ADD contents.tar $PATH_TO_WEB_GUI/

# only by utilizing a script in ENTRYPOINT one can use the ENV variables
# to let user override those values
COPY entrypoint.sh /

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

ENTRYPOINT [ "/bin/sh", "/entrypoint.sh" ]
