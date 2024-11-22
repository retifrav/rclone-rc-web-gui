# Web GUI for rclone rc

<!-- MarkdownTOC -->

- [About](#about)
    - [Supported rc API commands](#supported-rc-api-commands)
        - [Sync command isn't supported](#sync-command-isnt-supported)
    - [An example use-case](#an-example-use-case)
    - [Comparison with rclone-webui-react](#comparison-with-rclone-webui-react)
- [Building](#building)
- [How to use it](#how-to-use-it)
    - [Launching](#launching)
        - [With --rc-web-gui](#with---rc-web-gui)
            - [Authentication](#authentication)
        - [From local path](#from-local-path)
    - [Possible issues](#possible-issues)
        - [Wrong username/password](#wrong-usernamepassword)
        - [CORS header does not match](#cors-header-does-not-match)
    - [Configuration](#configuration)
    - [Queue](#queue)
- [Deployment](#deployment)
    - [Docker](#docker)
    - [Generic GNU/Linux server](#generic-gnulinux-server)
- [Support](#support)
- [3rd-party](#3rd-party)
    - [Dependencies](#dependencies)
    - [Resources](#resources)

<!-- /MarkdownTOC -->

## About

A web-based GUI for [rclone rcd](https://rclone.org/commands/rclone_rcd/) (*remote control daemon*), somewhat implementing a concept of a two-panel file manager like Norton Commander, Total Commander or Far Manager. It can be used for `rclone rcd` running either on a local machine or on a remote host.

Commands are executed via HTTP requests ([XMLHttpRequest](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)), which are sent to a running `rclone rcd` using [rc API](https://rclone.org/rc/).

![rclone rc GUI](/screenshot.png?raw=true)

### Supported rc API commands

- listing files and directories
    + [operations/list](https://rclone.org/rc/#operations-list)
- copying files and directories
    + [sync/copy](https://rclone.org/rc/#sync-copy)
    + [operations/copyfile](https://rclone.org/rc/#operations-copyfile)
- moving files and directories
    + [sync/move](https://rclone.org/rc/#sync-move)
    + [operations/movefile](https://rclone.org/rc/#operations-movefile)
- deleting files and directories
    + [operations/purge](https://rclone.org/rc/#operations-purge)
    + [operations/deletefile](https://rclone.org/rc/#operations-deletefile)
- creating a new directory
    + [operations/mkdir](https://rclone.org/rc/#operations-mkdir)

#### Sync command isn't supported

The [sync/sync](https://rclone.org/rc/#sync-sync) command support isn't implemented, and [that is intentional](https://github.com/retifrav/rclone-rc-web-gui/issues/10). Comparing to moving/deleting, the syncing operation is a weapon of mass destruction and can cause severe data loss, so I decided not to have it available in the GUI. Adding support for it is likely to be very trivial, so you most probably will be able to do it yourself, but don't send it as a pull request to this repository as it will be rejected.

### An example use-case

I have a remote seedbox and a local media server (*running on Raspberry Pi*), and I need to transfer files from seedbox to media server (*via SFTP*). And `rclone` is perfect for that, thanks to its `rc` mode, it only needs to have some remote GUI, so I could conveniently control it from my computers/tablets/smartphones.

More details about the use-case are in [this article](https://decovar.dev/blog/2019/12/26/appletv-kodi-network-share/#downloading-new-files).

### Comparison with rclone-webui-react

This project is inspired by another web-based GUI for `rclone rc` - [rclone-webui-react](https://github.com/rclone/rclone-webui-react), which provides a very good and nice-looking GUI - big thanks to its creator. But I was not entirely happy with it, as it has (*or at least it had back in March 2020*) several inconveniences:

- no queue, so all the transfers go in parallel;
- no way to cancel a transfer;
- the GUI feels a bit overloaded and has several non-functioning controls;
- transfers list has no sorting, so its elements "jump" one position to another on every view update.

So my goal was to improve these points. ~~Although cancelling a transfer turned out to be the [issue](https://github.com/retifrav/rclone-rc-web-gui/issues/4) that originates in the `rclone` itself.~~

Having a fancy GUI was/is the lowest priority for me, so expect the GUI to be very basic. Perhaps one could even say not basic but clean and simple.

## Building

Skip this section, if you have downloaded a package from [Releases](https://github.com/retifrav/rclone-rc-web-gui/releases) page, because the scripts there are already in JavaScript, so it is ready to be used out-of-the-box.

Otherwise, the project scripts sources are in TypeScript (*starting with `v0.3.0`*), and so they need to be compiled to JavaScript. For that you'll need to have [tsc](https://typescriptlang.org/download) tool, which is installed with `npm`, which is installed with [Node.js](https://nodejs.org/en/download/). Yes, we all hate Node.js, but that's the easiest way I know for installing TypeScript compiler:

``` sh
$ npm install -g typescript@latest
```

This is the only thing what Node.js is needed for, I promise.

Once you have the tool, compile the sources:

``` sh
$ cd /path/to/rclone-rc-web-gui
$ tsc
```

Resulting JavaScript files will be put to `./js` folder. After that you can use the GUI.

## How to use it

Before launching the GUI, you need to have your remotes configured in `~/.config/rclone/rclone.conf` on the host where you will be running `rclone rcd`.

### Launching

#### With --rc-web-gui

The easiest would be to let `rclone` handle [downloading and serving](https://rclone.org/gui/) the latest release:

``` sh
$ rclone rcd --transfers 1 --rc-allow-origin http://localhost:5572 \
    --rc-web-gui \
    --rc-web-fetch-url https://api.github.com/repos/retifrav/rclone-rc-web-gui/releases/latest
```

If you have used this functionality before, then you might have a different web GUI already downloaded in your system (*for example, on Mac OS it would be here: `~/Library/Caches/rclone/webgui`*), and to replace it you'll need to add `--rc-web-gui-force-update` flag.

##### Authentication

By default `rclone` will generate a random password and will also compose a Base64-encoded authentication token for the `Authorization` header. That token will be also set as an URL query parameter (*`?login_token=HERE-GOES-THE-VALUE`*), which is how the code will be able to get it.

The GUI URL will be auto-openned in your web-browser with prepended `gui:AUTO-GENERATED-PASSWORD@` for passing through initial authentication prompt, but if you'll stop `rclone rcd` and launch it again, chances are that your browser (*Firefox in my case*) will still show the authentication prompt, despite having `gui:AUTO-GENERATED-PASSWORD@` in the URL.

In case of launching it on a remote server, you obviously won't get a web-browser auto-openned with provided credentials, so replace `--rc-web-gui` with `--rc-web-gui-no-open-browser` in the CLI, and then it will print the URL with credentials to the `stdout`.

If you'd like to set your own username/password, then you need to explicitly set `--rc-user`/`--rc-pass` and edit `settings.js` in the `rclone`'s cache directory (*on Mac OS it would be here: `~/Library/Caches/rclone/webgui/current/build/js/settings.js`*). But of course those values will be overwritten on the next GUI update.

Or you can just set `--rc-no-auth` to disable authentication, which is not recommended.

#### From local path

Get a package from [Releases](https://github.com/retifrav/rclone-rc-web-gui/releases) page (*or [build it](#building) from sources*). Set your `rclone rcd` host, port, username and password in `./js/settings.js`.

Launch `rclone rcd` and point it to the folder with web GUI:

``` sh
$ cd /path/to/rclone-rc-web-gui
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD .
```

or:

``` sh
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD /path/to/web/gui
```

I personally prefer to have only 1 ongoing transfer at a time, hence `--transfers 1`. Of course, that only applies to directory operations, as daemon allows to span as many operations as you want (*for which I implemented the [queue](#queue) functionality*).

If you want to serve web GUI files with a web-server, then launch `rclone` daemon and allow the origin that you'll have with that server:

``` sh
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD --rc-allow-origin http://127.0.0.1:5572 /path/to/web/gui
```

You might also want to [create a service](#an-example-deployment-on-a-gnulinux-server) for running `rclone` daemon.

### Possible issues

#### Wrong username/password

If you get `401`/`403` errors for all/some of the requests, then check that the values you've provided in `--rc-user` and `--rc-pass` match the `rcloneSettings.user` and `rcloneSettings.pass` values in your `settings.js`.

If you didn't intend to use authentication, then make sure that you launched `rclone rcd` with `--rc-no-auth` flag and that `rcloneSettings.user`, `rcloneSettings.pass` (*and `rcloneSettings.loginToken`*) are set to `null`.

#### CORS header does not match

In certain situations you might get [different origins](https://decovar.dev/blog/2019/10/10/the-fuck-is-this-cors/) between server and client, mostly when serving web GUI from a remote host, but that can also happen while testing it on your local host.

If you get:

> Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://127.0.0.1:5572/core/version. (Reason: CORS header ‘Access-Control-Allow-Origin’ does not match ‘http://127.0.0.1:5572/’).

or:

> Access to XMLHttpRequest at 'http://127.0.0.1:5572/core/version' from origin 'http://127.0.0.1:5572' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: The 'Access-Control-Allow-Origin' header has a value 'http://127.0.0.1:5572/' that is not equal to the supplied origin.

check if you ran `rclone rcd` with `--rc-allow-origin http://127.0.0.1:5572` option.

Also note that with `--rc-web-gui` (*instead of `--rc-web-gui-no-open-browser`*) provided for `rclone rcd` it will automatically open the web GUI in browser at <http://localhost:5572> location, and that might cause a CORS mismatch. If that happens, then you'll need to either open exactly <http://127.0.0.1:5572> (*if that is what you've set in `--rc-allow-origin`*) or set `rcloneSettings.host` to `http://localhost:5572` in `settings.js`.

### Configuration

There are several settings available for you to configure in `./js/settings.js`.

Aside from self-explanatory variables like host, credentials and timers, there is an object for storing settings for your remotes. An example:

``` js
var remotes = {
    "disk": {
        "startingFolder": "media/somedisk/downloads",
        "canQueryDisk": true,
        "pathToQueryDisk": "media/somedisk"
    },
    "seedbox": {
        "startingFolder": "files",
        "canQueryDisk": false,
        "pathToQueryDisk": ""
    }
}
```

Here:

- we have 2 remotes: `disk` and `seedbox`;
- both have `startingFolder` set, so that will be the folder opened when the remote is chosen in the files panel;
- `disk` has `canQueryDisk` set to `true`, so it supports querying information about available disk space;
  - in case of external disks, you'll also need to set their mounted path (`pathToQueryDisk`).

### Queue

All operations go to the queue and processed one at a time.

Obviously, since the queue is implemented on the client side, it's only your browser who knows about it, so if you add more operations from a different host, browser, or even a different tab in the same browser - all of them will go in parallel.

That also means that once you close the browser or just this tab, the queue will no longer exist. However, all the ongoing transfers will of course still be there, as they are already being handled by `rclone` (*[_async = true](https://rclone.org/rc/#running-asynchronous-jobs-with-async-true)*).

## Deployment

### Docker

There is a [Docker image](https://github.com/retifrav/rclone-rc-web-gui/blob/master/docker/README.md), which might be the easiest way of running/deploying the project. But if you'd prefer to launch/deploy it yourself, read the instructions below.

### Generic GNU/Linux server

TLDR:

- `rclone rcd` is run as a systemd service;
- NGINX is used as a reverse proxy;
- web GUI is available via custom base URL such as `http://IP-ADDRESS-OR-DOMAIN/rclone/`.

Get a package from [Releases](https://github.com/retifrav/rclone-rc-web-gui/releases) page (*or [build it](#building) from sources*):

``` sh
$ cd /var/www
$ sudo wget https://github.com/retifrav/rclone-rc-web-gui/releases/latest/download/rclone-rc-web-gui.zip
$ sudo unzip ./rclone-rc-web-gui.zip && sudo rm ./rclone-rc-web-gui.zip
$ sudo mv ./build ./rclone-rc-web-gui
$ sudo chown -R www-data:www-data /var/www/rclone-rc-web-gui
```

Create a systemd service:

``` sh
$ sudo nano /etc/systemd/system/rclone-gui.service
```
``` ini
[Unit]
Description=rclone web GUI

[Service]
WorkingDirectory=/media/
ExecStart=rclone rcd --rc-web-gui-no-open-browser --rc-addr 127.0.0.1:8004 --rc-allow-origin http://IP-ADDRESS-OR-DOMAIN --rc-htpasswd /home/SOME-USER/.htpasswd --transfers 1 --multi-thread-streams 1 /var/www/rclone-rc-web-gui/
Restart=always
RestartSec=10
SyslogIdentifier=rclonewebgui
User=SOME-USER-WITH-REQUIRED-DISK-ACCESS
Group=www-data

[Install]
WantedBy=multi-user.target
```

here:

- `http://IP-ADDRESS-OR-DOMAIN` - the requests will be coming from the same server, so you need to provide here either the IP address of that server or its domain, if you have one. In my case it's just a server in my local network, so I've set this to `http://192.168.1.11` (*static MAC-binded IP address of my server*);
- `SOME-USER-WITH-REQUIRED-DISK-ACCESS` - a user from which `rclone` will be run, so perhaps it's a good idea to create a new user for this purpose and limit its access to just one folder such as `/media/`;
- `WorkingDirectory=/media/` - if you'll have your local filesystem as one of the rclone's remote too, then `/media/` would be a starting folder (*for me that's where I mount external disks*);
- `.htpasswd` - a slightly better security, instead of providing credentials in plain text they are stored [somewhat encrypted](https://github.com/retifrav/scraps/blob/master/_linux/index.md#basic-authentication).

Enable and start the service:

``` sh
$ sudo systemctl enable rclone-gui.service
$ sudo systemctl start rclone-gui.service
```

NGINX configuration:

``` sh
$ sudo nano /etc/nginx/sites-enabled/default
```
``` nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;
    
    # a "parent" website or some welcome/home page
    # that is what will open on http://IP-ADDRESS-OR-DOMAIN/
    root /var/www/html;

    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # rclone rc web GUI, will open on http://IP-ADDRESS-OR-DOMAIN/rclone/
    location /rclone/ {
        proxy_pass http://localhost:8004/;
    }
}
```
``` sh
$ sudo systemctl restart nginx.service
```

Set the credentials (*the same ones that are in `/home/SOME-USER/.htpasswd`*) and adjust the host value:

``` sh
$ sudo -u www-data nano /var/www/rclone-rc-web-gui/js/settings.js
```
``` js
var rcloneHost = "http://IP-ADDRESS-OR-DOMAIN/rclone"; // using port 80, so no need to set it
var rcloneUser = "USERNAME-FROM-HTPASSWD";
var rclonePass = "PASSWORD-FROM-HTPASSWD";
```

Add some remotes to rclone config, if you haven't yet:

``` sh
$ rclone config
```

Now you should be able to access the web GUI on <http://IP-ADDRESS-OR-DOMAIN/rclone/>.

## Support

I've created this project mostly for myself. So it's better to state right away that there is basically no support and that I am not responsible for any possible data loss you might get from using this project. In fact, I don't recommend you to rely on it for anything important, and certainly don't use it on servers with valuable data.

Also note, that since I use Mozilla Firefox as my main web-browser, that's where I did all the testing, and I've spent very little to none effort on maintaining cross-browser-ability.

If you discover any issues/bugs, report them [here](https://github.com/retifrav/rclone-rc-web-gui/issues).

## 3rd-party

### Dependencies

The project doesn't use any external libraries/frameworks, it's just plain HTML/CSS/JS. Well actually, now it's not JavaScript but TypeScript, so there is a requirement to have `tsc` tool for compiling TypeScript sources to JavaScript.

### Resources

- icons are from [Bootstrap Icons](https://icons.getbootstrap.com/)
- favicon is from [rclone website](https://rclone.org/)
