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

function updateCompletedTransfers(completedTransfers: functions.rcTransferred[])
{
    while (completedTransfersBody.firstChild)
    {
        completedTransfersBody.removeChild(completedTransfersBody.firstChild);
    }

    if (completedTransfers === undefined || !completedTransfers.length)
    {
        completedTransfersBlock.style.display = "none";
        completedTransfersCount.textContent = "0";
        return;
    }

    let completedTransfersCnt: number = 0;
    completedTransfers.sort(functions.sortJobs).reverse();
    for (let t in completedTransfers)
    {
        // don't count checks as actual transfers
        if (completedTransfers[t]["checked"] === true) //|| completedTransfers[t]["bytes"] === 0)
        { continue; }

        completedTransfersCnt++;

        const spanOutcome: HTMLSpanElement = document.createElement("span");
        spanOutcome.appendChild(
            document.createTextNode(completedTransfers[t]["error"] === "" ? "OK" : "error")
        );
        spanOutcome.style.color = completedTransfers[t]["error"] === "" ? "green" : "red";

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
                    new Date(completedTransfers[t]["started_at"]).toLocaleString("en-GB")
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
                document.createTextNode(completedTransfers[t]["name"])
            )
        );
        // size
        tr.appendChild(
            Object.assign(
                document.createElement("td")
            )
        ).appendChild(
            Object.assign(
                document.createTextNode(functions.getHumanReadableValue(completedTransfers[t]["size"], ""))
            )
        );

        completedTransfersBody.appendChild(tr);
    }
    completedTransfersCount.textContent = completedTransfersCnt.toString();
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
