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
            return "film.svg";
        case "audio/aac":
        case "audio/mpeg":
        case "audio/ac3":
            return "music-note-beamed.svg";
        case "image/jpeg":
        case "image/png":
        case "image/svg+xml":
            return "image.svg";
        case "text/srt; charset=utf-8":
        case "text/plain":
        case "text/plain; charset=utf-8":
            return "file-text.svg";
        case "application/pdf":
            return "file-richtext.svg";
        case "application/json":
        case "application/javascript":
        case "text/css":
        case "text/css; charset=utf-8":
        case "text/html":
        case "text/html; charset=utf-8":
            return "file-code.svg";
        case "application/zip":
        case "application/x-7z-compressed":
        case "application/gzip":
            return "file-zip.svg";
        default:
            return "file.svg";
    }
}

function getHumanReadableValue(sizeInBytes, metric)
{
    let rez = 0;
    let metricRank = "MB";
    let sizeInMB = sizeInBytes / 1024 / 1024;
    let sizeInGB = sizeInMB / 1024;
    if (sizeInGB < 1)
    {
        rez = parseFloat(sizeInMB).toFixed(2);
    }
    else
    {
        metricRank = "GB";
        rez = parseFloat(sizeInGB).toFixed(2);
    }
    if (isNaN(rez)) { rez = 0; }
    return `${rez} ${metricRank}${metric}`;
}

function sortJobs(a, b)
{
    if (a.group === undefined || b.group === undefined) { return 0; }

    var jobA = Number(
        a.group.substring(
            a.group.lastIndexOf("/") + 1,
            a.group.length
        )
    );
    var jobB = Number(
        b.group.substring(
            b.group.lastIndexOf("/") + 1,
            b.group.length
        )
    );
    if (jobA < jobB) { return -1; }
    else { return 1; }
}

function sortFilesAndFolders(a, b)
{
    if (a.IsDir === true && b.IsDir === false) { return -1; }
    if (a.IsDir === false && b.IsDir === true) { return 1; }
    return 0;
}

function getDestinationPath(currentFilePanel)
{
    if (currentFilePanel == "leftPanelFiles") { return panelsPaths["rightPanelFiles"]; }
    else { return panelsPaths["leftPanelFiles"]; }
}

function panelsPathsHaveValue()
{
    if (panelsPaths["leftPanelFiles"] === "" || panelsPaths["rightPanelFiles"] === "")
    {
        return false;
    }
    else { return true; }
}

function getFolderOperation(operationType)
{
    switch (operationType)
    {
        case "copy":
            return "/sync/copy";
        case "move":
            return "/sync/move";
        case "delete":
            return "/operations/purge";
        default:
            return "";
    }
}

function getFileOperation(operationType)
{
    switch (operationType)
    {
        case "copy":
            return "/operations/copyfile";
        case "move":
            return "/operations/movefile";
        case "delete":
            return "/operations/deletefile";
        default:
            return "";
    }
}
