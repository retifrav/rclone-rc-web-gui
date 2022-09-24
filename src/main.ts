import * as settings from "./settings.js";
import * as functions from "./functions.js";

type QueueItem = {
    "dtAdded": Date,
    "operationType": string,
    "dataType": string,
    "dataPath": string,
    "sourcePath": string,
    "targetPath": string,
    "dstFS": string,
    "filesPanelID": string
}
const transfersQueue: Array<QueueItem> = []

let settingsOpen: boolean = false;

const rcloneOS: HTMLSpanElement =
    document.getElementById("rcloneOS") as HTMLSpanElement;
const rcloneVersion: HTMLSpanElement =
    document.getElementById("rcloneVersion") as HTMLSpanElement;
const guiVersion: HTMLSpanElement =
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
const inputRefresh: HTMLDivElement =
    document.getElementById("inputRefresh") as HTMLDivElement;

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

const leftPanelCommandCopy: HTMLButtonElement =
    document.getElementById("leftPanelCommandCopy") as HTMLButtonElement;
const rightPanelCommandCopy: HTMLButtonElement =
    document.getElementById("rightPanelCommandCopy") as HTMLButtonElement;
const leftPanelCommandMove: HTMLButtonElement =
    document.getElementById("leftPanelCommandMove") as HTMLButtonElement;
const rightPanelCommandMove: HTMLButtonElement =
    document.getElementById("rightPanelCommandMove") as HTMLButtonElement;
const leftPanelCommandDelete: HTMLButtonElement =
    document.getElementById("leftPanelCommandDelete") as HTMLButtonElement;
const rightPanelCommandDelete: HTMLButtonElement =
    document.getElementById("rightPanelCommandDelete") as HTMLButtonElement;
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
const leftPanelCommandRefresh: HTMLButtonElement =
    document.getElementById("leftPanelCommandRefresh") as HTMLButtonElement;
const rightPanelCommandRefresh: HTMLButtonElement =
    document.getElementById("rightPanelCommandRefresh") as HTMLButtonElement;

window.onload = () =>
{
    initialize();

    settingsChbxPolling.checked = settings.userSettings.timerRefreshEnabled;

    btnSettings.addEventListener(
        "click",
        function()
        {
            if (settingsOpen === false)
            {
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

    inputRefreshView.addEventListener(
        "change",
        function()
        {
            const val = parseInt(this.value);

            if(Number.isNaN(val))
            {
                alert("This value must be a number.");
                inputRefreshView.value = settings.userSettings.timerRefreshView.toString();
                return;
            }

            if(val < 1 || val > 120)
            {
                alert("This value can't be less than 1 or greater than 120.");
                inputRefreshView.value = settings.userSettings.timerRefreshView.toString();
                return;
            }

            settings.userSettings.timerRefreshView = val;

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
    leftPanelCommandShowCreateFolder.addEventListener(
        "click",
        function() { showCreateFolder(this); }
    );
    rightPanelCommandShowCreateFolder.addEventListener(
        "click",
        function() { showCreateFolder(this); }
    );
    leftPanelCommandCreateFolder.addEventListener(
        "click",
        function() { createFolderClicked(this, "leftPanelFiles"); }
    );
    rightPanelCommandCreateFolder.addEventListener(
        "click",
        function() { createFolderClicked(this, "rightPanelFiles"); }
    );
    leftPanelCommandHideCreateFolder.addEventListener(
        "click",
        function() { hideCreateFolder(this); }
    );
    rightPanelCommandHideCreateFolder.addEventListener(
        "click",
        function() { hideCreateFolder(this) }
    );
    leftPanelCommandRefresh.addEventListener(
        "click",
        function() { refreshClicked("leftPanelFiles"); }
    );
    rightPanelCommandRefresh.addEventListener(
        "click",
        function() { refreshClicked("rightPanelFiles"); }
    );
}

function timerRefreshViewFunction()
{
    if (settings.userSettings.timerRefreshEnabled === true)
    {
        refreshView();
    }
}

function initialize()
{
    // get versions
    sendRequestToRclone(
        "/core/version",
        null,
        function(rez: functions.rcVersion)
        {
            rcloneOS.textContent = rez["os"].concat(" (", rez["arch"], ")");
            rcloneVersion.textContent = rez["version"];
            guiVersion.textContent = settings.guiVersion;
        }
    );

    // get remotes
    sendRequestToRclone("/config/listremotes", null, function(rez: functions.rcRemotes)
    {
        updateRemotesSelects(leftPanelRemote, "leftPanelFiles", rez);
        updateRemotesSelects(rightPanelRemote, "rightPanelFiles", rez);
    });

    if (settings.userSettings.timerRefreshEnabled === false)
    {
        indicatorGuiFrozen.style.display = "block";
    }

    inputRefreshView.value = settings.userSettings.timerRefreshView.toString();

    refreshView();
}

function sendRequestToRclone(query: string, params: functions.rcRequest | null, fn: Function)
{
    let url = settings.rcloneHost.concat(query);
    let xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader(
        "Authorization",
        "Basic " + btoa(settings.rcloneUser.concat(":", settings.rclonePass))
    );

    // console.group("Command:", query);
    // console.debug("URL:", url);
    if (params === null) { xhr.send(); }
    else
    {
        if (settings.asyncOperations.includes(query))
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
            console.error("Error, HTTP status code:", xhr.status);
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
        // try to get available disk space
        if (settings.remotes[remote] !== undefined && settings.remotes[remote]["canQueryDisk"] === true)
        {
            const params: functions.rcRequest = {
                "fs": remote.concat(":/", settings.remotes[remote]["pathToQueryDisk"])
            };
            sendRequestToRclone("/operations/about", params, function(rez: functions.rcAbout)
            {
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
    openPath(
        remote.concat(
            ":/",
            settings.remotes[remote] === undefined ? "" : settings.remotes[remote]["startingFolder"]
        ),
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
    const oneLevelUpPath = basePath.substring(0, lastSlash - 1).replace(/'/g, "\\'");
    const pathHint = path.replace(/^.*:/, "");

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
            src: "./images/file.svg"
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
    sendRequestToRclone("/operations/list", params, function(rez: {list: functions.rcListItem[]})
    {
        ((filesPanel.parentNode!.parentNode as HTMLDivElement)
            .getElementsByClassName("loadingAnimation")[0] as HTMLDivElement
        ).style.display = "none";

        if (rez === null)
        {
            console.error("Request returned a null value, looks like there is something wrong with the request");
            return;
        }

        const listOfFilesAndFolders: functions.rcListItem[] = rez["list"];
        listOfFilesAndFolders.sort(functions.sortFilesAndFolders);
        //console.table(listOfFilesAndFolders);
        (filesPanel.parentNode!.parentNode as HTMLDivElement)
            .getElementsByClassName("filesCount")[0].textContent = listOfFilesAndFolders.length.toString();
        for (let r in listOfFilesAndFolders)
        {
            let fileName = listOfFilesAndFolders[r]["Name"];
            let fileNamePath = functions.panelsPaths[filesPanelID].concat("/", fileName);

            let folderNamePath = basePath.concat(listOfFilesAndFolders[r]["Path"]);

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
                        //dataset: { type: "folder", path: folderNamePath } // readonly, can't assign
                    }
                );
                // not very convenient
                // const dataset: {[key: string]: string} = { type: "folder", path: folderNamePath };
                // for (const d in dataset) {
                //     divFileListItem.setAttribute(`data-${d}`, dataset[d]);
                // }
                // seems to be the best way to assign dataset attributes
                Object.assign(
                    divFileListItem.dataset,
                    {
                        type: "folder",
                        path: folderNamePath
                    }
                );
                divFileListItem.addEventListener(
                    "click",
                    () =>
                    {
                        openPath(folderNamePath.replace(/'/g, "\\'"), filesPanelID);
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
                        path: fileNamePath
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

function updateCurrentTransfers(currentTransfers: functions.rcTransfer[])
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

    if (!addQueueElementsOnly) // add items from current transfers list
    {
        currentTransfersCount.textContent = currentTransfers.length.toString();
        currentTransfers.sort(functions.sortJobs);
        for (let t = 0; t < currentTransfers.length; t++)
        {
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
                    document.createTextNode(functions.getHumanReadableValue(currentTransfers[t]["speed"], "/s"))
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
                        value: currentTransfers[t]["percentage"],
                        max: 100
                    }
                )
            );
            // cancel
            const imgCancel: HTMLImageElement = Object.assign(
                document.createElement("img"),
                {
                    src: "./images/x-square.svg"
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
                src: "./images/x-square.svg"
            }
        );
        imgCancel.addEventListener(
            "click",
            function() { removeFromQueue(this, q); }
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

function updateCompletedTransfers(completedTransfers: functions.rcTransfer[])
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

        const spanOK: string = "<span style='color:green;'>OK</span>";
        const spanFAIL: string = "<span style='color:red;'>error</span>";
        const tr: string = `<tr>
            <td>${new Date(completedTransfers[t]["started_at"]).toLocaleString("en-GB")}</td>
            <td>${completedTransfers[t]["error"] === "" ? spanOK : spanFAIL}</td>
            <td class="canBeLong">${completedTransfers[t]["name"]}</td>
            <td>${functions.getHumanReadableValue(completedTransfers[t]["size"], "")}</td>
            </tr>`;
        completedTransfersBody.appendChild(functions.htmlToElement(tr));
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
    sendRequestToRclone("/core/stats", null, function(rez: functions.rcStats)
    {
        updateCurrentTransfers(rez["transferring"]);
    });
}

function getCompletedTransfers()
{
    sendRequestToRclone("/core/transferred", null, function(rez: {transferred: functions.rcTransfer[]})
    {
        //console.table(rez["transferred"]);
        updateCompletedTransfers(rez["transferred"]);
    });
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
    sendRequestToRclone("/job/stop", params, function()//function(rez: {error: string})
    {
        //console.debug(rez);
        refreshView();
    });
}

function removeFromQueue(removeBtn: HTMLImageElement, q: number)
{
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

function refreshClicked(filesPanelID: string)
{
    if (functions.panelsPaths[filesPanelID] !== "")
    {
        openPath(functions.panelsPaths[filesPanelID], filesPanelID);
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

        transfersQueue.push(
            {
                "dtAdded": new Date(),
                "operationType": operationType,
                "dataType": dataType,
                "dataPath": dataPath,
                "sourcePath": sourcePath,
                "targetPath": targetPath,
                "dstFS": dataType === "folder"
                    ? functions.getDestinationPath(filesPanelID).concat("/", targetPath)
                    : functions.getDestinationPath(filesPanelID).concat("/"),
                "filesPanelID": filesPanelID
            }
        );
        checkedBoxes[i].checked = false;
    }
}

function processQueue()
{
    // console.debug(
    //     currentTransfersCount.textContent,
    //     transfersQueue.length
    // );
    //console.table(transfersQueue);
    if ( // the queue is empty or of there already are active transfers
        currentTransfersCount.textContent !== "0"
        || !transfersQueue.length
    ) { return; }

    let firstItemFromQueue = transfersQueue.splice(0, 1)[0];

    switch (firstItemFromQueue.operationType)
    {
        case "copy":
        case "move":
            copyOrMoveOperation(
                firstItemFromQueue.operationType,
                firstItemFromQueue.dataType,
                firstItemFromQueue.dataPath,
                firstItemFromQueue.sourcePath,
                firstItemFromQueue.targetPath,
                firstItemFromQueue.dstFS,
                firstItemFromQueue.filesPanelID
                );
            break;
        case "delete":
            deleteOperation(
                firstItemFromQueue.operationType,
                firstItemFromQueue.dataType,
                firstItemFromQueue.sourcePath,
                firstItemFromQueue.targetPath,
                firstItemFromQueue.filesPanelID
                );
            break;
        default:
            console.error(`Unknown operation type: ${firstItemFromQueue.operationType}`);
    }
}

function copyOrMoveOperation(
    operationType: string,
    dataType: string,
    dataPath: string,
    sourcePath: string,
    targetPath: string,
    dstFS: string,
    _filesPanelID: string
    )
{
    //const panelToUpdate = _filesPanelID === "leftPanelFiles" ? "rightPanelFiles" : "leftPanelFiles";

    if (dataType === "folder")
    {
        const params: functions.rcRequest = {}
        params["srcFs"] = dataPath;
        params["dstFs"] = dstFS;
        if (operationType === "move")
        {
            params["deleteEmptySrcDirs"] = true;
        }
        let folderOperation = functions.getFolderOperation(operationType);
        if (folderOperation === "")
        {
            console.error(`Unknown operation type: ${operationType}`);
        }
        sendRequestToRclone(folderOperation, params, function(_rez: {jobid: string})
        {
            //console.debug("Folder operation result:", rez);
            // if (operationType === "move")
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
            "srcFs": sourcePath,
            "srcRemote": targetPath,
            "dstFs": dstFS,
            "dstRemote": targetPath
        };
        let fileOperation = functions.getFileOperation(operationType);
        if (fileOperation === "")
        {
            console.error(`Unknown operation type: ${operationType}`);
        }
        sendRequestToRclone(fileOperation, params, function(_rez: {jobid: string})
        {
            //console.debug("File operation result:", rez);
            // if (operationType === "move")
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

function deleteOperation(
    operationType: string,
    dataType: string,
    sourcePath: string,
    targetPath: string,
    _filesPanelID: string
    )
{
    let params: functions.rcRequest = {
        "fs": sourcePath,
        "remote": targetPath
    };

    let folderOperation = dataType === "folder"
        ? functions.getFolderOperation(operationType)
        : functions.getFileOperation(operationType);
    if (folderOperation === "")
    {
        console.error(`Unknown operation type: ${operationType}`);
    }
    // console.debug("Delete:", folderOperation, params);
    sendRequestToRclone(folderOperation, params, function(_rez: {jobid: string})
    {
        //console.debug("Delete result:", rez);
        //openPath(functions.panelsPaths[_filesPanelID], _filesPanelID);
    });
}

function showCreateFolder(btn: HTMLButtonElement)
{
    const panelDiv = btn.parentNode!.parentNode!.parentNode!;
    (panelDiv.querySelector(".controls") as HTMLDivElement).style.display = "none";
    (panelDiv.querySelector(".create-folder") as HTMLDivElement).style.display = "flex";
}

function hideCreateFolder(btn: HTMLButtonElement)
{
    let panelDiv = btn!.parentNode!.parentNode!;
    (panelDiv.querySelector(".create-folder") as HTMLDivElement).style.display = "none";
    (panelDiv.querySelector(".controls") as HTMLDivElement).style.display = "flex";
}

function createFolderClicked(btn: HTMLButtonElement, filesPanelID: string)
{
    const currentPath: string = functions.panelsPaths[filesPanelID];
    if (currentPath !== "")
    {
        const folderName = (btn.parentNode!.querySelector("input") as HTMLInputElement).value.trim();
        if (!folderName)
        {
            alert("A folder has no name.");
            return;
        }

        btn.style.display = "none";

        // const lastSlash = currentPath.lastIndexOf("/") + 1;
        // const basePath = lastSlash !== 0 ? currentPath.substring(0, lastSlash) : currentPath.concat("/");
        // const targetPath = currentPath.substring(lastSlash, currentPath.length).concat("/", folderName);
        //console.debug(currentPath, basePath, targetPath);

        const params: functions.rcRequest = {
            "fs": currentPath,
            "remote": folderName
        };
        sendRequestToRclone("/operations/mkdir", params, function()//function(rez)
        {
            btn.style.display = "block";
            // if (rez === null)
            // {
            //     console.error("Request returned a null value, looks like there is something wrong with the request");
            //     return;
            // }
            // else
            {
                hideCreateFolder(btn);
                refreshClicked(filesPanelID);
            }
        });
    }
    else
    {
        alert("Cannot create a folder in nowhere. Choose a remote first.");
        return;
    }
}
