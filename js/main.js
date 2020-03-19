var guiVersion = "0.1.0"

var rcloneHost = "http://127.0.0.1"
var rclonePort = "5572"
var rcloneUser = "YOUR-USERNAME"
var rclonePass = "YOUR-PASSWORD"

initialize();

function initialize()
{
    // get versions
    sendRequestToRclone("/core/version", "", function(rez)
    {
        document.getElementById("rcloneOS").textContent = rez["os"].concat(" (", rez["arch"], ")");
        document.getElementById("rcloneVersion").textContent = rez["version"];
        document.getElementById("guiVersion").textContent = guiVersion;
    });

    // get remotes
    sendRequestToRclone("/config/listremotes", "", function(rez)
    {
        updateRemotesSelects("leftPanelRemote", rez);
        updateRemotesSelects("rightPanelRemote", rez);
    });

    refreshView();
}

window.setInterval(function () { refreshView(); }, 3000);

function sendRequestToRclone(query, params, fn)
{
    let url = rcloneHost.concat(":", rclonePort, query);
    let xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", "Basic " + btoa(rcloneUser.concat(":", rclonePass)));

    console.group("Command:", query);
    console.debug("URL:", url);
    if (params === "") { xhr.send(); }
    else
    {
        console.debug("Parameters: ", params);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(params));
    }
    console.groupEnd();

    xhr.onload = function()
    {
        if (xhr.status != 200)
        {
            console.error("Error, status ", xhr.status);
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

function updateRemotesSelects(selectID, optionsList)
{
    let selectObj = document.getElementById(selectID);
    let selectParentNode = selectObj.parentNode;
    let newSelectObj = selectObj.cloneNode(false);
    newSelectObj.options.add(new Option("- choose a remote -", ""));
    for (let o in optionsList["remotes"])
    {
        newSelectObj.options.add(new Option(optionsList["remotes"][o], optionsList["remotes"][o]));
    }
    selectParentNode.replaceChild(newSelectObj, selectObj);
}

function remoteChanged(remotesList, filesPanelID)
{
    let remote = remotesList.value;
    if (remote === "") { return; }

    openPath(remote.concat(":/"), filesPanelID);
}

function openPath(path, filesPanelID)
{
    if (path.trim() === "") { return; }

    let filesPanel = document.getElementById(filesPanelID);
    while (filesPanel.firstChild) { filesPanel.removeChild(filesPanel.firstChild); }

    filesPanel.parentNode.getElementsByClassName("filesCount")[0].textContent = "-";

    //let firstSlash = path.indexOf("/") + 1;
    let lastSlash = path.lastIndexOf("/") + 1;
    let basePath = lastSlash !== 0 ? path.substring(0, lastSlash) : path.concat("/");
    //let currentPath = path.substring(firstSlash, path.length);
    let nextPath = lastSlash !== 0 ? path.substring(lastSlash, path.length) : "";

    console.group("Paths");
    console.debug("Last slash", lastSlash);
    console.debug("Path:", path);
    console.debug("Base path:", basePath);
    //console.debug("Current path:", currentPath);
    console.debug("Next path:", nextPath);
    console.groupEnd();

    let div = "".concat("<div class='fileLine folderLine' onclick='openPath(\"", basePath.substring(0, lastSlash - 1), "\", \"", filesPanelID, "\");'>")
        .concat("<img class='icon' src='/images/file.svg' />")
        .concat("<p>..</p>")
        .concat("</div>");
    filesPanel.appendChild(htmlToElement(div));
    filesPanel.appendChild(htmlToElement("<div class='loadingAnimation'></div>"));
    let params = {
        "fs": basePath,
        "remote": nextPath
    };
    sendRequestToRclone("/operations/list", params, function(rez)
    {
        filesPanel.parentNode.getElementsByClassName("loadingAnimation")[0].style.display = "none";
        //console.table(rez["list"]);
        filesPanel.parentNode.getElementsByClassName("filesCount")[0].textContent = rez["list"].length;
        for (let r in rez["list"])
        {
            div = "";
            if (rez["list"][r]["IsDir"] === true)
            {
                div = div.concat("<div class='fileLine folderLine' onclick='openPath(\"", basePath.concat(rez["list"][r]["Path"]), "\", \"", filesPanelID, "\");'>")
            }
            else
            {
                div = div.concat("<div class='fileLine'>")
            }
            div = div.concat("<img class='icon' src='/images/", getIconType(rez["list"][r]["MimeType"]), "' />")
                .concat("<p>", rez["list"][r]["Name"], "</p>")
                .concat("</div>");
            filesPanel.appendChild(htmlToElement(div));
        }
    });
}

function updateCurrentTransfers(currentTransfers)
{
    //console.table(currentTransfers);
    let currentTransfersBody = document.getElementById("currentTransfersBody");
    while (currentTransfersBody.firstChild)
    {
        currentTransfersBody.removeChild(currentTransfersBody.firstChild);
    }

    if (currentTransfers === undefined || !currentTransfers.length)
    {
        let tr = "<tr><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>";
        currentTransfersBody.appendChild(htmlToElement(tr));
        document.getElementById("currentTransfersCount").textContent = "0";
        return;
    }

    document.getElementById("currentTransfersCount").textContent = currentTransfers.length;
    for (let t = 0; t < currentTransfers.length; t++)
    {
        let tr = `<tr>
            <td>${t + 1}</td>
            <td>${currentTransfers[t]["name"]}</td>
            <td>${getHumanReadableValue(currentTransfers[t]["size"], "")}</td>
            <td>${getHumanReadableValue(parseFloat(currentTransfers[t]["speed"]).toFixed(), "/s")}</td>
            <td><progress value="32" max="100"></progress></td>
            <td><img src="/images/window-close.svg" /></td>
            </tr>`;
        currentTransfersBody.appendChild(htmlToElement(tr));
    }
}

function updateCompletedTransfers(completedTransfers)
{
    let completedTransfersBody = document.getElementById("completedTransfersBody");
    while (completedTransfersBody.firstChild)
    {
        completedTransfersBody.removeChild(completedTransfersBody.firstChild);
    }

    if (completedTransfers === undefined || !completedTransfers.length)
    {
        let tr = "<tr><td>-</td><td>-</td><td>-</td></tr>";
        completedTransfersBody.appendChild(htmlToElement(tr));
        document.getElementById("completedTransfersCount").textContent = "0";
        return;
    }

    document.getElementById("completedTransfersCount").textContent = completedTransfers.length;
    for (let t in completedTransfers)
    {
        let tr = `<tr>
            <td>${new Date(completedTransfers[t]["started_at"]).toLocaleString("en-GB")}</td>
            <td>${completedTransfers[t]["name"]}</td>
            <td>${getHumanReadableValue(completedTransfers[t]["size"], "")}</td>
            </tr>`;
        completedTransfersBody.appendChild(htmlToElement(tr));

    }
}

function refreshView()
{
    // get current transfers
    sendRequestToRclone("/core/stats", "", function(rez)
    {
        updateCurrentTransfers(rez["transferring"]);
    });

    // get completed transfers
    sendRequestToRclone("/core/transferred", "", function(rez)
    {
        updateCompletedTransfers(rez["transferred"]);
    });
}
