# Docker

How to build an image and run a container from it.

<!-- MarkdownTOC -->

- [Building an image](#building-an-image)
- [Running a container](#running-a-container)
    - [Generic host with Docker](#generic-host-with-docker)
    - [Synology DSM](#synology-dsm)

<!-- /MarkdownTOC -->

## Building an image

``` sh
$ cd /path/to/rclone-rc-web-gui

$ tsc --version
Version 5.3.3
$ tsc
$ ls -L1 ./js

$ cd ./docker
$ COPYFILE_DISABLE=1 tar -cvf contents.tar \
    ../css/ \
    ../images/ \
    ../js/ \
    ../favicon.png \
    ../index.html

$ export IMAGE_NAME="rclone-rc-web-gui"
$ export RCLONE_VER="1.68.1"
$ export GUI_VER="0.5.0"

$ docker --version
Docker version 27.3.1, build ce12230
$ docker build . \
    --build-arg RCLONE_VERSION_VALUE="v$RCLONE_VER" \
    --tag $IMAGE_NAME:"rclone_$RCLONE_VER-gui_$GUI_VER" \
    --tag $IMAGE_NAME:"latest"

$ docker images
REPOSITORY          TAG                       IMAGE ID       CREATED          SIZE
rclone-rc-web-gui   latest                    94468b279531   14 minutes ago   92.4MB
rclone-rc-web-gui   rclone_1.68.1-gui_0.5.0   94468b279531   14 minutes ago   92.4MB
alpine              latest                    511a44083d3a   2 months ago     8.83MB
```

If you are building on an ARM-based host but will need to use the image on a x64-based host (*or the other way around*), then you might want to add `--platform linux/amd64` to the `docker build` command.

## Running a container

### Generic host with Docker

First create folders and named volumes for data persistency (*can't just use `-v`, because it will obscure/override the content inside the image*):

``` sh
$ mkdir -p /path/to/dckr/{data,config,settings}

$ docker volume create --driver local \
    -o o=bind -o type=none \
    -o device="/path/to/dckr/data" \
    rclone-data

$ docker volume create --driver local \
    -o o=bind -o type=none \
    -o device="/path/to/dckr/config" \
    rclone-config

$ docker volume create --driver local \
    -o o=bind -o type=none \
    -o device="/path/to/dckr/settings" \
    rclone-settings

$ docker volume list
DRIVER    VOLUME NAME
local     rclone-data
local     rclone-config
local     rclone-settings
```

Why three named volumes instead of just one? Because apparently one can not simply do `rclone/data` on mapping a named volume with `-v`.

And then create and run a container with those mapped volumes:

``` sh
$ docker run -it -p 5572:5572 \
    -v rclone-data:/data \
    -v rclone-config:/home/rclone/.config/rclone \
    -v rclone-settings:/var/www/rclone-rc-web-gui/js/settings \
    --rm \
    94468b279531
```

You might also want to override some of the environment variables (*with `-e SOME=THING`*):

- `RCLONE_ALLOW_ORIGIN_SCHEME`;
- `RCLONE_ALLOW_ORIGIN_HOST`;
- `RCLONE_ALLOW_ORIGIN_PORT`;
- `RCLONE_USER`;
- `RCLONE_PASS`.

You can take a look at a set of example values [below](#synology-dsm).

### Synology DSM

Here will be specific instructions for Synology's [Container Manager](https://synology.com/en-global/dsm/feature/docker).
