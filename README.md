# Web GUI for rclone rc

- [About](#about)
  - [Use-case](#use-case)
  - [Comparison with rclone-webui-react](#comparison-with-rclone-webui-react)
- [How to use it](#how-to-use-it)
  - [Launch](#launch)
    - [Possible issues](#possible-issues)
      - [Wrong username/password](#wrong-usernamepassword)
      - [CORS header does not match](#cors-header-does-not-match)
  - [Configuration](#configuration)
  - [Queue](#queue)
  - [Search](#search)
- [Dependencies](#dependencies)
- [Support](#support)
- [License](#license)
- [3rd-party](#3rd-party)

## About

A web-based GUI for [rclone rcd](https://rclone.org/commands/rclone_rcd/), based on a concept of a two-panel file manager like Total Commander or Far Manager.

Commands are executed via HTTP requests ([XMLHttpRequest](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)), which are sent to `rclone rcd` using [rc API](https://rclone.org/rc/).

![rclone rc GUI](/screenshot.png?raw=true)

### Use-case

I have a remote seedbox and a local media server (*running on Raspberry Pi*). Naturally, I need to transfer files from seedbox to media server (*via SFTP*). And `rclone` is perfect for that (*thanks to its `rc` mode*), it only needs to have some remote GUI, so I could conveniently control it from my computers/tablets/smartphones.

More details in my [blog post](https://retifrav.github.io/blog/2019/12/26/appletv-kodi-network-share/#downloading-new-files).

### Comparison with rclone-webui-react

This project is inspired by another web-based GUI for `rclone rc` - [rclone-webui-react](https://github.com/rclone/rclone-webui-react), which provides a very good and nice-looking GUI, so big thanks to its creator. But I am not entirely happy with it, as it has several inconveniences:

- no queue, so all the transfers go in parallel
- no way to cancel a transfer
- the GUI feels a bit overloaded and has several non-functioning controls
- transfers list has no sorting, so its elements "jump" from position to position on every view update

My goal is to improve these points. Although cancelling a transfer turned out to be the [issue](https://github.com/retifrav/rclone-rc-web-gui/issues/4) that originates in the `rclone` itself.

At the same time, the nice-looking part has the lowest priority for me, so expect the GUI to be very basic.

## How to use it

First of all, set your `rclone rcd` host, port, username and password in `/js/settings.js`. Also make sure that you have your remotes configured in `~/.config/rclone/rclone.conf` on the host where you will be running `rclone rcd`.

### Launch

Start `rclone` remote control daemon and point it to the folder with web GUI:

```
cd /path/to/web/GUI
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD .
```

or

```
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD /path/to/web/GUI
```

I personally prefer to have only one ongoing transfer at a time, hence `--transfers 1`. Of course, that only applies to folder operations, as daemon allows to span as many operations as you want (*for which I implemented the [queue](#queue) functionality*).

If you want to serve web GUI files with a proper web-server, then launch `rclone` daemon and allow the origin that you'll have with that server:

```
$ rclone rcd --transfers 1 --rc-user YOUR-USERNAME --rc-pass YOUR-PASSWORD --rc-allow-origin http://127.0.0.1:8000
```

You might also want to create a service for running `rclone` daemon.

#### Possible issues

When you serve GUI with some web-server and not `rclone` daemon (*so it's a different origin*), you can get the following errors.

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

> Access to XMLHttpRequest at 'http://127.0.0.1:5572/core/version' from origin 'http://127.0.0.1:8000' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: The 'Access-Control-Allow-Origin' header has a value 'http://127.0.0.1:5572/' that is not equal to the supplied origin.

check if you ran `rclone rcd` with `--rc-allow-origin http://127.0.0.1:8000` option.

### Configuration

There are several settings available for you to configure in `/js/settings.js`.

Aside from self-explanatory variables like host, credentials and timers, there is an object for storing settings for your remotes. An example:

```
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

- we have 2 remotes: `disk` and `seedbox`
- both have `startingFolder` set, so that will be the folder opened when the remote is chosen in the files panel
- `disk` has `canQueryDisk` set to `true`, so it supports querying information about available disk space
  - in case of external disks, you'll also need to set their mounted path (`pathToQueryDisk`)

### Queue

All operations go to the queue and processed one at a time.

Obviously, since the queue is implemented on the client side, it's only your browser who knows about it, so if you add more operations from a different host, browser, or even a different tab in the same browser - all of them will go in parallel.

That also means that once you close the browser (*or just this tab*), the queue will no longer exist. However, all the ongoing transfers will of course still be there, as they are already being handled by `rclone` ([_async = true](https://rclone.org/rc/#running-asynchronous-jobs-with-async-true)).

### Search

Having a long list of files, one would like to be able to quickly find a file of interest. But since the web-browser is perfectly capable of doing so with its standard `CTRL/CMD + F` searching functionality, I see no point in implementing my own.

## Dependencies

There are none. The project doesn't use any external libraries/frameworks. It's just plain HTML/CSS/JS.

## Support

I've created this project mostly for myself. So it's better to state right away that there is basically no support and that I am not responsible for any possible data loss you might get from using this project. In fact, I don't recommend you to rely on it for anything important, and certainly don't use it on servers with valuable data.

Also note, that since I use Mozilla Firefox as my main web-browser, that's where I did all the testing, and I've spent very little to none effort on maintaining cross-browser-ability.

If you discover any issues/bugs, report them [here](https://github.com/retifrav/rclone-rc-web-gui/issues).

## License

The project is licensed under [MIT terms](/LICENSE).

## 3rd-party

- icons are from [Bootstrap Icons](https://icons.getbootstrap.com/)
- favicon is from [rclone website](https://rclone.org/)
