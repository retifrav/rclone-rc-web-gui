import * as settings from "./settings.js";
import * as functions from "./functions.js";
import * as folder from "./folder.js";
import * as search from "./search.js";

const guiVersion: string = "2026.7.31";

type QueueItem = {
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
const transfersQueue: Array<QueueItem> = []

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

let settingsOpen: boolean = false;

const rcloneOS: HTMLSpanElement =
    document.getElementById("rcloneOS") as HTMLSpanElement;
const rcloneVersion: HTMLSpanElement =
    document.getElementById("rcloneVersion") as HTMLSpanElement;
const guiVersionSpan: HTMLSpanElement =
    document.getElementById("guiVersion") as HTMLSpanElement;

const btnSettings: HTMLButtonElement =
    document.getElementById("btn-settings") as HTMLButtonElement;
const settingsBlock: HTMLDivElement =
    document.getElementById("settings") as HTMLDivElement;
const settingsChbxPolling: HTMLInputElement =
    document.getElementById("chbx-polling") as HTMLInputElement;
const manualRefresh: HTMLDivElement =
    document.getElementById("manualRefresh") as HTMLDivElement;
const btnManualRefresh: HTMLButtonElement =
    document.getElementById("btn-manualRefresh") as HTMLButtonElement;
const indicatorGuiFrozen: HTMLImageElement =
    document.getElementById("indicator-gui-frozen") as HTMLImageElement;
const inputRefreshView: HTMLInputElement =
    document.getElementById("input-refresh-view") as HTMLInputElement;
const outputRefreshViewValue: HTMLOutputElement =
    document.getElementById("output-refresh-view-value") as HTMLOutputElement;
const inputRefresh: HTMLDivElement =
    document.getElementById("inputRefresh") as HTMLDivElement;
const inputMaximumAllowedTransfers: HTMLInputElement =
    document.getElementById("input-maximum-allowed-transfers") as HTMLInputElement;
const outputMaximumAllowedTransfersValue: HTMLOutputElement =
    document.getElementById("output-maximum-allowed-transfers-value") as HTMLOutputElement;

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

const leftPanelRemote: HTMLSelectElement =
    document.getElementById("leftPanelRemote") as HTMLSelectElement;
const rightPanelRemote: HTMLSelectElement =
    document.getElementById("rightPanelRemote") as HTMLSelectElement;

// copy
const leftPanelCommandCopy: HTMLButtonElement =
    document.getElementById("leftPanelCommandCopy") as HTMLButtonElement;
const rightPanelCommandCopy: HTMLButtonElement =
    document.getElementById("rightPanelCommandCopy") as HTMLButtonElement;
//move
const leftPanelCommandMove: HTMLButtonElement =
    document.getElementById("leftPanelCommandMove") as HTMLButtonElement;
const rightPanelCommandMove: HTMLButtonElement =
    document.getElementById("rightPanelCommandMove") as HTMLButtonElement;
//delete
const leftPanelCommandDelete: HTMLButtonElement =
    document.getElementById("leftPanelCommandDelete") as HTMLButtonElement;
const rightPanelCommandDelete: HTMLButtonElement =
    document.getElementById("rightPanelCommandDelete") as HTMLButtonElement;
// create new folder
const leftPanelNewFolderName: HTMLInputElement =
    document.getElementById("leftPanelNewFolderName") as HTMLInputElement;
const rightPanelNewFolderName: HTMLInputElement =
    document.getElementById("rightPanelNewFolderName") as HTMLInputElement;
const leftPanelCommandShowCreateFolder: HTMLButtonElement =
    document.getElementById("leftPanelCommandShowCreateFolder") as HTMLButtonElement;
const rightPanelCommandShowCreateFolder: HTMLButtonElement =
    document.getElementById("rightPanelCommandShowCreateFolder") as HTMLButtonElement;
const leftPanelCommandCreateFolder: HTMLButtonElement =
    document.getElementById("leftPanelCommandCreateFolder") as HTMLButtonElement;
const rightPanelCommandCreateFolder: HTMLButtonElement =
    document.getElementById("rightPanelCommandCreateFolder") as HTMLButtonElement;
const leftPanelCommandHideCreateFolder: HTMLButtonElement =
    document.getElementById("leftPanelCommandHideCreateFolder") as HTMLButtonElement;
const rightPanelCommandHideCreateFolder: HTMLButtonElement =
    document.getElementById("rightPanelCommandHideCreateFolder") as HTMLButtonElement;
// refresh
const leftPanelCommandRefresh: HTMLButtonElement =
    document.getElementById("leftPanelCommandRefresh") as HTMLButtonElement;
const rightPanelCommandRefresh: HTMLButtonElement =
    document.getElementById("rightPanelCommandRefresh") as HTMLButtonElement;
// search
const leftPanelSearchQuery: HTMLInputElement =
    (document.getElementById("leftPanelSearchQuery") as HTMLInputElement);
const rightPanelSearchQuery: HTMLInputElement =
    (document.getElementById("rightPanelSearchQuery") as HTMLInputElement);
const leftPanelCommandShowSearch: HTMLButtonElement =
    document.getElementById("leftPanelCommandShowSearch") as HTMLButtonElement;
const rightPanelCommandShowSearch: HTMLButtonElement =
    document.getElementById("rightPanelCommandShowSearch") as HTMLButtonElement;
const leftPanelCommandHideSearch: HTMLButtonElement =
    document.getElementById("leftPanelCommandHideSearch") as HTMLButtonElement;
const rightPanelCommandHideSearch: HTMLButtonElement =
    document.getElementById("rightPanelCommandHideSearch") as HTMLButtonElement;

window.onload = () =>
{
    settingsChbxPolling.checked = settings.userSettings.timerRefreshEnabled;
    inputRefreshView.value = settings.userSettings.timerRefreshView.toString();
    updateRefreshViewHeat();

    // check if there is login_token query parameter present
    settings.rcloneSettings.loginToken = new URLSearchParams(
        window.location.search
    ).get("login_token");
    //console.debug(settings.rcloneSettings.loginToken);

    guiVersionSpan.textContent = guiVersion;

    // get versions
    functions.sendRequestToRclone(
        "/core/version",
        null,
        function(rez: functions.rcVersion | null)
        {
            if (rez === null) { return; }

            rcloneOS.textContent = rez["os"].concat(" (", rez["arch"], ")");
            rcloneVersion.textContent = rez["version"];
        }
    );

    // get remotes
    functions.sendRequestToRclone("/config/listremotes", null, function(rez: functions.rcRemotes | null)
    {
        if (rez === null) { return; }

        updateRemotesSelects(leftPanelRemote, "leftPanelFiles", rez);
        updateRemotesSelects(rightPanelRemote, "rightPanelFiles", rez);
    });

    if (settings.userSettings.timerRefreshEnabled === false)
    {
        indicatorGuiFrozen.style.display = "block";
    }

    getMaximumAllowedRcloneTransfers();

    leftPanelSearchQuery.value = "";
    rightPanelSearchQuery.value = "";

    refreshView();

    btnSettings.addEventListener(
        "click",
        function()
        {
            if (settingsOpen === false)
            {
                // in case it has been changed with `/options/set` in the meantime
                getMaximumAllowedRcloneTransfers();
                settingsBlock.style.display = "block";
            }
            else
            {
                settingsBlock.style.display = "none";
            }
            settingsOpen = !settingsOpen;
        }
    );

    settingsChbxPolling.addEventListener(
        "change",
        function()
        {
            if (this.checked === true)
            {
                settings.userSettings.timerRefreshEnabled = true;
                indicatorGuiFrozen.style.display = "none";
                manualRefresh.style.display = "none";
                inputRefresh.style.display = "flex";
            }
            else
            {
                settings.userSettings.timerRefreshEnabled = false;
                indicatorGuiFrozen.style.display = "block";
                inputRefresh.style.display = "none";
                manualRefresh.style.display = "flex";
            }
        }
    );

    // the span with current value and slider heat colour follow the knob,
    // but the timer itself is only restarted on `change`
    inputRefreshView.addEventListener(
        "input",
        updateRefreshViewHeat
    );
    inputRefreshView.addEventListener(
        "change",
        function()
        {
            settings.userSettings.timerRefreshView = parseInt(this.value);

            window.clearInterval(settings.userSettings.timerRefreshViewInterval);
            settings.userSettings.timerRefreshViewInterval = window.setInterval(
                timerRefreshViewFunction,
                settings.userSettings.timerRefreshView * 1000
            );
        }
    );

    btnManualRefresh.addEventListener("click", refreshView);

    settings.userSettings.timerRefreshViewInterval = window.setInterval(
        timerRefreshViewFunction,
        settings.userSettings.timerRefreshView * 1000
    );
    settings.userSettings.timerProcessQueueInterval = window.setInterval(
        processQueue,
        settings.userSettings.timerProcessQueue * 1000
    );

    // the span with current value and slider heat colour follow the knob,
    // but the actual request to rclone is only sent on `change`
    inputMaximumAllowedTransfers.addEventListener(
        "input",
        updateMaximumAllowedTransfersHeat
    );
    inputMaximumAllowedTransfers.addEventListener(
        "change",
        function()
        {
            // rclone holds the value, so there is no point in storing it
            // in `settings.userSettings`
            setMaximumAllowedRcloneTransfers(parseInt(this.value));

            // items that were queued when just a single transfer was allowed
            // did not get counted then, but now (when there is more than one
            // transfer allowed) they needs to be counted
            countQueuedFolderFiles();
        }
    );

    leftPanelCommandCopy.addEventListener(
        "click",
        function() { copyClicked(this, "leftPanelFiles"); }
    );
    rightPanelCommandCopy.addEventListener(
        "click",
        function() { copyClicked(this, "rightPanelFiles"); }
    );
    leftPanelCommandMove.addEventListener(
        "click",
        function() { moveClicked(this, "leftPanelFiles"); }
    );
    rightPanelCommandMove.addEventListener(
        "click",
        function() { moveClicked(this, "rightPanelFiles"); }
    );
    leftPanelCommandDelete.addEventListener(
        "click",
        function() { deleteClicked(this, "leftPanelFiles"); }
    );
    rightPanelCommandDelete.addEventListener(
        "click",
        function() { deleteClicked(this, "rightPanelFiles"); }
    );
    // create new folder
    leftPanelNewFolderName.addEventListener(
        "keydown", // with `keyup` the `Enter` key event gets into a "loop" on closing the alert with `Enter` too
        function(e)
        {
            switch (e.key)
            {
                case "Enter":
                    folder.createFolderClicked(leftPanelCommandCreateFolder, "leftPanelFiles");
                    break;
                case "Escape":
                    folder.hideCreateFolder(this);
                    break;
            }
        }
    );
    rightPanelNewFolderName.addEventListener(
         "keydown", // with `keyup` the `Enter` key event gets into a "loop" on closing the alert with `Enter` too
         function(e)
         {
            switch (e.key)
            {
                case "Enter":
                    folder.createFolderClicked(
                        rightPanelCommandCreateFolder,
                        "rightPanelFiles"
                    );
                    break;
                case "Escape":
                    folder.hideCreateFolder(this);
                    break;
            }
         }
    );
    leftPanelCommandShowCreateFolder.addEventListener(
        "click",
        function() { folder.showCreateFolder(this, "leftPanelFiles"); }
    );
    rightPanelCommandShowCreateFolder.addEventListener(
        "click",
        function() { folder.showCreateFolder(this, "rightPanelFiles"); }
    );
    leftPanelCommandCreateFolder.addEventListener(
        "click",
        function() { folder.createFolderClicked(this, "leftPanelFiles"); }
    );
    rightPanelCommandCreateFolder.addEventListener(
        "click",
        function() { folder.createFolderClicked(this, "rightPanelFiles"); }
    );
    leftPanelCommandHideCreateFolder.addEventListener(
        "click",
        function() { folder.hideCreateFolder(this); }
    );
    rightPanelCommandHideCreateFolder.addEventListener(
        "click",
        function() { folder.hideCreateFolder(this) }
    );
    // refresh
    leftPanelCommandRefresh.addEventListener(
        "click",
        function() { refreshClicked("leftPanelFiles"); }
    );
    rightPanelCommandRefresh.addEventListener(
        "click",
        function() { refreshClicked("rightPanelFiles"); }
    );
    // search
    leftPanelCommandShowSearch.addEventListener(
        "click",
        function() { search.showSearch(this, "leftPanelFiles"); }
    );
    rightPanelCommandShowSearch.addEventListener(
        "click",
        function() { search.showSearch(this, "rightPanelFiles"); }
    );
    // `keyup` is only for ESC (and `input` does not react to ESC). Everything that
    // actually changes the query goes through `input`, which (unlike a `keyCode` test)
    // covers digits, punctuation, non-Latin input, IME composition, paste and clearing
    leftPanelSearchQuery.addEventListener(
        "keyup",
        function(e)
        {
            if (e.key !== "Escape") { return; }
            search.hideSearch(this, "leftPanelFiles");
        }
    );
    leftPanelSearchQuery.addEventListener(
        "input",
        function()
        {
            search.searchQueryChanged(
                leftPanelSearchQuery.value,
                "leftPanelFiles"
            );
        }
    );
    rightPanelSearchQuery.addEventListener(
        "keyup",
        function(e)
        {
            if (e.key !== "Escape") { return; }
            search.hideSearch(this, "rightPanelFiles");
        }
    );
    rightPanelSearchQuery.addEventListener(
        "input",
        function()
        {
            search.searchQueryChanged(
                rightPanelSearchQuery.value,
                "rightPanelFiles"
            );
        }
    );
    leftPanelCommandHideSearch.addEventListener(
        "click",
        function() { search.hideSearch(this, "leftPanelFiles"); }
    );
    rightPanelCommandHideSearch.addEventListener(
        "click",
        function() { search.hideSearch(this, "rightPanelFiles") }
    );
}

function timerRefreshViewFunction()
{
    if (settings.userSettings.timerRefreshEnabled === true)
    {
        refreshView();
    }
}

function updateRemotesSelects(
    panelRemote: HTMLSelectElement,
    panelFilesName: string,
    optionsList: functions.rcRemotes
    )
{
    const newSelectObj: HTMLSelectElement = panelRemote.cloneNode(false) as HTMLSelectElement;
    newSelectObj.options.add(new Option("- choose a remote -", ""));
    for (const o in optionsList["remotes"])
    {
        const remote: string = optionsList["remotes"][o];
        let remoteText = remote;

        let availableDiskSpace = undefined;
        // using `Object.hasOwn` instead of a bare `!== undefined`, because a remote can be named
        // using a "reserved" Object member name (`toString`, `valueOf`, `constructor`, etc)
        const remoteSettings = Object.hasOwn(settings.remotes, remote)
            ? settings.remotes[remote]
            : undefined;
        // try to get available disk space
        if (remoteSettings !== undefined && remoteSettings["canQueryDisk"] === true)
        {
            const pathToQueryDisk: string = remoteSettings["pathToQueryDisk"] === undefined
                ? ""
                : remoteSettings["pathToQueryDisk"];
            const params: functions.rcRequest = {
                "fs": remote.concat(":/", pathToQueryDisk)
            };
            functions.sendRequestToRclone("/operations/about", params, function(rez: functions.rcAbout | null)
            {
                // the disk query is a nice-to-have, not required, so if it fails, adding the remote
                // to the list should not fail along with it - instead it should just "lose" the suffix
                // and get added to the list anyway
                if (rez === null)
                {
                    newSelectObj.options.add(new Option(remoteText, remote));
                    return;
                }

                availableDiskSpace = functions.getHumanReadableValue(rez["free"], "");
                remoteText = remoteText.concat(` (${availableDiskSpace} left)`);
                newSelectObj.options.add(new Option(remoteText, remote));
            });
        }
        else
        {
            newSelectObj.options.add(new Option(remoteText, remote));
        }
    }
    newSelectObj.addEventListener(
        "change",
        function() { remoteChanged(this, panelFilesName); }
    );
    panelRemote.parentNode!.replaceChild(newSelectObj, panelRemote);
}

function remoteChanged(remotesList: HTMLSelectElement, filesPanelID: string)
{
    const remote = remotesList.value;
    if (remote === "") { return; }

    //console.debug(remotes[remote]);

    // the `Object.hasOwn` is for the same reason as in `updateRemotesSelects()`
    //
    // checking every field because `js/settings.js` is edited by a user and is not
    // checked for types, so `startingFolder` might be missing, making a literal
    // "undefined" string being added to the path (`remote:/undefined`)
    const remoteSettings = Object.hasOwn(settings.remotes, remote)
        ? settings.remotes[remote]
        : undefined;
    const startingFolder: string =
        remoteSettings === undefined || remoteSettings["startingFolder"] === undefined
            ? ""
            : remoteSettings["startingFolder"];
    openPath(
        remote.concat(":/", startingFolder),
        filesPanelID
    );
}

function openPath(path: string, filesPanelID: string)
{
    //console.debug(path);

    if (path.trim() === "") { return; }

    const filesPanel: HTMLDivElement = document.getElementById(filesPanelID) as HTMLDivElement;
    while (filesPanel.firstChild) { filesPanel.removeChild(filesPanel.firstChild); }

    (filesPanel.parentNode!.parentNode! as HTMLDivElement)
        .getElementsByClassName("filesCount")[0].textContent = "-";

    //const firstSlash = path.indexOf("/") + 1;
    const lastSlash = path.lastIndexOf("/") + 1;
    const basePath = lastSlash !== 0 ? path.substring(0, lastSlash) : path.concat("/");
    //const currentPath = path.substring(firstSlash, path.length);
    const nextPath = lastSlash !== 0 ? path.substring(lastSlash, path.length) : "";
    const oneLevelUpPath = basePath.substring(0, lastSlash - 1);
    const pathHint = path.replace(/^[^:]*:/, "");

    //console.group("Paths");
    // console.debug("Last slash", lastSlash);
    //console.debug("Path:", path);
    //console.debug("Base path:", basePath);
    //console.debug("Current path:", currentPath);
    //console.debug("Next path:", nextPath);
    //console.groupEnd();

    functions.panelsPaths[filesPanelID] = path;

    const divFileLine: HTMLDivElement = Object.assign(
        document.createElement("div"),
        {
            className: "fileLine folderLine"
        }
    );
    divFileLine.addEventListener(
        "click",
        () =>
        {
            openPath(oneLevelUpPath, filesPanelID);
        }
    );

    const img: HTMLImageElement = Object.assign(
        document.createElement("img"),
        {
            className: "icon",
            src: "./images/arrow-90deg-up.svg"
        }
    );
    divFileLine.appendChild(img);

    const p: HTMLParagraphElement = document.createElement("p");
    const span: HTMLSpanElement = Object.assign(
        document.createElement("span"),
        {
            className: "path-hint"
        }
    );
    const spanContent: Text = document.createTextNode(`${pathHint == "/" ? "" : pathHint}/`);
    const spanContentTwoDots: Text = document.createTextNode("..");
    span.appendChild(spanContent);
    p.appendChild(span);
    p.appendChild(spanContentTwoDots);
    //.concat(`<img src="./images/info-square.svg" style="margin-left:auto;" title="${oneLevelUpPath}">`)
    divFileLine.appendChild(p);

    filesPanel.appendChild(divFileLine);

    filesPanel.appendChild(functions.htmlToElement("<div class='loadingAnimation'></div>"));

    let params: functions.rcRequest = {
        "fs": basePath,
        "remote": nextPath
    };
    functions.sendRequestToRclone("/operations/list", params, function(rez: {list: functions.rcListItem[]} | null)
    {
        ((filesPanel.parentNode!.parentNode as HTMLDivElement)
            .getElementsByClassName("loadingAnimation")[0] as HTMLDivElement
        ).style.display = "none";

        if (rez === null)
        {
            console.error(
                "Request returned a null value, looks like there is something wrong with the request"
            );
            return;
        }

        const listOfFilesAndFolders: functions.rcListItem[] = rez["list"];
        listOfFilesAndFolders.sort(functions.sortFilesAndFolders);
        //console.table(listOfFilesAndFolders);
        (filesPanel.parentNode!.parentNode as HTMLDivElement)
            .getElementsByClassName("filesCount")[0].textContent =
                listOfFilesAndFolders.length.toString();
        for (let r in listOfFilesAndFolders)
        {
            let fileName = listOfFilesAndFolders[r]["Name"];
            let itemPath = basePath.concat(listOfFilesAndFolders[r]["Path"]);

            const divFileList: HTMLDivElement = document.createElement("div");
            divFileList.classList.add("file-list-item");

            // const inputCheckbox: HTMLInputElement = document.createElement("input");
            // inputCheckbox.type = "checkbox";
            // inputCheckbox.name = "fileListItem";
            divFileList.appendChild(
                Object.assign(
                    document.createElement("input"),
                    {
                        type: "checkbox",
                        name: "fileListItem"
                    }
                )
            );

            let divFileListItem: HTMLDivElement = document.createElement("div");
            if (listOfFilesAndFolders[r]["IsDir"] === true)
            {
                divFileListItem = Object.assign(
                    document.createElement("div"),
                    {
                        className: "fileLine folderLine"
                        //dataset: { type: "folder", path: itemPath } // readonly, can't assign
                    }
                );
                // not very convenient
                // const dataset: {[key: string]: string} = { type: "folder", path: itemPath };
                // for (const d in dataset) {
                //     divFileListItem.setAttribute(`data-${d}`, dataset[d]);
                // }
                // seems to be the best way to assign dataset attributes
                Object.assign(
                    divFileListItem.dataset,
                    {
                        type: "folder",
                        path: itemPath
                    }
                );
                divFileListItem.addEventListener(
                    "click",
                    () =>
                    {
                        openPath(itemPath, filesPanelID);
                    }
                );
            }
            else
            {
                divFileListItem = Object.assign(
                    document.createElement("div"),
                    {
                        className: "fileLine"
                    }
                );
                Object.assign(
                    divFileListItem.dataset,
                    {
                        type: "file",
                        path: itemPath
                    }
                );
            }

            divFileListItem.appendChild(
                Object.assign(
                    document.createElement("img"),
                    {
                        classList: [ "icon" ],
                        src: `./images/${functions.getIconType(listOfFilesAndFolders[r]["MimeType"])}`
                    }
                )
            );

            const pFileNameContent: Text = document.createTextNode(fileName);
            const pFileName: HTMLParagraphElement = document.createElement("p");
            pFileName.appendChild(pFileNameContent);
            divFileListItem.appendChild(pFileName);

            divFileList.appendChild(divFileListItem);

            filesPanel.appendChild(divFileList);
        }
    });
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
        // let tr = "<tr><td>-</td><td>-</td><td>-</td></tr>";
        // completedTransfersBody.appendChild(functions.htmlToElement(tr));
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

function refreshView()
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

// heatmap-coloring the slider for UI auto-refresh frequency:
// 1 - red (every second, too frequent)
// 2 - green (every two seconds, recommended)
// 3..120 - gradually going into dark blue (less and less frequent updates)
function updateRefreshViewHeat()
{
    const value: number = parseInt(inputRefreshView.value);

    let hue: number = 0;
    let lightness: number = 42;

    if (value === 2) { hue = 120; }
    else if (value > 2)
    {
        // heatmap-coloring starts at 3, because 1 and 2 are fixed colors
        const rampEnd: number = parseInt(inputRefreshView.max);
        const fraction: number = (value - 3) / (rampEnd - 3);

        // hue stops at blue (240) halfway, so the second half of the range
        // has only the lightness left to say anything with
        hue = 120 + 120 * Math.min(fraction * 2, 1);
        if (fraction > 0.5) { lightness = 42 - 22 * (fraction - 0.5) * 2; }
    }

    inputRefreshView.style.accentColor = "hsl("
        .concat(
            Math.round(hue).toString(),
            " 75% ",
            Math.round(lightness).toString(),
            "%)"
        );

    outputRefreshViewValue.textContent = inputRefreshView.value;
}

// heatmap-coloring the slider for the number of maximum allowed transfers,
// from 1 (gree) to 20 (red), also taking into account that user might have
// launched rclone with `--transfers` being set to a higher value than 20
function updateMaximumAllowedTransfersHeat()
{
    const min: number = parseInt(inputMaximumAllowedTransfers.min);
    const max: number = parseInt(inputMaximumAllowedTransfers.max);

    const fraction: number = (parseInt(inputMaximumAllowedTransfers.value) - min) / (max - min);

    // hue 120 (green) -> 0 (red), the short way round through yellow
    inputMaximumAllowedTransfers.style.accentColor =
        // replacing `(1 - fraction)` with `Math.pow(1 - fraction, 1.6)` will put
        // amber at the midpoint and thus reach red faster
        "hsl(".concat(Math.round(120 * (1 - fraction)).toString(), " 75% 42%)");

    outputMaximumAllowedTransfersValue.textContent = inputMaximumAllowedTransfers.value;
}

// this is not a part of `refreshView()` because it only changes when rclone itself is restarted
// with a different `--transfers` value or when `/options/set` is called
function getMaximumAllowedRcloneTransfers()
{
    let params: functions.rcRequest = { "blocks": "main" };
    functions.sendRequestToRclone("/options/get", params, function(rez: functions.rcOptions | null)
    {
        if (rez === null) { return; }

        const transfers: number = rez["main"]["Transfers"];

        // user might have launched rclone with `--transfers` value higher than the slider's maximum,
        // while the range input would just clamp to its `max`, which would be incorrect and also
        // would make `getActiveQueueSlots()` allocate less slots than actually allowed,
        // so the slider gets wider to fit the real value instead
        if (transfers > parseInt(inputMaximumAllowedTransfers.max))
        {
            inputMaximumAllowedTransfers.max = transfers.toString();
        }

        inputMaximumAllowedTransfers.value = transfers.toString();
        updateMaximumAllowedTransfersHeat();
    });
}

function setMaximumAllowedRcloneTransfers(transfers: number)
{
    let params: functions.rcRequest = { "main": { "Transfers": transfers } };
    functions.sendRequestToRclone("/options/set", params, function(rez: {} | null)
    {
        // the value is only(?) ever sent after being validated, so on success rclone now has
        // exactly what the input shows, so there is no need to update anything, however
        // a failure would leave the input showing an incorrect/unsynced value
        if (rez === null) { getMaximumAllowedRcloneTransfers(); }
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

function refreshFilesListing()
{
    refreshClicked("leftPanelFiles");
    refreshClicked("rightPanelFiles");
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

// the queue rows are only redrawn on a `/core/stats` poll, so by the time a row is clicked
// its item may have moved up the queue or have been submitted and spliced already,
// so the item itself is remembered instead of its position, and a click on such a stale row
// does nothing (the row goes away with the next redraw anyway)
function removeFromQueue(removeBtn: HTMLImageElement, queueItem: QueueItem)
{
    let q: number = transfersQueue.indexOf(queueItem);
    if (q === -1) { return; }

    removeBtn.style.display = "none";
    transfersQueue.splice(q, 1);
}

function copyClicked(btn: HTMLButtonElement, filesPanelID: string)
{
    operationClicked(btn, "copy", filesPanelID);
}

function moveClicked(btn: HTMLButtonElement, filesPanelID: string)
{
    operationClicked(btn, "move", filesPanelID);
}

function deleteClicked(btn: HTMLButtonElement, filesPanelID: string)
{
    operationClicked(btn, "delete", filesPanelID);
}

export function refreshClicked(filesPanelID: string)
{
    if (functions.panelsPaths[filesPanelID] !== "")
    {
        openPath(functions.panelsPaths[filesPanelID], filesPanelID);
    }
    else
    {
        alert("Nothing to refresh, choose a remote first.");
    }
}

function operationClicked(btn: HTMLButtonElement, operationType: string, filesPanelID: string)
{
    if (operationType === "copy" || operationType === "move")
    {
        if (functions.panelsPathsHaveValue() !== true)
        {
            alert("Cannot perform an operation when one of the panels does not have a remote chosen.");
            return;
        }
    }

    btn.disabled = true;
    setTimeout(function () { btn.disabled = false; }, 5000);

    addToQueue(operationType, filesPanelID);
}

function addToQueue(operationType: string, filesPanelID: string)
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

function countQueuedFolderFiles()
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
