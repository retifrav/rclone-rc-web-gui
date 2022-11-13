export const guiVersion: string = "0.4.0";

type RcloneSettings = {
    host: string,
    user: string | null,
    pass: string | null,
    loginToken: string | null
}
export const rcloneSettings: RcloneSettings = {
    host: "http://127.0.0.1:5572",
    // null if --rc-no-auth, otherwise what is set in --rc-user
    user: null,
    // null if --rc-no-auth, otherwise what is set in --rc-pass
    pass: null,
    // null if there is no login_token in URL query parameters,
    // otherwise is set from there and takes over user/pass
    loginToken: null
}

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
