import { rcloneSettings } from "./settings.js";

export const asyncOperations: string[] = [
    "/sync/copy",
    "/sync/move",
    "/operations/purge",
    "/operations/copyfile",
    "/operations/movefile",
    "/operations/deletefile"
]

export const panelsPaths: {[key: string]: string} = {
    "leftPanelFiles": "",
    "rightPanelFiles": ""
}

export type rcListItem =
{
    Path: string,
    Name: string,
    Size: number,
    MimeType: string,
    ModTime: string, // ISO-8601 string, not a `Date`, as `JSON.parse()` cannot produce one
    IsDir: boolean
}

// `/core/stats` → `transferring[]` and `/core/transferred` → `transferred[]` look similar
// but are not the same object: an in-flight transfer has progress and no outcome yet,
// while a finished one has an outcome and no progress. Declaring the union of both as a single type
// was not correct, as every field seemed to be always available, so they have been split
// into separate types with only common fields in the common base type
export type rcTransferCommon =
{
    name: string,
    size: number,
    group: string
}

// `/core/stats` → `transferring[]`
//
// `bytes`, `speed` and `percentage` are optional because rclone only has them while an accounting
// object exists for the transfer: `transferMap.rcStats()` starts each entry with the name and
// size and later adds the progress. A transfer that is registered but not yet actually transferring
// the data (opening the source, hashing, waiting for a transfer slot) has no such accounting object,
// so its entry has only the name, size and group. Assigning the missing `percentage` straight to
// `<progress>.value` is a `TypeError`, so these values are all read later via an `undefined` check
export type rcTransferring = rcTransferCommon &
{
    bytes?: number,
    speed?: number,
    percentage?: number
    //eta:
    //speedAvg:
    //srcFs:
    //dstFs:
}

// `/core/transferred` → `transferred[]`
//
// the `*_at` timestamps are ISO-8601 strings, so they need(?) `new Date()` before formatting
export type rcTransferred = rcTransferCommon &
{
    bytes: number, // finished transfer always has the size, so here it is not `?`
    error: string,
    checked: boolean,
    started_at: string,
    completed_at: string
    //what:
    //srcFs:
    //dstFs:
}

export type rcVersion = {
    arch: string,
    decomposed: number[],
    goTags: string,
    goVersion: string,
    isBeta: boolean,
    isGit: boolean,
    linking: string,
    os: string,
    version: string
}

export type rcAbout = {
    free: number,
    total: number,
    used: number
}

export type rcRemotes = {
    remotes: string[]
}

export type rcRequest = {
    _async?: boolean,
    blocks?: string,
    group?: string, // `/core/stats` narrowed down to one job's group (such as `job/12`)
    remote?: string,
    jobid?: string,
    fs?: string,
    srcFs?: string,
    srcRemote?: string,
    dstFs?: string,
    dstRemote?: string,
    deleteEmptySrcDirs?: boolean,
    // per-job settings, which rclone applies to that job alone and to nothing else, here it is used
    // to allocate a number of allowed transfers to a folder operation
    _config?: {
        Transfers: number
    },
    // `/options/set` takes the option block name as the key
    main?: {
        // it really is `Transfers` with a capital `T`
        Transfers: number
    }
}

// only the `main` block is asked for, and only the values listed here are going to be used
export type rcOptions = {
    main: {
        Transfers: number
    }
}

export type rcStats = {
    bytes: number,
    checks: number,
    deletedDirs: number,
    deletes: number,
    elapsedTime: number,
    errors: number,
    eta: number | null, // `null`, not 0 (when there is nothing to estimate)
    fatalError: boolean,
    lastError?: string, // only sent once something has actually failed
    renames: number,
    retryError: boolean,
    speed: number,
    totalBytes: number,
    totalChecks: number,
    totalTransfers: number,
    transferTime: number,
    transfers: number,
    // is not part of the response when nothing is transferring
    transferring?: rcTransferring[]
}

// `/operations/size` counts (recursively) what is under the single `fs` path
// (it also can send `sizeless` when some of the files have unknown size)
export type rcSize = {
    count: number,
    bytes: number
}

// we are mostly interested in `runningIds`, while `jobids` lists the jobs that have already finished,
// and it needs to be intersected with the IDs that we submitted instead of just counting,
// because every API call over HTTP itself gets a job record too (the response always includes
// the `/job/list` request)
export type rcJobList = {
    executeId: string, // ID of the current rclone launch, which is different on every restart
    jobids: number[],
    runningIds: number[],
    finishedIds: number[]
}

// `jobid` is a number here, unlike the string in `/job/stop`
export type rcJobSubmission = {
    jobid: number,
    executeId: string
}

export function sendRequestToRclone(query: string, params: rcRequest | null, fn: Function)
{
    let url = rcloneSettings.host.concat(query);
    let xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (rcloneSettings.loginToken !== null)
    {
        xhr.setRequestHeader(
            "Authorization",
            `Basic ${rcloneSettings.loginToken}`
        );
    }
    else if (rcloneSettings.user !== null && rcloneSettings.pass !== null)
    {
        xhr.setRequestHeader(
            "Authorization",
            `Basic ${btoa(rcloneSettings.user.concat(":", rcloneSettings.pass))}`
        );
    }

    // console.group("Command:", query);
    // console.debug("URL:", url);
    if (params === null) { xhr.send(); }
    else
    {
        if (asyncOperations.includes(query))
        {
            params["_async"] = true;
        }
        // console.debug("Parameters: ", params);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(params));
    }
    // console.groupEnd();

    xhr.onload = function()
    {
        if (xhr.status != 200)
        {
            console.group("Request has failed");
            console.error(`Error, HTTP status code: ${xhr.status}`);
            if (xhr.status === 500)
            {
                let rezError = JSON.parse(xhr.response)["error"];
                if (rezError !== undefined && rezError !== null)
                {
                    console.error(rezError);
                    //alert("rclone reported an error. Check console for more details");
                }
            }
            console.groupEnd();
            fn(null);
        }
        else
        {
            //console.debug(xhr.response);
            fn(JSON.parse(xhr.response));
        }
    };

    xhr.onerror = function()
    {
        console.error("Couldn't send the request");
    };
}

export const debounce = <F extends (...args: any[]) => any>
    (func: F, waitFor: number) => {
    let timeout = 0;

    return (...args: Parameters<F>): Promise<ReturnType<F>> =>
        new Promise(resolve => {
            if (timeout) { clearTimeout(timeout); }
            timeout = setTimeout(() => resolve(func(...args)), waitFor);
        });
}

export function getIconType(mimeType: string) : string
{
    switch (mimeType)
    {
        case "inode/directory":
            return "folder.svg";
        case "video/x-matroska":
        case "video/mp4":
        case "video/webm":
            return "film.svg";
        case "audio/aac":
        case "audio/mpeg":
        case "audio/ac3":
        case "audio/flac":
            return "music-note-beamed.svg";
        case "image/jpeg":
        case "image/png":
        case "image/svg+xml":
            return "image.svg";
        case "text/srt; charset=utf-8":
        case "text/plain":
        case "text/plain; charset=utf-8":
            return "file-text.svg";
        case "application/pdf":
            return "file-richtext.svg";
        case "application/json":
        case "application/javascript":
        case "text/css":
        case "text/css; charset=utf-8":
        case "text/html":
        case "text/html; charset=utf-8":
            return "file-code.svg";
        case "application/zip":
        case "application/x-7z-compressed":
        case "application/gzip":
            return "file-zip.svg";
        default:
            return "file-earmark.svg";
    }
}

// 1048575 bytes is 1023.9990 KB, which `.toFixed(2)` will render as `1024.00`,
// but `1024.00 KB` should become `1 MB`
function fitsInRank(valueInRank: number) : boolean
{
    return Math.round(valueInRank * 100) < 1024 * 100;
}

// dropping trailing zeros
function getRankValue(valueInRank: number) : string
{
    return Number(valueInRank.toFixed(2)).toString();
}

export function getHumanReadableValue(sizeInBytes: number, metric: string) : string
{
    let rez: string = "0";
    let metricRank: string = "GB";

    let sizeInKB: number = sizeInBytes / 1024;
    let sizeInMB: number = sizeInKB / 1024;
    let sizeInGB: number = sizeInMB / 1024;

    if (Math.round(sizeInBytes) < 1024)
    {
        metricRank = "B";
        rez = Math.round(sizeInBytes).toString();
    }
    else if (fitsInRank(sizeInKB))
    {
        metricRank = "KB";
        rez = getRankValue(sizeInKB);
    }
    else if (fitsInRank(sizeInMB))
    {
        metricRank = "MB";
        rez = getRankValue(sizeInMB);
    }
    else
    {
        rez = getRankValue(sizeInGB);
    }

    return `${rez} ${metricRank}${metric}`;
}

// TODO: sort jobs with the same group (items from a folder transfer are sorted in the "wrong" order)
// called on both `transferring[]` and `transferred[]`, so it may only touch the common fields
export function sortJobs(a: rcTransferCommon, b: rcTransferCommon) : number
{
    if (a.group === undefined || b.group === undefined) { return 0; }

    var jobA = Number(
        a.group.substring(
            a.group.lastIndexOf("/") + 1,
            a.group.length
        )
    );
    var jobB = Number(
        b.group.substring(
            b.group.lastIndexOf("/") + 1,
            b.group.length
        )
    );
    if (jobA < jobB) { return -1; }
    else { return 1; }
}

export function sortFilesAndFolders(a: rcListItem, b: rcListItem) : number
{
    if (a.IsDir === true && b.IsDir === false) { return -1; }
    if (a.IsDir === false && b.IsDir === true) { return 1; }
    return 0;
}

export function getDestinationPath(currentFilePanel: string) : string
{
    if (currentFilePanel === "leftPanelFiles") { return panelsPaths["rightPanelFiles"]; }
    else { return panelsPaths["leftPanelFiles"]; }
}

export function panelsPathsHaveValue() : boolean
{
    if (panelsPaths["leftPanelFiles"] === "" || panelsPaths["rightPanelFiles"] === "")
    {
        return false;
    }
    else { return true; }
}

export function getFolderOperation(operationType: string) : string
{
    switch (operationType)
    {
        case "copy":
            return "/sync/copy";
        case "move":
            return "/sync/move";
        case "delete":
            return "/operations/purge";
        default:
            return "";
    }
}

export function getFileOperation(operationType: string) : string
{
    switch (operationType)
    {
        case "copy":
            return "/operations/copyfile";
        case "move":
            return "/operations/movefile";
        case "delete":
            return "/operations/deletefile";
        default:
            return "";
    }
}

