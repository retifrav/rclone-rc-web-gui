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
        case "audio/aac":
        case "audio/mpeg":
        case "audio/ac3":
            return "file-music.svg";
        case "image/jpeg":
        case "image/png":
            return "file-image.svg";
        case "text/srt; charset=utf-8":
        case "text/plain":
        case "text/plain; charset=utf-8":
            return "file-alt.svg";
        case "application/pdf":
            return "file-pdf.svg";
        case "application/json":
        case "application/javascript":
        case "text/css":
        case "text/css; charset=utf-8":
        case "text/html":
        case "text/html; charset=utf-8":
            return "file-code.svg";
        default:
            return "file.svg";
    }
}

function getHumanReadableValue(sizeInBytes, metric)
{
    let sizeInBytesMB = sizeInBytes / 1024 / 1024;
    let sizeInBytesGB = sizeInBytesMB / 1024;
    if (sizeInBytesGB < 1) { return `${parseFloat(sizeInBytesMB).toFixed(2)} MB${metric}`; }
    else { return `${parseFloat(sizeInBytesGB).toFixed(2)} GB${metric}`; }
}

function sortJobs(a, b)
{
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
