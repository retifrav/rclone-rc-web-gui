import * as settings from "./settings.js";
import * as functions from "./functions.js";
import { QueueItem, transfersQueue, removeFromQueue } from "./queue.js";

const currentTransfersBlock: HTMLDivElement =
    document.getElementById("currentTransfers") as HTMLDivElement;
const currentTransfersCount: HTMLSpanElement =
    document.getElementById("currentTransfersCount") as HTMLSpanElement;
const currentTransfersBody: HTMLTableSectionElement =
    document.getElementById("currentTransfersBody") as HTMLTableSectionElement;

const completedTransfersBlock: HTMLDivElement =
    document.getElementById("completedTransfers") as HTMLDivElement;
const completedTransfersCount: HTMLSpanElement =
    document.getElementById("completedTransfersCount") as HTMLSpanElement;
const completedTransfersBody: HTMLTableSectionElement =
    document.getElementById("completedTransfersBody") as HTMLTableSectionElement;

// a rendered row of the completed transfers table, kept so that the next refresh can reuse it
// instead of building it again. The `signature` holds the fields that the row actually shows,
// so a row whose entry has changed could be distinguished from one that has not
type RenderedTransfer =
{
    tr: HTMLTableRowElement,
    signature: string
}

// every row currently in the completed transfers table, keyed by `functions.getTransferKey()`.
// Using `Map` instead of a plain object because this is a registry of DOM nodes keyed by arbitrary
// file paths, where deleting and iterating are both wanted and there is no `Object.prototype` name
// to guard against
const renderedCompletedTransfers: Map<string, RenderedTransfer> = new Map();

export function timerRefreshViewFunction()
{
    if (settings.userSettings.timerRefreshEnabled === true)
    {
        refreshView();
    }
}

// `undefined` is expected here, because `/core/stats` has no `transferring` when idle
function updateCurrentTransfers(currentTransfers: functions.rcTransferring[] | undefined)
{
    //console.table(currentTransfers);
    while (currentTransfersBody.firstChild)
    {
        currentTransfersBody.removeChild(currentTransfersBody.firstChild);
    }

    let addQueueElementsOnly = false;

    if (currentTransfers === undefined || !currentTransfers.length)
    {
        currentTransfersCount.textContent = "0";

        if (!transfersQueue.length)
        {
            currentTransfersBlock.style.display = "none";
            return;
        }
        else { addQueueElementsOnly = true; }
    }

    if (
        // add items from current transfers list
        !addQueueElementsOnly
        &&
        // the `undefined` check is redundant at runtime — `addQueueElementsOnly` is only left `false`
        // when the guard above found a non-empty array — but the flag hides that from the compiler
        currentTransfers !== undefined
    )
    {
        currentTransfersCount.textContent = currentTransfers.length.toString();
        currentTransfers.sort(functions.sortJobs);
        for (let t = 0; t < currentTransfers.length; t++)
        {
            // a transfer that rclone has registered but is not yet doing a data transfer
            // comes without its progress fields (`rcTransferring`), and `<progress>.value`
            // does not accept `undefined` (throws a `TypeError`), so both values are read
            // via a check defaulting to `0`
            const transfer: functions.rcTransferring = currentTransfers[t];
            const speed: number = transfer.speed === undefined ? 0 : transfer.speed;
            const percentage: number = transfer.percentage === undefined ? 0 : transfer.percentage;

            const tr: HTMLTableRowElement = document.createElement("tr");
            // number
            tr.appendChild(
                Object.assign(
                    document.createElement("td")
                )
            ).appendChild(
                Object.assign(
                    document.createTextNode((t + 1).toString())
                )
            );
            // name
            tr.appendChild(
                Object.assign(
                    document.createElement("td"),
                    {
                        className: "canBeLong"
                    }
                )
            ).appendChild(
                Object.assign(
                    document.createTextNode(currentTransfers[t]["name"])
                )
            );
            // size
            tr.appendChild(
                Object.assign(
                    document.createElement("td")
                )
            ).appendChild(
                Object.assign(
                    document.createTextNode(functions.getHumanReadableValue(currentTransfers[t]["size"], ""))
                )
            );
            // speed
            tr.appendChild(
                Object.assign(
                    document.createElement("td")
                )
            ).appendChild(
                Object.assign(
                    document.createTextNode(functions.getHumanReadableValue(speed, "/s"))
                )
            );
            // progress
            tr.appendChild(
                Object.assign(
                    document.createElement("td")
                )
            ).appendChild(
                Object.assign(
                    document.createElement("progress"),
                    {
                        value: percentage,
                        max: 100
                    }
                )
            );
            // cancel
            const imgCancel: HTMLImageElement = Object.assign(
                document.createElement("img"),
                {
                    src: "./images/x-square.svg",
                    title: "Be aware that if this transfer is a part of a job (such as a directory transfer), "
                           + "then the entire job gets cancelled, not just this single item"
                }
            );
            imgCancel.addEventListener(
                "click",
                function() { cancelTransfer(this, currentTransfers[t]["group"]); }
            );
            tr.appendChild(
                Object.assign(
                    document.createElement("td")
                )
            ).appendChild(imgCancel);

            currentTransfersBody.appendChild(tr);
        }
    }
    // add items from the queue
    for (let q = 0; q < transfersQueue.length; q++)
    {
        const queueItem: QueueItem = transfersQueue[q];

        const tr: HTMLTableRowElement = Object.assign(
            document.createElement("tr"),
            {
                style: "font-style:italic;"
            }
        );
        // operation type
        tr.appendChild(
            Object.assign(
                document.createElement("td")
            )
        ).appendChild(
            Object.assign(
                document.createElement("code")
            )
        ).appendChild(
            Object.assign(
                document.createTextNode(transfersQueue[q].operationType)
            )
        );
        // target
        tr.appendChild(
            Object.assign(
                document.createElement("td"),
                {
                    colSpan: 4,
                    className: "canBeLong"
                }
            )
        ).appendChild(
            Object.assign(
                document.createTextNode(transfersQueue[q].dataPath)
            )
        );
        // cancel
        const imgCancel: HTMLImageElement = Object.assign(
            document.createElement("img"),
            {
                src: "./images/x-square.svg",
                title: "Remove this job from queue"
            }
        );
        imgCancel.addEventListener(
            "click",
            function() { removeFromQueue(this, queueItem); }
        );
        tr.appendChild(
            Object.assign(
                document.createElement("td")
            )
        ).appendChild(imgCancel);

        currentTransfersBody.appendChild(tr);
    }
    currentTransfersBlock.style.display = "block";
}

// the fields of a completed transfer that its row actually shows. A transfer keeps its identity
// (`functions.getTransferKey()`) while these can still change after the row has been rendered,
// so this is what differ a row that needs rebuilding from one that can be left alone:
//
// 1. Move operation that rclone had to fall back to a copy for arrives as two entries,
//    and the outer one is the one carrying the error when the copy succeeded but deleting
//    the source did not. It becomes "done" a moment after the inner one, so a refresh can
//    catch the inner one alone and render an `OK` row that the next refresh has to turn into
//    an `error` one;
// 2. Job IDs are handed out by rclone from 1 again after a restart, so `job/4` and the same file name
//    can come back as an entirely different transfer (`/core/transferred` carries no `executeId`
//    to tell the launches apart with, unlike `/job/list`), and a differing `started_at` is what gets
//    such a row rebuilt instead of left showing the previous run's timestamp.
//
// The separator is a NUL for the same reason as in `functions.getTransferKey()` - `error` is
// whatever string rclone chose to report, and so it can hold anything at all, and a signature
// that two different transfers can share is a row that never gets updated
function getCompletedTransferSignature(transfer: functions.rcTransferred) : string
{
    return transfer["started_at"]
        + "\u0000"
        + transfer["error"]
        + "\u0000"
        + transfer["size"].toString();
}

function buildCompletedTransferRow(transfer: functions.rcTransferred) : HTMLTableRowElement
{
    const spanOutcome: HTMLSpanElement = document.createElement("span");
    spanOutcome.appendChild(
        document.createTextNode(transfer["error"] === "" ? "OK" : "error")
    );
    spanOutcome.style.color = transfer["error"] === "" ? "green" : "red";

    const tr: HTMLTableRowElement = document.createElement("tr");
    // date and time, for which one would certainly like to user a proper ISO format,
    // such as `.toISOString().slice(0,19).replace("T", " ")`, but unfortunately
    // that would be in UTC, so one would also need to convert the timezone,
    // so fuck it, `toLocaleString()` will have to do
    tr.appendChild(
        Object.assign(
            document.createElement("td")
        )
    ).appendChild(
        Object.assign(
            document.createTextNode(
                new Date(transfer["started_at"]).toLocaleString("en-GB")
            )
        )
    );
    // outcome
    tr.appendChild(
        Object.assign(
            document.createElement("td")
        )
    ).appendChild(spanOutcome);
    // name
    tr.appendChild(
        Object.assign(
            document.createElement("td"),
            {
                className: "canBeLong"
            }
        )
    ).appendChild(
        Object.assign(
            document.createTextNode(transfer["name"])
        )
    );
    // size
    tr.appendChild(
        Object.assign(
            document.createElement("td")
        )
    ).appendChild(
        Object.assign(
            document.createTextNode(functions.getHumanReadableValue(transfer["size"], ""))
        )
    );

    return tr;
}

// removes every row from `node` to the end of the table
function trimCompletedTransfers(node: ChildNode | null)
{
    while (node !== null)
    {
        const nodeToRemove: ChildNode = node;
        node = node.nextSibling;
        completedTransfersBody.removeChild(nodeToRemove);
    }
}

// renders the listing by touching only what has actually changed, so a refresh that brings
// nothing new does no DOM writes at all (it only walks the rows comparing pointers)
//
// The table used to be wiped and rebuilt from scratch on every refresh, which is every row
// re-created every couple of seconds, and `/core/transferred` can report a really lot of them:
// its ~100 entries limit is per stats group, while the UI asks for all of the groups at once,
// and every job is a group of its own, so a session with a few dozen jobs in it answers
// with thousands of entries (one measured example: 1500 entries, 684 KB of JSON, taking 86 ms
// of rebuilding every 2 seconds). Rebuilding also dropped any text selection inside the table
// on every single refresh, so a file name could not be selected and copied out of the list
// while the polling is on (that part had nothing to do with how long the list is, so it was
// always a problem and partially a reason for the "frozen UI" feature)
function reconcileCompletedTransfers(transfersToShow: functions.rcTransferred[])
{
    // rclone drops entries from its own list (every stats group gets pruned past `100 + --transfers`)
    // and it also starts over after a restart, so the rows whose entry is no longer in the response
    // have to go, otherwise the table will no longer match the rclone data
    const keysToShow: Set<string> = new Set();
    for (let t = 0; t < transfersToShow.length; t++)
    {
        keysToShow.add(functions.getTransferKey(transfersToShow[t]));
    }
    renderedCompletedTransfers.forEach(function(rendered: RenderedTransfer, key: string)
    {
        if (!keysToShow.has(key))
        {
            rendered.tr.remove();
            renderedCompletedTransfers.delete(key);
        }
    });

    // `node` is the row that is currently sitting where the next one is supposed to go,
    // so an unchanged listing walks all the way through without a single DOM write
    let node: ChildNode | null = completedTransfersBody.firstChild;
    for (let t = 0; t < transfersToShow.length; t++)
    {
        const key: string = functions.getTransferKey(transfersToShow[t]);
        const signature: string = getCompletedTransferSignature(transfersToShow[t]);
        const rendered: RenderedTransfer | undefined = renderedCompletedTransfers.get(key);

        // a transfer that has not been rendered yet
        if (rendered === undefined)
        {
            const tr: HTMLTableRowElement = buildCompletedTransferRow(transfersToShow[t]);
            completedTransfersBody.insertBefore(tr, node);
            renderedCompletedTransfers.set(key, { tr: tr, signature: signature });
            continue;
        }

        // same transfer, but something that its row shows has changed
        if (rendered.signature !== signature)
        {
            const tr: HTMLTableRowElement = buildCompletedTransferRow(transfersToShow[t]);
            // when the old row is the one in the place that the new row needs, then `node`
            // has to move on before that row gets removed. Using `remove()` instead of
            // `removeChild()` because it does nothing for an already detached row,
            // while `removeChild()` would(?) throw in that case
            if (rendered.tr === node) { node = node.nextSibling; }
            rendered.tr.remove();
            completedTransfersBody.insertBefore(tr, node);
            renderedCompletedTransfers.set(key, { tr: tr, signature: signature });
            continue;
        }

        if (rendered.tr === node) { node = node.nextSibling; }
        // the row is already rendered and unchanged, it is just not where it should be
        else { completedTransfersBody.insertBefore(rendered.tr, node); }
    }

    // whatever is left over is not a part of the listing. On the very first refresh
    // that is the placeholder row from `index.html`, which the old wipe-and-rebuild
    // used to get rid of as a side effect. Without this it would stay at the bottom
    // of the table forever, as every actual row gets inserted in front of it
    trimCompletedTransfers(node);
}

function updateCompletedTransfers(completedTransfers: functions.rcTransferred[])
{
    if (completedTransfers === undefined || !completedTransfers.length)
    {
        trimCompletedTransfers(completedTransfersBody.firstChild);
        renderedCompletedTransfers.clear();
        completedTransfersBlock.style.display = "none";
        completedTransfersCount.textContent = "0";
        return;
    }

    // checks are not actual transfers, and every move leaves a `deleting` one behind.
    // They have to go before the duplicates are collapsed, because a check carries
    // the same `group` and `name` as the transfer that it belongs to
    const actualTransfers: functions.rcTransferred[] = [];
    for (let t = 0; t < completedTransfers.length; t++)
    {
        if (completedTransfers[t]["checked"] === true) { continue; }

        actualTransfers.push(completedTransfers[t]);
    }
    // a single moved file arrives as two identical transfers when rclone had to fall back
    // from move to copy. There are more details in `collapseDuplicateTransfers()`
    const transfersToShow: functions.rcTransferred[] =
        functions.collapseDuplicateTransfers(actualTransfers);

    transfersToShow.sort(functions.sortJobs).reverse();
    reconcileCompletedTransfers(transfersToShow);

    completedTransfersCount.textContent = transfersToShow.length.toString();
    completedTransfersBlock.style.display = "block";
}

export function refreshView()
{
    getCurrentTransfers();
    getCompletedTransfers();
    //refreshFilesListing();
}

function getCurrentTransfers()
{
    functions.sendRequestToRclone("/core/stats", null, function(rez: functions.rcStats | null)
    {
        // no logging needed, `sendRequestToRclone` has already reported the failure
        if (rez === null) { return; }

        updateCurrentTransfers(rez["transferring"]);
    });
}

function getCompletedTransfers()
{
    functions.sendRequestToRclone(
        "/core/transferred",
        null,
        function(rez: {transferred: functions.rcTransferred[]} | null)
        {
            // no logging needed, `sendRequestToRclone` has already reported the failure
            if (rez === null) { return; }

            //console.table(rez["transferred"]);
            updateCompletedTransfers(rez["transferred"]);
        }
    );
}

function cancelTransfer(cancelBtn: HTMLImageElement, groupID: string)
{
    cancelBtn.style.display = "none";

    let jobID = groupID.substring(
        groupID.lastIndexOf("/") + 1,
        groupID.length
    );
    let params: functions.rcRequest = { "jobid": jobID };
    functions.sendRequestToRclone("/job/stop", params, function()//function(rez: {error: string})
    {
        //console.debug(rez);
        refreshView();
    });
}
