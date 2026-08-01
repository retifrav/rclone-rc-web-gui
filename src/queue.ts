import * as settings from "./settings.js";
import * as functions from "./functions.js";
import { inputMaximumAllowedTransfers } from "./settings-ui.js";
import { refreshView } from "./transfers.js";

export type QueueItem = {
    "dtAdded": Date,
    "operationType": string,
    "dataType": string,
    "dataPath": string,
    "sourcePath": string,
    "targetPath": string,
    "dstFS": string,
    "filesPanelID": string,
    // how many times rclone has refused to take this item (`rememberQueueJob()`)
    "submitFailures": number,
    // how many files a folder contains - maximum transfers that it could ever use
    // (`countQueueItemFiles()`), and `-1` here would mean that rclone failed to find out
    "fileCount": number
}
// how many times can a queue item get rejected before it stops trying and drops out for good
// (with en error to console)
const queueSubmitAttempts: number = 3;
export const transfersQueue: Array<QueueItem> = []

// the jobs submitted from the queue, which rclone still reports as running
//
// `/core/stats` only lists the files that are moving and reports nothing for a job
// that is still listing or checking, so a folder operation will look idle for as long
// as it takes to walk the source. `executeId` is kept alongside the ID because after a restart
// rclone allocates job IDs from 1 again, so it is a real risk that an ID on its own might match
// a wrong job
type ActiveQueueJob = {
    "jobid": number,
    "executeId": string,
    "dataType": string,
    // how many transfers this job was allowed when it was submitted, which is also the most it can
    // ever be charged for, as it was given that number in `_config` and cannot go beyond it
    "allocatedSlots": number
}
const activeQueueJobs: Array<ActiveQueueJob> = []

export function initQueue()
{
    settings.userSettings.timerProcessQueueInterval = window.setInterval(
        processQueue,
        settings.userSettings.timerProcessQueue * 1000
    );
}

export function addToQueue(operationType: string, filesPanelID: string)
{
    const checkedBoxes: HTMLInputElement[] = Array.from(
        (document.getElementById(filesPanelID) as HTMLDivElement)
            .querySelectorAll("input[name=fileListItem]:checked")
    );
    //console.debug(checkedBoxes, checkedBoxes.length);
    for (let i = 0; i < checkedBoxes.length; i++)
    {
        //console.debug("doing file operation");
        //console.debug(checkedBoxes[i].parentNode.parentNode.getElementsByClassName("fileLine")[0].dataset.path);

        const checkedBox: HTMLInputElement = checkedBoxes[i].nextElementSibling as HTMLInputElement;

        const dataPath = checkedBox.dataset.path!;
        const lastSlash = dataPath.lastIndexOf("/") + 1;
        const sourcePath = dataPath.substring(0, lastSlash);
        const targetPath = dataPath.substring(lastSlash, dataPath.length);

        const dataType = checkedBox.dataset.type!;

        const destinationPath = functions.getDestinationPath(filesPanelID);
        const destinationBase = destinationPath.endsWith("/")
            ? destinationPath
            : destinationPath.concat("/");

        const queueItem: QueueItem = {
            "dtAdded": new Date(),
            "operationType": operationType,
            "dataType": dataType,
            "dataPath": dataPath,
            "sourcePath": sourcePath,
            "targetPath": targetPath,
            "dstFS": dataType === "folder"
                ? destinationBase.concat(targetPath)
                : destinationBase,
            "filesPanelID": filesPanelID,
            "submitFailures": 0,
            "fileCount": -1
        };
        transfersQueue.push(queueItem);
        countQueueItemFiles(queueItem);

        checkedBoxes[i].checked = false;
    }
}

// the queue rows are only redrawn on a `/core/stats` poll, so by the time a row is clicked
// its item may have moved up the queue or have been submitted and spliced already,
// so the item itself is remembered instead of its position, and a click on such a stale row
// does nothing (the row goes away with the next redraw anyway)
export function removeFromQueue(removeBtn: HTMLImageElement, queueItem: QueueItem)
{
    let q: number = transfersQueue.indexOf(queueItem);
    if (q === -1) { return; }

    removeBtn.style.display = "none";
    transfersQueue.splice(q, 1);
}

// a folder can never use more transfers than it has files in it, and the queue has no way of knowing
// that number until something has counted its contents. In particular, rclone only does that when
// the job is running and has listed the source. So we do this counting explicitly when the item is added
// to the queue and the result is kept on the queue item object for `getQueueItemAllocation()`
function countQueueItemFiles(queueItem: QueueItem)
{
    if (queueItem.dataType !== "folder" || queueItem.operationType === "delete") { return; }

    // with a single transfer allowed there is nothing for the count to decide, and the queue is
    // a simple one-at-a-time FIFO, so walking of the source to count the files (`/operations/size`)
    // would be a (significant) waste, as this is an expensive operation for large folders
    if (getActiveQueueSlots() === 1) { return; }

    const params: functions.rcRequest = { "fs": queueItem.dataPath };
    functions.sendRequestToRclone("/operations/size", params, function(rez: functions.rcSize | null)
    {
        if (rez === null) { return; }

        queueItem.fileCount = rez["count"];
    });
}

export function countQueuedFolderFiles()
{
    for (let q = 0; q < transfersQueue.length; q++)
    {
        if (transfersQueue[q].fileCount < 0) { countQueueItemFiles(transfersQueue[q]); }
    }
}

// how many transfers may be in flight at the same time. The number of allowed transfers
// lives in rclone and is only mirrored in the settings slider, so in case anything is wrong
// there (HTML default is still showing because `/options/get` failed) it will fallback to `1`.
// A range input can not be left blank or non-numeric the way the number input before it could,
// so the `NaN` half of the guard is only there to keep the fallback total
function getActiveQueueSlots() : number
{
    let allowedTransfers: number = parseInt(inputMaximumAllowedTransfers.value);
    if (Number.isNaN(allowedTransfers) || allowedTransfers < 1) { return 1; }

    return allowedTransfers;
}

// how many transfers an item about to be submitted is allowed to use. Everything except a folder
// copy/move is a single transfer, including a delete of any kind, because rclone deletes
// with checkers and not with transfers
//
// queue slots allocation for a folder depends on the number of files it contans. When the files count
// is not known (the worst case), that folder operation gets all the available slots, because that number
// goes to rclone as the job's own `_config.Transfers` and it can not be changed afterwards,
// so if that folder was unlucky enough to start with a single available slot, then it would have
// to continue transferring all of its (potentially lots of) files on that one slot, which basically
// disregards a (likely) higher `--transfers` value
//
// to allocate available slots and manage the queue more efficiently, folders wait for the appropriate
// allowance, and what frees the queue meanwhile is `getRunningJobCost()` handing back available slots
// from finished jobs
function getQueueItemAllocation(queueItem: QueueItem, slots: number) : number
{
    if (queueItem.dataType !== "folder" || queueItem.operationType === "delete") { return 1; }

    // `-1` is `countQueueItemFiles()` not having got an answer (yet?)
    if (queueItem.fileCount < 0) { return slots; }

    // an empty folder transfers nothing, but still asks for a slot so that it is not started
    // alongside everything else at once
    if (queueItem.fileCount < 1) { return 1; }

    if (queueItem.fileCount < slots) { return queueItem.fileCount; }

    return slots;
}

// trying to use the active queue slots efficiently: if the number of allowed transfers is 3
// and there is a folder with two files, it should not use more than 2 transfers, so unused slots
// should go back to the queue
function getRunningJobCost(job: ActiveQueueJob, rezStats: functions.rcStats | null) : number
{
    // if response has nothing, then the job keeps the slots it already has
    if (rezStats === null) { return job.allocatedSlots; }

    const inFlight: number = rezStats["transferring"] === undefined
        ? 0
        : rezStats["transferring"].length;

    // here nothing is in flight and nothing has been decided yet, the job is still listing or comparing,
    // and it can still come back wanting every transfer it was allowed, so it keeps them all until
    // it reports its real status - this is what should stops another folder starting transferring
    // while this one only looks idle but actually is not
    if (inFlight === 0 && rezStats["totalTransfers"] === 0) { return job.allocatedSlots; }

    const remaining: number = rezStats["totalTransfers"] - rezStats["transfers"];
    let claim: number = inFlight > remaining ? inFlight : remaining;

    // finished transferring and doing some cleanup (an empty source directory or something),
    // so it doesn't make others wait for it anymore
    if (claim < 0) { claim = 0; }
    if (claim > job.allocatedSlots) { return job.allocatedSlots; }

    return claim;
}

// the ID of a submitted job is what tells `processQueue()` that the item is still occupying its slots
function rememberQueueJob(rez: functions.rcJobSubmission | null, queueItem: QueueItem, allocatedSlots: number)
{
    // rclone turned the submission down, so no job was started and no slots are taken. `processQueue()`
    // has already spliced the item off the front, so it goes back to the front and not to the back,
    // otherwise it will lose its place to everything down the queue. This is a submission being rejected
    // (rclone response is a non-200), so a request that never executed ideally should not get here
    // (`sendRequestToRclone` puts it into `xhr.onerror`)
    if (rez === null)
    {
        queueItem.submitFailures++;
        if (queueItem.submitFailures >= queueSubmitAttempts)
        {
            // if rclone keeps refusing an item that is likely for a good reason (unreachable remote,
            // path that is no longer valid, etc), and putting it back to queue over and over is pointless
            console.error(
                `Giving up on trying to start [${queueItem.operationType}] of [${queueItem.dataPath}] `
                + `after ${queueItem.submitFailures} failed attempts (rclone rejected all of them). This `
                + "could mean an unreachable remote, a path that is no longer valid or some other problem "
                + "of the sorts."
            );
            return;
        }

        transfersQueue.unshift(queueItem);
        return;
    }

    activeQueueJobs.push(
        {
            "jobid": rez["jobid"],
            "executeId": rez["executeId"],
            "dataType": queueItem.dataType,
            "allocatedSlots": allocatedSlots
        }
    );
}

// what is still running has to come from `/job/list` and not from the `transferring[]` (which
// the counter is built on), because it lists the files that are moving, but rclone reports neither
// `transferring` nor `checking` for a job that is still listing or comparing, so a folder operation
// will look idle for as long as it takes to walk it - and every tick would then submit another item
//
// it is queried on every tick instead of using a cached value by `refreshView()`, because this
// timer keeps running even when UI auto-refresh is off, meaning that the cached value will be frozen
function processQueue()
{
    //console.table(transfersQueue);
    //console.table(activeQueueJobs);
    if (!transfersQueue.length) { return; }

    functions.sendRequestToRclone("/job/list", null, function(rez: functions.rcJobList | null)
    {
        // when the running jobs cannot be established, nothing is submitted, and the next tick
        // tries again. Here it is not "a request is already in flight" flag, because
        // `sendRequestToRclone` does not call back on a transport error, so such a flag
        // would stay raised and block the queue
        if (rez === null) { return; }

        // forget the jobs that are no longer running: `runningIds` is intersected with the IDs
        // that were submitted. Entries from a potential previous rclone run get forgotten
        // as well, as their IDs now belong to somebody else
        for (let j = activeQueueJobs.length - 1; j >= 0; j--)
        {
            if (
                activeQueueJobs[j].executeId !== rez["executeId"]
                ||
                rez["runningIds"].includes(activeQueueJobs[j].jobid) === false
            )
            {
                activeQueueJobs.splice(j, 1);
            }
        }

        const slots: number = getActiveQueueSlots();

        if (activeQueueJobs.length === 0)
        {
            submitFromQueue(slots, slots);
            return;
        }

        // each running job is inspected (via its stats group) about what it is actually doing,
        // and responses arrive one(?) at a time, so they are counted down, and the queue is only
        // looked at once as soon as we get the last response
        //
        // to keep the queue working when UI auto-refresh is off, we do the inspection here
        // instead of relying on `refreshView()`
        let awaitingAnswers: number = activeQueueJobs.length;
        let usedSlots: number = 0;
        for (let j = 0; j < activeQueueJobs.length; j++)
        {
            const job: ActiveQueueJob = activeQueueJobs[j];
            const params: functions.rcRequest = { "group": "job/".concat(job.jobid.toString()) };
            functions.sendRequestToRclone("/core/stats", params, function(rezStats: functions.rcStats | null)
            {
                usedSlots += getRunningJobCost(job, rezStats);
                awaitingAnswers--;
                if (awaitingAnswers === 0) { submitFromQueue(slots - usedSlots, slots); }
            });
        }
    });
}

// items are taken from the queue in the order in which they were added, but items that do not "fit"
// the available slots are stepped over: for example, a folder waiting for the whole allowance
// that it needs would keep every single file down the queue waiting too, while those simply need
// one transfer each and there are in fact available slots for them to go. So such a folder will keep
// its place in the queue and will go as soon as the required allowance is available
//
// a more specific example, with the following queue:
//
// 1. Folder with 2 files;
// 2. Folder with 9 files;
// 3. Some file;
// 4. Another file.
//
// Folder #1 takes 2 slots, so there is 1 slot available, but Folder #2 needs 3 slots, so normally
// it would be waiting for all 3 (we don't want to start it with 1 slot, as the number of slots/transfers
// can't be raised for a job that is already in process, which means dead-slow transferring for this folder,
// given that our goal was exactly more than one transfer in parallel), and files #3/#4 would be waiting too
// behind it, but thanks to this implementation such a folder will be stepped over, so the queue wouldn't
// get locked
function submitFromQueue(freeSlots: number, slots: number)
{
    let submittedAnything: boolean = false;
    let q: number = 0;
    while (q < transfersQueue.length && freeSlots > 0)
    {
        const allocation: number = getQueueItemAllocation(transfersQueue[q], slots);
        if (allocation > freeSlots)
        {
            q++;
            continue;
        }

        // no `q++` here, splicing this one out brings the next item down into its place
        submitQueueItem(transfersQueue.splice(q, 1)[0], allocation);
        submittedAnything = true;
        freeSlots -= allocation;
    }

    // the queue rows are rendered by `updateCurrentTransfers()`, which only runs from the `/core/stats`,
    // so the rows of the items that have been just submitted would otherwise linger for another refresh
    // (also not doing that when UI auto-refresh is off)
    if (submittedAnything === true && settings.userSettings.timerRefreshEnabled === true)
    {
        refreshView();
    }
}

function submitQueueItem(queueItem: QueueItem, allocatedSlots: number)
{
    switch (queueItem.operationType)
    {
        case "copy":
        case "move":
            copyOrMoveOperation(queueItem, allocatedSlots);
            break;
        case "delete":
            deleteOperation(queueItem, allocatedSlots);
            break;
        default:
            console.error(`Unknown operation type: ${queueItem.operationType}`);
    }
}

function copyOrMoveOperation(queueItem: QueueItem, allocatedSlots: number)
{
    //const panelToUpdate = queueItem.filesPanelID === "leftPanelFiles" ? "rightPanelFiles" : "leftPanelFiles";

    if (queueItem.dataType === "folder")
    {
        const params: functions.rcRequest = {}
        params["srcFs"] = queueItem.dataPath;
        params["dstFs"] = queueItem.dstFS;
        // without this the job would grab the global number of `--transfers`, which would mess up the queue
        params["_config"] = { "Transfers": allocatedSlots };
        if (queueItem.operationType === "move")
        {
            params["deleteEmptySrcDirs"] = true;
        }
        let folderOperation = functions.getFolderOperation(queueItem.operationType);
        if (folderOperation === "")
        {
            console.error(`Unknown operation type: ${queueItem.operationType}`);
        }
        functions.sendRequestToRclone(folderOperation, params, function(rez: functions.rcJobSubmission | null)
        {
            //console.debug("Folder operation result:", rez);
            rememberQueueJob(rez, queueItem, allocatedSlots);
            // if (queueItem.operationType === "move")
            // {
            //     refreshFilesListing();
            // }
            // else
            // {
            //     openPath(functions.panelsPaths[panelToUpdate], panelToUpdate);
            // }
        });
    }
    else
    {
        const params: functions.rcRequest = {
            "srcFs": queueItem.sourcePath,
            "srcRemote": queueItem.targetPath,
            "dstFs": queueItem.dstFS,
            "dstRemote": queueItem.targetPath
        };
        let fileOperation = functions.getFileOperation(queueItem.operationType);
        if (fileOperation === "")
        {
            console.error(`Unknown operation type: ${queueItem.operationType}`);
        }
        functions.sendRequestToRclone(fileOperation, params, function(rez: functions.rcJobSubmission | null)
        {
            //console.debug("File operation result:", rez);
            rememberQueueJob(rez, queueItem, allocatedSlots);
            // if (queueItem.operationType === "move")
            // {
            //     refreshFilesListing();
            // }
            // else
            // {
            //     openPath(functions.panelsPaths[panelToUpdate], panelToUpdate);
            // }
        });
    }
}

function deleteOperation(queueItem: QueueItem, allocatedSlots: number)
{
    let params: functions.rcRequest = {
        "fs": queueItem.sourcePath,
        "remote": queueItem.targetPath
    };

    let folderOperation = queueItem.dataType === "folder"
        ? functions.getFolderOperation(queueItem.operationType)
        : functions.getFileOperation(queueItem.operationType);
    if (folderOperation === "")
    {
        console.error(`Unknown operation type: ${queueItem.operationType}`);
    }
    // console.debug("Delete:", folderOperation, params);
    functions.sendRequestToRclone(folderOperation, params, function(rez: functions.rcJobSubmission | null)
    {
        //console.debug("Delete result:", rez);
        rememberQueueJob(rez, queueItem, allocatedSlots);
        //openPath(functions.panelsPaths[queueItem.filesPanelID], queueItem.filesPanelID);
    });
}
