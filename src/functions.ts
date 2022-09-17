type rcListItem =
{
    "Path": string,
    "Name": string,
    "Size": number,
    "MimeType": string,
    "ModTime": Date,
    "IsDir": boolean
}

type rcTransfer =
{
    "error": string,
    "name": string,
    "size": number,
    "bytes": number,
    "checked": boolean,
    "started_at": Date,
    "completed_at": Date,
    "group": string
}

function htmlToElement(html: string) : HTMLElement
{
    let template: HTMLTemplateElement = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstChild as HTMLElement;
}

function getIconType(mimeType: string) : string
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
        case "audio/flac":
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
            return "file-earmark.svg";
    }
}

function getHumanReadableValue(sizeInBytes: number, metric: string) : string
{
    let rez: string = "0";
    let metricRank: string = "MB";
    let sizeInMB: number = sizeInBytes / 1024 / 1024;
    let sizeInGB: number = sizeInMB / 1024;
    if (sizeInGB < 1)
    {
        rez = sizeInMB.toFixed(2);
    }
    else
    {
        metricRank = "GB";
        rez = sizeInGB.toFixed(2);
    }
    return `${rez} ${metricRank}${metric}`;
}

// TODO: sort jobs with the same group (folder transfer)
function sortJobs(a: rcTransfer, b: rcTransfer) : number
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

function sortFilesAndFolders(a: rcListItem, b: rcListItem) : number
{
    if (a.IsDir === true && b.IsDir === false) { return -1; }
    if (a.IsDir === false && b.IsDir === true) { return 1; }
    return 0;
}

function getDestinationPath(currentFilePanel: string) : string
{
    if (currentFilePanel === "leftPanelFiles") { return panelsPaths["rightPanelFiles"]; }
    else { return panelsPaths["leftPanelFiles"]; }
}

function panelsPathsHaveValue() : boolean
{
    if (panelsPaths["leftPanelFiles"] === "" || panelsPaths["rightPanelFiles"] === "")
    {
        return false;
    }
    else { return true; }
}

function getFolderOperation(operationType: string) : string
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

function getFileOperation(operationType: string) : string
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
