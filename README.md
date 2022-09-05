# Web GUI for rclone rc

<!-- MarkdownTOC -->

- [About](#about)
    - [An example use-case](#an-example-use-case)
    - [Comparison with rclone-webui-react](#comparison-with-rclone-webui-react)
- [How to use it](#how-to-use-it)
    - [Launch](#launch)
        - [Possible issues](#possible-issues)
            - [Wrong username/password](#wrong-usernamepassword)
            - [CORS header does not match](#cors-header-does-not-match)
        - [An example deployment on a GNU/Linux server](#an-example-deployment-on-a-gnulinux-server)
    - [Configuration](#configuration)
    - [Queue](#queue)
    - [Search](#search)
- [Support](#support)
- [3rd-party](#3rd-party)
    - [Dependencies](#dependencies)
    - [Resources](#resources)

<!-- /MarkdownTOC -->

## About

A web-based GUI for [rclone rcd](https://rclone.org/commands/rclone_rcd/), based on a concept of a two-panel file manager like Total Commander or Far Manager.

Commands are executed via HTTP requests ([XMLHttpRequest](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)), which are sent to `rclone rcd` using [rc API](https://rclone.org/rc/).

![rclone rc GUI](/screenshot.png?raw=true)

### An example use-case

I have a remote seedbox and a local media server (*running on Raspberry Pi*), and I need to transfer files from seedbox to media server (*via SFTP*). And `rclone` is perfect for that, thanks to its `rc` mode, it only needs to have some remote GUI, so I could conveniently control it from my computers/tablets/smartphones.

More details about the use-case are in [this article](https://retifrav.github.io/blog/2019/12/26/appletv-kodi-network-share/#downloading-new-files).

### Comparison with rclone-webui-react

This project is inspired by another web-based GUI for `rclone rc` - [rclone-webui-react](https://github.com/rclone/rclone-webui-react), which provides a very good and nice-looking GUI - big thanks to its creator. But I was not entirely happy with it, as it has (*or at least it had back in March 2020*) several inconveniences:

- no queue, so all the transfers go in parallel;
- no way to cancel a transfer;
- the GUI feels a bit overloaded and has several non-functioning controls;
- transfers list has no sorting, so its elements "jump" one position to another on every view update.

So my goal was to improve these points. Although cancelling a transfer turned out to be the [issue](https://github.com/retifrav/rclone-rc-web-gui/issues/4) that originates in the `rclone` itself.

At the same time, the nice-looking part had the lowest priority for me, so expect the GUI to be very basic.

## How to use it

First of all, set your `rclone rcd` host, port, username and password in `/js/settings.js`. Also make sure that you have your remotes configured in `~/.config/rclone/rclone.conf` on the host where you will be running `rclone rcd`.

### Launch

Start `rclone` remote control daemon and point it to the folder with web GUI:

``` sh
$ cd /path/to/web/gui
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD .
```

or

``` sh
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD /path/to/web/gui
```

I personally prefer to have only one ongoing transfer at a time, hence `--transfers 1`. Of course, that only applies to folder operations, as daemon allows to span as many operations as you want (*for which I implemented the [queue](#queue) functionality*).

If you want to serve web GUI files with a web-server, then launch `rclone` daemon and allow the origin that you'll have with that server:

``` sh
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD --rc-allow-origin http://127.0.0.1:5572 /path/to/web/gui
```

You might also want to create a service for running `rclone` daemon.

#### Possible issues

In certain situations you might get [different origins](https://decovar.dev/blog/2019/10/10/the-fuck-is-this-cors/) between server and client, mostly when serving web GUI from a remote host, but that can also happen while testing it on your local host.

##### Wrong username/password

If you get:

> Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://127.0.0.1:5572/config/listremotes. (Reason: CORS header ‘Access-Control-Allow-Origin’ missing).

or

> Access to XMLHttpRequest at 'http://127.0.0.1:5572/core/version' from origin 'http://127.0.0.1' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.

check if you have provided correct username and password.

##### CORS header does not match

If you get

> Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://127.0.0.1:5572/core/version. (Reason: CORS header ‘Access-Control-Allow-Origin’ does not match ‘http://127.0.0.1:5572/’).

or

> Access to XMLHttpRequest at 'http://127.0.0.1:5572/core/version' from origin 'http://127.0.0.1:5572' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: The 'Access-Control-Allow-Origin' header has a value 'http://127.0.0.1:5572/' that is not equal to the supplied origin.

check if you ran `rclone rcd` with `--rc-allow-origin http://127.0.0.1:5572` option.

Also note that `rclone` might automatically open the web GUI (*right after you execute `rclone rcd`*) with <http://localhost:5572> location, and that will of course cause a CORS mismatch. You'll need to open exactly <http://127.0.0.1:5572>, if that is what you've set in `--rc-allow-origin`.

#### An example deployment on a GNU/Linux server

- `rclone rcd` is run as a systemd service
- NGINX is used as a reverse proxy
- web GUI is available via custom path such as `http://IP-ADDRESS-OR-DOMAIN/rclone/`

Get the package, for example with Git:

``` sh
$ cd /var/www
$ git clone https://github.com/retifrav/rclone-rc-web-gui.git
$ sudo chown -R www-data:www-data /var/www/rclone-rc-web-gui /var/www/html
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
User=SOME-USER

[Install]
WantedBy=multi-user.target
```

here:

- `http://IP-ADDRESS-OR-DOMAIN` - the requests will be coming from the same server, so you need to provide here either the IP address of that server or its domain, if you have one. In my case it's just a server in my local network, so I've set this to `http://192.168.1.11` (*static MAC-binded IP address of my server*);
- `SOME-USER` - a user from which `rclone` will be run, perhaps it's a good idea to create a new user for this purpose and limit its access to just one folder such as `/media/`;
- `WorkingDirectory=/media/` - if you'll have your local filesystem as one of the rclone's remote too, then `/media/` would be a starting folder. For me that's where I mount external disks, so it makes sense;
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

Set the credentials (*the same ones that are in `/home/SOME-USER/.htpasswd`*), adjust the host value and set the empty port:

``` sh
$ sudo -u www-data nano /var/www/rclone-rc-web-gui/js/settings.js
```
``` js
var rcloneHost = "http://IP-ADDRESS-OR-DOMAIN/rclone";
var rclonePort = "";
var rcloneUser = "USERNAME-FROM-HTPASSWD";
var rclonePass = "PASSWORD-FROM-HTPASSWD";
```

Add some remotes to rclone config, if you haven't yet:

``` sh
$ rclone config
```

Now you should be able to access the web GUI on <http://IP-ADDRESS-OR-DOMAIN/rclone/>.

### Configuration

There are several settings available for you to configure in `/js/settings.js`.

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
        "canQueryDisk": false
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

That also means that once you close the browser or just this tab, the queue will no longer exist. However, all the ongoing transfers will of course still be there, as they are already being handled by `rclone` ([_async = true](https://rclone.org/rc/#running-asynchronous-jobs-with-async-true)).

### Search

Having a long list of files, one would like to be able to quickly find a file of interest. But as web-browser's own search (`CTRL/CMD + F`) already works fine, I see no point in implementing my own search.

## Support

I've created this project mostly for myself. So it's better to state right away that there is basically no support and that I am not responsible for any possible data loss you might get from using this project. In fact, I don't recommend you to rely on it for anything important, and certainly don't use it on servers with valuable data.

Also note, that since I use Mozilla Firefox as my main web-browser, that's where I did all the testing, and I've spent very little to none effort on maintaining cross-browser-ability.

If you discover any issues/bugs, report them [here](https://github.com/retifrav/rclone-rc-web-gui/issues).

## 3rd-party

### Dependencies

The project doesn't use any external libraries/frameworks, it's just plain HTML/CSS/JS.

### Resources

- icons are from [Bootstrap Icons](https://icons.getbootstrap.com/)
- favicon is from [rclone website](https://rclone.org/)
