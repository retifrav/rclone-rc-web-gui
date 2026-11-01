import * as settings from "./settings.js";
import * as functions from "./functions.js";
import { QueueItem, queueFileCopies } from "./queue.js";
import { DialogButton, showDialog } from "./dialog.js";

// how many times in a row `/job/status` may fail for a running check before the UI gives up on it.
// rclone forgets a finished job after `--rc-job-expire-duration` (60 seconds by default), and asking
// about it after that is an error 500 `job not found`, which is not going to change on the next tick
const checkStatusAttempts: number = 3;

// a check job that the queue has submitted, until `/job/status` reports it as finished
export type RunningCheck = {
    "jobid": number,
    "executeId": string,
    "srcFs": string,
    "dstFs": string,
    "filesPanelID": string,
    // whether the job was told to compare only sizes, which the result itself does not say
    // (rclone reports the `hashType` it would have used either way)
    "sizeOnly": boolean,
    // when the UI learned about the job, which is also what its elapsed time is counted from,
    // and for a check whose own start time never arrives
    "startedAt": string,
    // how many of the source files have been looked at so far (`getCheckProgress()`)
    "processed": number,
    // `/job/status` failures in a row (`checkStatusAttempts`)
    "statusFailures": number
}

// a check job that has finished, kept for the completed transfers table and for its results dialog
export type FinishedCheck = {
    "srcFs": string,
    "dstFs": string,
    "filesPanelID": string,
    "sizeOnly": boolean,
    // `null` when rclone did not produce one: the job itself failed (an unknown remote),
    // or its result was no longer available by the time the UI asked for it
    "result": functions.rcCheckResult | null,
    // why there is no result
    "error": string,
    // how many of the source files were looked at (`finishCheckWithCount()`),
    // `-1` is when there is no result or the final stats of the job could not be fetched
    "checkedFiles": number,
    // the job's single row in the completed transfers table, which is shaped as a transfer
    // so that it can be sorted and reconciled together with the actual ones
    "entry": functions.rcTransferred
}

export const runningChecks: Array<RunningCheck> = [];

// keyed by `functions.getTransferKey()` of the `entry`, so the completed transfers table can find
// the check behind its row. After an rclone restart a job ID can come back with the same paths,
// and then the new check simply replaces the old one, so there are never two rows with one key
const finishedChecks: Map<string, FinishedCheck> = new Map();

// the stats groups of every check job, running or finished
const checkGroups: Set<string> = new Set();

// the timer is not stored in `settings.userSettings` (nothing ever needs to restart it), and it runs
// even when the UI auto-refresh is off, because rclone forgets a finished job after a minute,
// and its result with it
//
// not really great to have a forever-running timer, even though it does not really cost anything,
// but let's go with that for now
//
// alternative would be to start the interval/timer in `registerCheckJob()` when the first check arrives
// and clear it in `finishCheck()` once `runningChecks` is empty. That would remove the idle ticks,
// but would also need a stored handle and a guard against starting it twice, so not great either
export function initChecks()
{
    window.setInterval(
        pollChecks,
        settings.userSettings.timerProcessQueue * 1000
    );
}

function getCheckGroup(jobid: number) : string
{
    return "job/".concat(jobid.toString());
}

export function registerCheckJob(rez: functions.rcJobSubmission, queueItem: QueueItem)
{
    const check: RunningCheck = {
        "jobid": rez["jobid"],
        "executeId": rez["executeId"],
        "srcFs": queueItem.dataPath,
        "dstFs": queueItem.dstFS,
        "filesPanelID": queueItem.filesPanelID,
        "sizeOnly": queueItem.jobConfig.SizeOnly === true,
        "startedAt": new Date().toISOString(),
        "processed": 0,
        "statusFailures": 0
    };
    runningChecks.push(check);
    checkGroups.add(getCheckGroup(check.jobid));
}

function pollChecks()
{
    // a copy, because a check that turns out to be finished gets spliced out of the list
    const checks: RunningCheck[] = runningChecks.slice();
    for (let c = 0; c < checks.length; c++)
    {
        pollCheck(checks[c]);
    }
}

function pollCheck(check: RunningCheck)
{
    const params: functions.rcRequest = { "jobid": check.jobid.toString() };
    functions.sendRequestToRclone("/job/status", params, function(rez: functions.rcJobStatus | null)
    {
        if (rez === null)
        {
            check.statusFailures++;
            if (check.statusFailures >= checkStatusAttempts)
            {
                finishCheck(
                    check,
                    null,
                    // a `job not found` cannot tell these two apart
                    "rclone no longer has this job, so its result is not available. Either it finished "
                    + "more than --rc-job-expire-duration ago (one minute by default), or rclone "
                    + "has been restarted.",
                    "",
                    "",
                    -1
                );
            }
            return;
        }
        check.statusFailures = 0;

        // job IDs start from 1 again after a restart, so this could be somebody else's job
        if (rez["executeId"] !== check.executeId)
        {
            finishCheck(
                check,
                null,
                "rclone has been restarted while this check was running, so its result is lost.",
                "",
                "",
                -1
            );
            return;
        }

        if (rez["finished"] !== true)
        {
            getCheckProgress(check);
            return;
        }

        // a check that found differences, or got cancelled, is still a successful job,
        // and only a job that failed as such has no result to show
        if (rez["error"] !== "")
        {
            finishCheck(
                check,
                null,
                rez["error"],
                rez["startTime"],
                rez["endTime"],
                -1
            );
            return;
        }
        finishCheckWithCount(check, rez["output"], rez["startTime"], rez["endTime"]);
    });
}

// there is no total to show the progress against: rclone discovers the files as it lists them,
// its `totalChecks` is just `checks` plus the ones in flight, and `listed` counts the entries
// of both sides, folders included. Counting the source separately (`/operations/size`) would be
// a whole extra listing of it, which for a size-only check is about half as much work again,
// so the check shows only how many files it has looked at so far
//
// a file that is missing from the destination is not a check (there is nothing to compare it with),
// but it is an error, so the two together are every source file that has been looked at. Except that
// a file which differs is both a check and an error, so this runs ahead by the number of those
function getCheckProgress(check: RunningCheck)
{
    const params: functions.rcRequest = { "group": getCheckGroup(check.jobid) };
    functions.sendRequestToRclone("/core/stats", params, function(rez: functions.rcStats | null)
    {
        if (rez === null) { return; }

        check.processed = rez["checks"] + rez["errors"];
    });
}

// the count from the last `getCheckProgress()` can be a tick old, and a check that finishes within
// one tick never got it at all, so the job's stats are asked for once more now that they are final.
// rclone keeps a stats group after it has forgotten the job, so this cannot come too late
//
// by now the missing files are known by name, so unlike the progress this count does not run ahead.
// Every source file that is present in the destination is a check, the ones that differ or could not
// be read included, and every one that is not is in `missingOnDst`
function finishCheckWithCount(
    check: RunningCheck,
    result: functions.rcCheckResult,
    startTime: string,
    endTime: string
    )
{
    const params: functions.rcRequest = { "group": getCheckGroup(check.jobid) };
    functions.sendRequestToRclone("/core/stats", params, function(rez: functions.rcStats | null)
    {
        // the count is only a detail, while the result is already here, so a failed request
        // still finishes the check, just without the count
        finishCheck(
            check,
            result,
            "",
            startTime,
            endTime,
            rez === null ? -1 : rez["checks"] + result["missingOnDst"].length
        );
    });
}

function finishCheck(
    check: RunningCheck,
    result: functions.rcCheckResult | null,
    error: string,
    startTime: string,
    endTime: string,
    checkedFiles: number
    )
{
    // two ticks can have their `/job/status` in flight for the same check
    const c: number = runningChecks.indexOf(check);
    if (c === -1) { return; }
    runningChecks.splice(c, 1);

    let entryError: string = error;
    if (result !== null) { entryError = result["success"] === true ? "" : result["status"]; }

    const entry: functions.rcTransferred = {
        "name": check.srcFs.concat(" → ", check.dstFs),
        // a check transfers nothing, and its row shows no size
        "size": 0,
        "group": getCheckGroup(check.jobid),
        "bytes": 0,
        "error": entryError,
        // a check job's own row is not one of the checks that the completed transfers table filters out
        "checked": false,
        "started_at": startTime === "" ? check.startedAt : startTime,
        "completed_at": endTime === "" ? new Date().toISOString() : endTime
    };
    finishedChecks.set(
        functions.getTransferKey(entry),
        {
            "srcFs": check.srcFs,
            "dstFs": check.dstFs,
            "filesPanelID": check.filesPanelID,
            "sizeOnly": check.sizeOnly,
            "result": result,
            "error": error,
            "checkedFiles": checkedFiles,
            "entry": entry
        }
    );
}

export function getCompletedCheckEntries() : functions.rcTransferred[]
{
    return Array.from(
        finishedChecks.values(),
        function(finishedCheck: FinishedCheck) { return finishedCheck.entry; }
    );
}

export function getFinishedCheck(key: string) : FinishedCheck | undefined
{
    return finishedChecks.get(key);
}

export function isCheckGroup(group: string) : boolean
{
    return checkGroups.has(group);
}

function getComparisonDescription(
    check: FinishedCheck,
    result: functions.rcCheckResult
) : HTMLParagraphElement
{
    const p: HTMLParagraphElement = document.createElement("p");
    if (check.sizeOnly)
    {
        p.appendChild(
            document.createTextNode(
                "Only the file sizes were compared, as checksums are turned off in the settings."
            )
        );
    }
    else if (result["hashType"] === undefined || result["hashType"] === "none")
    {
        p.appendChild(
            document.createTextNode(
                "Only the file sizes were compared, as the two remotes have no checksum type in common."
            )
        );
    }
    else
    {
        p.appendChild(document.createTextNode("File sizes and "));
        const hashType: HTMLElement = document.createElement("code");
        hashType.appendChild(document.createTextNode(result["hashType"]));
        p.appendChild(hashType);
        p.appendChild(document.createTextNode(" checksums were compared."));
    }
    return p;
}

// a heading and the list of the files, nothing at all for an empty list
function addFilesList(body: (string | Node)[], heading: string, files: string[])
{
    if (files.length === 0) { return; }

    body.push(`${heading} (${files.length}):`);

    const filesList: HTMLUListElement = Object.assign(
        document.createElement("ul"),
        {
            className: "dialog-list"
        }
    );
    for (let f = 0; f < files.length; f++)
    {
        const li: HTMLLIElement = document.createElement("li");
        li.appendChild(
            Object.assign(
                document.createElement("img"),
                {
                    // rclone reports no MIME types here, so this goes by the extension alone
                    src: "./images/".concat(functions.getIconType("", files[f])),
                    alt: ""
                }
            )
        );
        const spanName: HTMLSpanElement = document.createElement("span");
        spanName.appendChild(document.createTextNode(files[f]));
        li.appendChild(spanName);
        filesList.appendChild(li);
    }
    body.push(filesList);
}

export function showCheckResult(check: FinishedCheck)
{
    const body: (string | Node)[] = [];

    const paths: HTMLParagraphElement = document.createElement("p");
    paths.appendChild(document.createTextNode("Finished checking that every file of "));
    const srcFs: HTMLElement = document.createElement("code");
    srcFs.appendChild(document.createTextNode(check.srcFs));
    paths.appendChild(srcFs);
    paths.appendChild(document.createTextNode(" is present in "));
    const dstFs: HTMLElement = document.createElement("code");
    dstFs.appendChild(document.createTextNode(check.dstFs));
    paths.appendChild(dstFs);
    paths.appendChild(document.createTextNode("."));
    body.push(paths);

    const result: functions.rcCheckResult | null = check.result;
    if (result === null)
    {
        body.push("The check has failed: ".concat(check.error));
        showDialog(
            {
                icon: "exclamation-octagon-fill-red.svg",
                title: "Check results",
                body: body,
                buttons: [
                    { label: "OK", value: "ok", style: "primary" }
                ]
            }
        );
        return;
    }

    body.push(getComparisonDescription(check, result));
    if (check.checkedFiles !== -1)
    {
        body.push(`${check.checkedFiles} ${check.checkedFiles === 1 ? "file was" : "files were"} checked.`);
    }
    body.push(
        result["success"] === true
            ? "All the files are present in the destination."
            : "Result: ".concat(result["status"], ".")
    );

    addFilesList(body, "Missing from the destination", result["missingOnDst"]);
    addFilesList(body, "Different in the destination", result["differ"]);
    addFilesList(body, "Could not be read or hashed", result["error"]);

    // a file can only be in one of the lists, but that is rclone's business, and a file queued
    // twice would just be copied twice
    const failedFiles: string[] = Array.from(
        new Set(result["missingOnDst"].concat(result["differ"], result["error"]))
    );

    let buttons: DialogButton[] = [
        { label: "OK", value: "ok", style: "primary" }
    ];
    if (failedFiles.length > 0)
    {
        if (result["differ"].length > 0)
        {
            body.push("Copying the files again will overwrite their mismatched versions in the destination.");
        }
        // it is Close that has the focus, because the copying overwrites files, so pressing Enter
        // right away should not do that
        buttons = [
            { label: "Close", value: "", autofocus: true },
            { label: "Copy the failed files again", value: "copy", style: "primary" }
        ];
    }

    showDialog(
        {
            icon: result["success"] === true
                ? "info-circle-fill-blue.svg"
                : "exclamation-triangle-fill-yellow.svg",
            title: "Check results",
            body: body,
            buttons: buttons
        }
    ).then(
        function(value: string)
        {
            if (value !== "copy") { return; }

            // the paths that the check was done for, not whatever the panels have open by now
            queueFileCopies(check.srcFs, check.dstFs, failedFiles, check.filesPanelID);
        }
    );
}
