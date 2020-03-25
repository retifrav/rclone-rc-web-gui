# Web GUI for rclone rcd

- [Comparison with rclone-webui-react](#comparison-with-rclone-webui-react)
- [Examples](#examples)
  - [Localhost](#localhost)
  - [Server](#server)
- [Possible issues when serving GUI with a web-server](#possible-issues-when-serving-gui-with-a-web-server)
  - [Wrong username/password](#wrong-usernamepassword)
  - [CORS header does not match](#cors-header-does-not-match)
- [Support](#support)
- [3rd-party attributions](#3rd-party-attributions)

## About

A web-based GUI for [rclone rcd](https://rclone.org/commands/rclone_rcd/).

- this **is not** a wrapper for running `rclone` via CLI
- this **is** a web GUI for sending HTTP requests ([XMLHttpRequest](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)) to `rclone rcd` via [rc API](https://rclone.org/rc/)

### Comparison with rclone-webui-react

This project is inspired by another web-based GUI for rclone - [rclone-webui-react](https://github.com/rclone/rclone-webui-react), which provides a very good and nice-looking GUI for rclone, so big thanks to its creator.

Sadly, it has several inconveniences:

- no queue, so all the transfer go in parallel
- no way to cancel a transfer
- the GUI feels a bit overloaded and has several non-functioning controls
- transfers list has no sorting, so its elements "jump" from position to position on every view update

So here I am trying to improve all that and to implement some additional functionality. At the same time, the nice-looking part has the lowest priority for me, so expect the GUI to be very basic.

## Examples

### Localhost

Launch `rclone` remote control daemon and point it to the folder where web GUI files are:

```
cd /path/to/web/GUI
$ rclone rcd --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD .
```

Or run just the `rclone` daemon with some allowed origin:

```
$ rclone rcd --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD --rc-allow-origin http://127.0.0.1:8000
```

and serve the web GUI with some HTTP-server, for example Python:

```
$ python -m http.server 8000
```

Now open http://127.0.0.1:8000 in web-browser.

### Server

Deploy the project folder to your server and launch the `rclone` daemon (*you might want to create a `systemd` service for this*):

```
cd /path/to/web/GUI
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD .
```

I personally prefer to have only one ongoing transfer at a time, hence `--transfers 1`. Of course, that only applies to folder operations, as daemon allows to span as many operations as you want (*annoying feature, which I handle with my queue implementation*).

If your server is exposed to the internet, I would also recommend adding NGINX as a reverse proxy.

## Possible issues when serving GUI with a web-server

When you serve GUI with some web-server and not `rclone` daemon, so it's a different port and origin, you can get the following errors.

### Wrong username/password

If you get:

> Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://127.0.0.1:5572/config/listremotes. (Reason: CORS header ‘Access-Control-Allow-Origin’ missing).

or

> Access to XMLHttpRequest at 'http://127.0.0.1:5572/core/version' from origin 'http://127.0.0.1' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.

check if you have provided correct username and password.

### CORS header does not match

If you get

> Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at http://127.0.0.1:5572/core/version. (Reason: CORS header ‘Access-Control-Allow-Origin’ does not match ‘http://127.0.0.1:5572/’).

or

> Access to XMLHttpRequest at 'http://127.0.0.1:5572/core/version' from origin 'http://127.0.0.1:8000' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: The 'Access-Control-Allow-Origin' header has a value 'http://127.0.0.1:5572/' that is not equal to the supplied origin.

check if you ran `rclone rcd` with `--rc-allow-origin http://127.0.0.1:8000` option.

## Support

I've created this project mostly for myself. So it's better to state right away that there is basically no support and that I am not responsible for any possible data loss you might get from using this project. In fact, I don't recommend you to rely on it for anything important, and certainly don't use it on servers with valuable data.

Also note, that since I use Mozilla Firefox as my main web-browser, that's where I did all the testing, and I've spent very little to none effort on maintaining cross-browser-ability.

If you discover any issues/bugs, report them [here](https://github.com/retifrav/rclone-rc-web-gui/issues), but I have to apologize in advance for the possible delays, as I have very little free time outside my working hours.

## 3rd-party attributions

- icons are provided by the [Bootstrap Icons](https://icons.getbootstrap.com/), license: [MIT](https://github.com/twbs/icons/blob/master/LICENSE.md)
- favicon is taken from the [rclone logo](https://rclone.org/img/logo_on_dark__horizontal_color.svg)
