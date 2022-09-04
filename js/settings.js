var guiVersion = "0.1.2";

var rcloneHost = "http://127.0.0.1";
var rclonePort = "5572"; // leave it empty (""), if you are using a custom path (not just "/") and/or reverse-proxy
var rcloneUser = "YOUR-USERNAME";
var rclonePass = "YOUR-PASSWORD";

var asyncOperations = [
    "/sync/copy",
    "/sync/move",
    "/operations/purge",
    "/operations/copyfile",
    "/operations/movefile",
    "/operations/deletefile"
]

var remotes = {
    "someExampleRemote": {
        "startingFolder": "path/to/some/path/there",
        "canQueryDisk": true,
        "pathToQueryDisk": ""
    }
}

timerRefreshEnabled = true;
timerRefreshView = 2000;
timerProcessQueue = 5000;
