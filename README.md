# Web GUI for rclone-rc

- [Localhost example](#localhost-example)
- [Possible issues](#possible-issues)
  - [Missing/wrong username/password](#missingwrong-usernamepassword)
  - [CORS header does not match](#cors-header-does-not-match)

An web-based GUI for [rclone rcd](https://rclone.org/commands/rclone_rcd/).

This is not a "wrapper" for running **rclone** via CLI. This is a GUI for sending HTTP requests to rclone running in remote control mode via [rc API](https://rclone.org/rc/).

## Localhost example

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

## Possible issues

### Missing/wrong username/password

If you get

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
