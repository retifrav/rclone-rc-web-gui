const guiVersion: string = "0.2.1";

var rcloneHost: string = "http://127.0.0.1:5572";
var rcloneUser: string = "YOUR-USERNAME";
var rclonePass: string = "YOUR-PASSWORD";

var asyncOperations: string[] = [
    "/sync/copy",
    "/sync/move",
    "/operations/purge",
    "/operations/copyfile",
    "/operations/movefile",
    "/operations/deletefile"
]

// TODO: properly type this structure too
var remotes = {
    "someExampleRemote": {
        "startingFolder": "path/to/some/path/there",
        "canQueryDisk": true,
        "pathToQueryDisk": ""
    }
}

var timerRefreshEnabled: boolean = true;
var timerRefreshView: number = 2; // seconds
var timerRefreshViewInterval: ReturnType<typeof setInterval> | null = null;
var timerProcessQueue: number = 5; // seconds
var timerProcessQueueInterval: ReturnType<typeof setInterval> | null = null;
