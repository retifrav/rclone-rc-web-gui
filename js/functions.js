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

function getHumanReadableValue(sizeInBytes, metric)
{
    let sizeInBytesMB = sizeInBytes / 1024 / 1024;
    let sizeInBytesGB = sizeInBytesMB / 1024;
    if (sizeInBytesGB < 1) { return `${parseFloat(sizeInBytesMB).toFixed(2)} MB${metric}`; }
    else { return `${parseFloat(sizeInBytesGB).toFixed(2)} GB${metric}`; }
}
