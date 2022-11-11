export const guiVersion: string = "0.3.0";

export var rcloneHost: string = "http://127.0.0.1:5572";

// if --rc-no-auth is provided, keep undefined, otherwise ...
export var rcloneUser: string | undefined = undefined; // ... what is set in --rc-user
export var rclonePass: string | undefined = undefined; // ... what is set in --rc-pass

export const asyncOperations: string[] = [
    "/sync/copy",
    "/sync/move",
    "/operations/purge",
    "/operations/copyfile",
    "/operations/movefile",
    "/operations/deletefile"
]

type Remote = {
    startingFolder: string,
    canQueryDisk: boolean,
    pathToQueryDisk: string
}
export const remotes: {[key: string]: Remote} = {
    "someExampleRemote": {
        "startingFolder": "path/to/some/path/there",
        "canQueryDisk": true,
        "pathToQueryDisk": ""
    }
}

type UserSettings = {
    timerRefreshEnabled: boolean,
    timerRefreshView: number,
    timerRefreshViewInterval: ReturnType<typeof setInterval> | undefined,
    timerProcessQueue: number,
    timerProcessQueueInterval: ReturnType<typeof setInterval> | undefined
}
export const userSettings: UserSettings = {
    timerRefreshEnabled: true,
    timerRefreshView: 2, // seconds
    timerRefreshViewInterval: undefined,
    timerProcessQueue: 5, // seconds
    timerProcessQueueInterval: undefined
}
