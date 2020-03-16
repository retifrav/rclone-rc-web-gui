# Web GUI for rclone-rc

An HTML based GUI for [rclone rc](https://rclone.org/commands/rclone_rc/).

## Localhost example

Launch `rclone` remote control demon:

```
$ rclone rcd --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD --rc-allow-origin http://127.0.0.1:8000
```

Serve the web GUI with something, for example Python:

```
$ python -m http.server 8000
```

Open http://127.0.0.1:8000 in web-browser.
