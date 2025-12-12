# Docker

How to build an image and run a container from it.

<!-- MarkdownTOC -->

- [Getting an image](#getting-an-image)
  - [Pre-built](#pre-built)
  - [Building](#building)
- [Running a container](#running-a-container)
  - [Generic host with Docker](#generic-host-with-docker)
  - [Synology DSM with Container Manager](#synology-dsm-with-container-manager)

<!-- /MarkdownTOC -->

## Getting an image

### Pre-built

There is a pre-built image published at [Docker Hub](https://hub.docker.com/r/decovar/rclone-rc-web-gui).

### Building

``` sh
$ cd /path/to/rclone-rc-web-gui
$ ./docker/prepare-for-building-the-image.sh

$ cd ./docker
$ export IMAGE_NAME='rclone-rc-web-gui'
$ export RCLONE_VER='1.68.2'
$ export GUI_VER='0.5.0'

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

First create folders for data and GUI settings and also a named volume for rclone config. This is generally needed for data persistency between container runs, and a named volume specifically is required because one can not just use `-v`, as it will obscure/override the content inside the image.

So:

``` sh
$ mkdir -p /path/to/dckr/{data,config,settings}

$ docker volume create --driver local \
    -o o=bind -o type=none \
    -o device="/path/to/dckr/config" \
    rclone-config

$ docker volume list
DRIVER    VOLUME NAME
local     rclone-config
```

If you will need more named volumes for some reason, then remember that it can't do "sub-volumes", so you will need to create a volume per folder.

When folders and volumes are ready, you can create and run a container like this:

``` sh
$ docker run -it -p 5572:5572 \
    -v /path/to/dckr/data:/data \
    -v /path/to/dckr/settings:/var/www/rclone-rc-web-gui/js/settings \
    -v rclone-config:/home/rclone/.config/rclone \
    -e TZ=Europe/Amsterdam \
    --rm \
    94468b279531
```

You might also want to override some of the environment variables (*with `-e SOME=THING`*):

- `RCLONE_ALLOW_ORIGIN_SCHEME`;
- `RCLONE_ALLOW_ORIGIN_HOST`;
- `RCLONE_ALLOW_ORIGIN_PORT`;
- `RCLONE_USER`;
- `RCLONE_PASS`.

If you are going to add SFTP remotes with SSH keys based authentication, then you will probably want to map the `~/.ssh` folder too, for example with `-v /path/to/dckr/ssh:/home/rclone/.ssh`.

You can take a look at a set of example values [below](#synology-dsm-with-container-manager).

### Synology DSM with Container Manager

Here's also an example of using this image to run a container in Synology DSM [Container Manager](https://synology.com/en-global/dsm/feature/docker).

Being tailored to my needs, this particular setup has certain specifics, which you might not necessaryly want to have in yours, namely:

- the container data folders are owned by a specially created `docker` system user, which has no access rights to anywhere but that one dedicated `/volume1/docker/` folder;
- the container port `5572` isn't mapped to the host, as instead there is also an NGINX container running, who serves as a reverse-proxy for it (*and other containers in that particular Docker network*);
- that NGINX container is in turn also not mapping its ports to host - instead it's Synology DSM Login Portal who exposes NGINX container ports via the [Reverse Proxy](https://kb.synology.com/vi-vn/DSM/help/DSM/AdminCenter/system_login_portal_advanced?version=7#b_5) feature;
    - this intermediate step of having NGINX container might seem redundant, and you can actually reverse-proxy the containers "directly", but in that case you won't be able to access them by names, so instead of having one static IP address of just the NGINX container, you will have to use static IP addresses of every single container, which is less convenient.

...so if your setup is different, you will need to adjust the following instructions accordingly.

First, create a folder for storing the container data - what needs to "survive" between container restarts/rebuilds. I've put mine into `/volume1/docker/rclone-rc-web-gui/`. Inside that path create folders for `data`, `settings` and `config`. Then make `docker` user to be the owner of those folders (*that part I am not sure about, but I thought it wouldn't hurt to have a dedicated "unprivileged" user as the owner*):

![](./images/synology-dsm-docker-data-folder.png)

Open Container Manager and create a new project:

![](./images/synology-dsm-container-manager-create.png)

Here's the full `docker-compose.yaml` contents:

``` yaml
version: "3"

networks:
  hub:
    external: true

# that is the only(?) way to expose an existing data from container to a mapped folder on host
volumes:
  rclone-config:
    driver: local
    driver_opts:
      o: "bind"
      type: "none"
      device: "/volume1/docker/rclone-rc-web-gui/config"

services:
  server:
    image: decovar/rclone-rc-web-gui:latest
    container_name: rclone-rc-web-gui
    restart: unless-stopped
    environment:
      - TZ=Europe/Amsterdam
      # my DSM serves the web content via HTTPS
      - RCLONE_ALLOW_ORIGIN_SCHEME=https
      # that is the IP address of my Synology NAS host in my home network
      - RCLONE_ALLOW_ORIGIN_HOST=192.168.1.100
      # that public port on my Synology NAS exposed via Reverse Proxy in Login Portal
      - RCLONE_ALLOW_ORIGIN_PORT=11001
      # username for Basic authentication
      - RCLONE_USER=rclone
      # password for Basic authentication
      - RCLONE_PASS=s0m3pa55w0rd
    networks:
      hub:
        # static IP address for the container, which isn't really needed for this one,
        # as it will be accessed by NGINX container via name, not IP address. But while
        # we are here, this is how NGINX container gets its static IP address 172.18.0.10
        ipv4_address: 172.18.0.11
    volumes:
      # default local remote path, which doesn't even have to be mapped, if you don't intend to use it
      - /volume1/docker/rclone-rc-web-gui/data:/data
      # although GUI settings are stored in just one file, its entire parent folder
      # has to be mapped instead, otherwise Docker will create an empty folder
      # named after that file, which is what caused that retarded workaround
      # with moving the `settings.js` file into a subfolder
      - /volume1/docker/rclone-rc-web-gui/settings:/var/www/rclone-rc-web-gui/js/settings
      # SSH keys
      - /volume1/docker/rclone-rc-web-gui/ssh:/home/rclone/.ssh
      # the config with remotes already exists inside container, and I want to expose it to the host
      - rclone-config:/home/rclone/.config/rclone
```

On the next step, don't set-up a web portal for it, just click Next till the end.

If you don't yet have a custom network, container creation will fail. So create a new network with the driver `bridge` - that will allow you to refer to containers by their names. Here's how my network `hub` looks like:

![](./images/synology-dsm-container-manager-network-hub.png)

And then for NGINX container you add the following website configuration (*`/volume1/docker/nginx/data/conf.d/rclone-rc-web-gui.conf`, in my case*):

``` nginx
server {
    listen 11001;

    location / {
        proxy_pass http://rclone-rc-web-gui:5572;
        proxy_set_header Host $host:$server_port;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Finally, here are the settings for Reverse Proxy in Login Portal:

![](./images/synology-dsm-login-portal-reverse-proxy.png)

The `172.18.0.10` on the screenshot is the static IP address of the NGINX container in that same custom Docker network named `hub`.

This is it, once you build and run the container, the GUI should become available at <https://192.168.1.100:11001>, and `rclone rc` requests should satisfy the CORS policy.
