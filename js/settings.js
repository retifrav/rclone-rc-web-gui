const guiVersion = "0.2.0";

var rcloneHost = "http://127.0.0.1:5572";
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

var timerRefreshEnabled = true;
var timerRefreshView = 2000;
var timerRefreshViewInterval = null;
var timerProcessQueue = 5000;
var timerProcessQueueInterval = null;
