import * as settings from "./settings.js";
import * as functions from "./functions.js";
import * as folder from "./folder.js";
import * as search from "./search.js";
import { addToQueue } from "./queue.js";

// which `openPath()` call owns the panel listing. Since this function can be called once more
// while its `/operations/list` is still in flight (a folder clicked twice on a slow remote,
// refresh button clicked again, `createFolderClicked()` refreshing after a creating a new folder)
// and every callback renders into the same panel, then the older response will append its rows next
// to the newer response and will overwrite the items count with its own. To prevent that, each call
// takes the next number and only the holder of the panel's current one is allowed to render
//
// this is a counter and not a comparison of the captured `path` versus `functions.panelsPaths[filesPanelID]`
// because a refresh (or the same folder clicked twice) re-opens the same path, so both callbacks would
// find their path to still be current, and so both of them will render (which is what we are trying
// to fix here in the first place)
//
// counters are per panel, so that the two panels can list at the same time without invalidating each other
const panelsListingGeneration: {[key: string]: number} = {
    "leftPanelFiles": 0,
    "rightPanelFiles": 0
}

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

export function initPanels()
{
    // get remotes
    functions.sendRequestToRclone("/config/listremotes", null, function(rez: functions.rcRemotes | null)
    {
        if (rez === null) { return; }

        updateRemotesSelects(leftPanelRemote, "leftPanelFiles", rez);
        updateRemotesSelects(rightPanelRemote, "rightPanelFiles", rez);
    });

    leftPanelSearchQuery.value = "";
    rightPanelSearchQuery.value = "";

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

    // the search query filters the rows that are already rendered, which does not apply when
    // they are replaced by another directory listing. Leaving the search query as it was
    // would then look confusing, because the listing will not be actually filtered,
    // so the query gets emptied (but the search input stays open)
    const searchQuery: HTMLInputElement = filesPanelID === "leftPanelFiles"
        ? leftPanelSearchQuery
        : rightPanelSearchQuery;
    searchQuery.value = "";

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

    const generation: number = ++panelsListingGeneration[filesPanelID];

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

    const p: HTMLParagraphElement = Object.assign(
        document.createElement("p"),
        {
            className: "file-name"
        }
    );
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

    const loadingAnimation: HTMLDivElement = Object.assign(
        document.createElement("div"),
        {
            className: "loadingAnimation"
        }
    );
    filesPanel.appendChild(loadingAnimation);

    let params: functions.rcRequest = {
        "fs": basePath,
        "remote": nextPath
    };
    functions.sendRequestToRclone("/operations/list", params, function(rez: {list: functions.rcListItem[]} | null)
    {
        // removing instead of just hiding, because this animation is built anew on every call
        // and is never shown again, so a `display:none` leftover would remain in the panel
        // until the next call cleans it, and then `nth-child` rule would still count it,
        // which will mess up a CSS rule for zebra-striping the rows (if we'll decide to add
        // such a rule going forward)
        loadingAnimation.remove();

        if (rez === null)
        {
            console.error(
                "Request returned a null value, looks like there is something wrong with the request"
            );
            return;
        }

        // a newer `openPath()` has taken this panel over since this request went out, so the rows
        // below belong to a directory the panel is no longer showing, and so rendering them would
        // mix two listings together, while the items counter would be correct only for one of them
        //
        // it is checked here and not at the top of the callback so that a failing remote would still
        // get reported even if its failed listing has been already superseded by a newer one
        if (generation !== panelsListingGeneration[filesPanelID]) { return; }

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
            const pFileName: HTMLParagraphElement = Object.assign(
                document.createElement("p"),
                {
                    className: "file-name"
                }
            );
            pFileName.appendChild(pFileNameContent);
            divFileListItem.appendChild(pFileName);

            const itemSize: number = listOfFilesAndFolders[r]["Size"];
            // the size is for files only, rclone lies about folder's size even on locals,
            // and actual folder size can be obtained only with (recursive?) `/operations/size`,
            // which we don't want to do for a mere listing operation
            if (listOfFilesAndFolders[r]["IsDir"] === false && itemSize >= 0)
            {
                const spanFileSize: HTMLSpanElement = Object.assign(
                    document.createElement("span"),
                    {
                        className: "file-size"
                    }
                );
                spanFileSize.appendChild(
                    document.createTextNode(functions.getHumanReadableValue(itemSize, ""))
                );
                divFileListItem.appendChild(spanFileSize);
            }

            divFileList.appendChild(divFileListItem);

            filesPanel.appendChild(divFileList);
        }
    });
}

function refreshFilesListing()
{
    refreshClicked("leftPanelFiles");
    refreshClicked("rightPanelFiles");
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
