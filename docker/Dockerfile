# could have used https://rclone.org/install/#docker as the base image
# (and probably should)
FROM alpine:3.22

# `amd64`, `arm64`, etc - is set by `buildx`, which means that the image requires
# BuildKit, which is default for `docker build` since Docker v23, but it can be
# disabled with `DOCKER_BUILDKIT=0`, and then `TARGETARCH` would be empty
# (and that wiil fail the rclone download below)
ARG TARGETARCH
# if we ever need `linux-arm-v7`, `linux-arm-v6` and so on
#ARG TARGETVARIANT

ARG RCLONE_VERSION_VALUE="v1.75.0"

# not sure, but looks like these can't really be exposed as ENV for user to override
ARG APPLICATION_USER="rclone"
ARG APPLICATION_GROUP="$APPLICATION_USER"
ARG UID="1000"
ARG GID="1000"

# environment variables cannot be before FROM, because there it is still the "global scope"
#
# - these should be ARG, but for ENTRYPOINT script they have(?) to be ENV (and aren't meant to be overridden)
#
ENV PATH_TO_WEB_GUI="/var/www/rclone-rc-web-gui"
ENV RCLONE_PORT="5572"
# this one is an actual rclone variable (--config) and it is set explicitly so that
# rclone doesn't have to resolve $HOME to find the config, which is also what allows
# running the container as an arbitrary user (`docker run --user 1027:100`) when
# mounted folders on host are owned by someone other than the UID below
#
# `/config` is meant to be mounted, so the default config can not be baked in here,
# and it is `entrypoint.sh` who creates the initial config on the first ever start
# (same way as with `settings.js`)
ENV RCLONE_CONFIG="/config/rclone.conf"
#
# - these are for overriding
#
# had to split it into scheme and address because of sed stumbling upon `//`,
# also actually `sed -e "s|...|...|"` should take any delimiter, so it might work
ENV RCLONE_ALLOW_ORIGIN_SCHEME="http"
ENV RCLONE_ALLOW_ORIGIN_HOST="localhost"
# the `RCLONE_PORT` is for `rclone rcd` inside the container,
# and `RCLONE_ALLOW_ORIGIN_PORT` is for whichever port will be
# mapped on the host at the public interface, as they are likely
# to be different and only the public one matters for CORS
ENV RCLONE_ALLOW_ORIGIN_PORT="5572"
# no hardcoded credentials, because anyone can read ENV defaults from the image,
# so instead it's the `entrypoint.sh` who will refuse to start rclone if these are not set
ENV RCLONE_USER=""
ENV RCLONE_PASS=""

# several related operations in one layer, using absolute paths instead of `~`
# and short BusyBox flags instead of GNU-style long ones (BusyBox does support
# `adduser`/`addgroup` but via an optional table, so short variants are somewhat safer)
#
# the config folder is created (and chown'ed) empty (without a config file inside)
RUN set -eux; \
    apk add --no-cache tzdata; \
    addgroup -g "$GID" "$APPLICATION_GROUP"; \
    adduser -D -H -g "" -G "$APPLICATION_GROUP" -u "$UID" -h "/home/$APPLICATION_USER" "$APPLICATION_USER"; \
    mkdir -p "/home/$APPLICATION_USER/.ssh" "$(dirname "$RCLONE_CONFIG")" /data "$PATH_TO_WEB_GUI"; \
    chmod 0700 "/home/$APPLICATION_USER/.ssh"; \
    chown -R "$UID:$GID" "/home/$APPLICATION_USER" "$(dirname "$RCLONE_CONFIG")" /data "$PATH_TO_WEB_GUI"

# this goes before `contents.tar`, because archive tend to change more often than
# the rclone version, and so editing the web UI part would not re-download rclone
#
# the checksum is fetched over the same channel as the archive itself, so it can only
# be used to prove the integrity of the download, not its authenticity. We could use
# the PGP signature, but that's a `gnupg` dependency plus a PGP key fingerprint to handle
RUN set -eux; \
    cd /tmp; \
    RCLONE_DIR="rclone-${RCLONE_VERSION_VALUE}-linux-${TARGETARCH}"; \
    wget -q "https://downloads.rclone.org/${RCLONE_VERSION_VALUE}/${RCLONE_DIR}.zip"; \
    wget -q "https://downloads.rclone.org/${RCLONE_VERSION_VALUE}/SHA256SUMS"; \
    grep -F "${RCLONE_DIR}.zip" SHA256SUMS > expected-checksum.txt; \
    [ -s expected-checksum.txt ]; \
    sha256sum -c expected-checksum.txt; \
    unzip -j "${RCLONE_DIR}.zip" "${RCLONE_DIR}/rclone" -d /usr/local/bin; \
    chmod 0755 /usr/local/bin/rclone; \
    rm -f "${RCLONE_DIR}.zip" SHA256SUMS expected-checksum.txt; \
    rclone --version

# only by utilizing a script in ENTRYPOINT one can use the ENV variables
# to let user override those values
COPY --chmod=0755 entrypoint.sh /entrypoint.sh

# `ADD` both extracts the tar and sets ownership in a single layer,
# so there is no `chown -R` afterwards rewriting every file into a second copy
ADD --chown=$UID:$GID contents.tar $PATH_TO_WEB_GUI/

USER $APPLICATION_USER
WORKDIR /data

EXPOSE $RCLONE_PORT

# entrypoint.sh finishes with `exec rclone rcd ...`, which replaces this shell,
# so that rclone becomes PID 1 itself and receives the SIGTERM from `docker stop`
# instead of being SIGKILL'ed after the timeout
ENTRYPOINT [ "/bin/sh", "/entrypoint.sh" ]
