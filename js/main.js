var guiVersion = "0.1.0"

var rcloneHost = "http://127.0.0.1"
var rclonePort = "5572"
var rcloneUser = "YOUR-USERNAME"
var rclonePass = "YOUR-PASSWORD"

initialize();

function initialize()
{
    // get versions
    sendRequestToRclone("/core/version", "", function (rez)
    {
        document.getElementById("rcloneOS").textContent = rez["os"].concat(" (", rez["arch"], ")");
        document.getElementById("rcloneVersion").textContent = rez["version"];
        document.getElementById("guiVersion").textContent = guiVersion;
    });

    // get remotes
    sendRequestToRclone("/config/listremotes", "", function (rez)
    {
        updateRemotesSelects("leftPanelRemote", rez);
        updateRemotesSelects("rightPanelRemote", rez);
    });
}

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
    optionsList["remotes"].forEach(function (item, key)
    {
        newSelectObj.options.add(new Option(item, item));
    });
    selectParentNode.replaceChild(newSelectObj, selectObj);
}

function remoteChanged(remotesList, filesPanelID)
{
    let remote = remotesList.value;
    if (remote === "") { return; }

    openPath(remote.concat(":/"), filesPanelID);
}

function htmlToElement(html)
{
    let template = document.createElement("template");
    html = html.trim();
    template.innerHTML = html;
    return template.content.firstChild;
}

function getIconType(mimeType)
{
    switch (mimeType)
    {
        case "inode/directory":
            return "folder.svg";
        case "video/x-matroska":
        case "video/mp4":
        case "video/webm":
            return "file-video.svg";
        case "image/jpeg":
        case "image/png":
            return "file-image.svg";
        case "text/srt; charset=utf-8":
            return "file-alt.svg";
        default:
            return "file.svg";
    }
}

function openPath(path, filesPanelID)
{
    if (path.trim() === "") { return; }

    let filesPanel = document.getElementById(filesPanelID);
    // clear the files list
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
        rez["list"].forEach(function(item)
        {
            div = "";
            if (item["IsDir"] === true)
            {
                div = div.concat("<div class='fileLine folderLine' onclick='openPath(\"", basePath.concat(item["Path"]), "\", \"", filesPanelID, "\");'>")
            }
            else
            {
                div = div.concat("<div class='fileLine'>")
            }
            div = div.concat("<img class='icon' src='/images/", getIconType(item["MimeType"]), "' />")
                .concat("<p>", item["Name"], "</p>")
                .concat("</div>");
            filesPanel.appendChild(htmlToElement(div));
        });
    });
}
