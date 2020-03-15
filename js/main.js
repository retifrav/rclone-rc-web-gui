var guiVersion = "0.1.0"

var rcloneHost = "http://127.0.0.1"
var rclonePort = "5572"
var rcloneUser = "pi"
var rclonePass = "iamSHERlocked"

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
    let xhr = new XMLHttpRequest();
    xhr.responseType = "application/json";
    xhr.open("POST", rcloneHost.concat(":", rclonePort, query));
    xhr.setRequestHeader("Authorization", "Basic " + btoa(rcloneUser.concat(":", rclonePass)));
    if (params === "") { xhr.send(); }
    else
    {
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(params));
    }

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
    let params = {
        "remote": "",
        "fs": remotesList.value.concat(":/")
    };
    sendRequestToRclone("/operations/list", params, function (rez)
    {
        console.table(rez["list"]);
        filesPanel = document.getElementById(filesPanelID);
        rez["list"].forEach(function(item)
        {
            let fileBlock = document.createElement("div");
            let content = document.createTextNode(item["Path"]);
            fileBlock.appendChild(content);
            filesPanel.appendChild(fileBlock);
        });
    });
}
