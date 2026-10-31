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

// every field is optional, this file is compiled once and then edited by a user
// in `js/settings.js` after deployment, so there will be no type checks for that,
// and it might end up missing a field in an entry (or no entries at all)
type Remote = {
    startingFolder?: string,
    canQueryDisk?: boolean,
    pathToQueryDisk?: string
}
export const remotes: {[key: string]: Remote | undefined} = {
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
    timerProcessQueueInterval: ReturnType<typeof setInterval> | undefined,
    // optional, because this setting was added at some point later, so there
    // are already users with their own `js/settings.js` files deployed without it
    useChecksumsForChecks?: boolean
}
export const userSettings: UserSettings = {
    timerRefreshEnabled: true,
    timerRefreshView: 2, // seconds
    timerRefreshViewInterval: undefined,
    timerProcessQueue: 5, // seconds
    timerProcessQueueInterval: undefined,
    // whether the check operation compares checksums (so not size-only) by default.
    // Using checksums is a much heavier kind of check than comparing just the sizes,
    // however unlike size-only check it does reveal differences when a destination file
    // has correct size but different content and different modification time. Also,
    // it gets actually enabled only if both remotes support a common checksum type,
    // otherwise rclone will compare only the sizes anyway
    useChecksumsForChecks: false
}

// setting this to `true` will hide the donation (red heart) button :(
//
// on the other hand, if you already made a donation, it's only natural
// that you might want to hide it
export const hideDonationButton: boolean = false;
