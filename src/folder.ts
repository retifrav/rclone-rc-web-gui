import { sendRequestToRclone, rcRequest, panelsPaths } from "./functions.js";
import { refreshClicked } from "./main.js";

export function showCreateFolder(btn: HTMLButtonElement, filesPanelID: string)
{
    if (panelsPaths[filesPanelID] === "")
    {
        alert("Nothing to create a folder in, choose a remote first.");
        return;
    }

    const panelDiv = btn.parentNode!.parentNode!.parentNode!;
    (panelDiv.querySelector(".controls") as HTMLDivElement).style.display = "none";

    const createFolderBlock = panelDiv.querySelector(".input-query.create-folder") as HTMLDivElement;
    createFolderBlock.style.display = "flex";
    (createFolderBlock.querySelector("input") as HTMLInputElement).focus();
}

export function hideCreateFolder(btn: HTMLButtonElement | HTMLInputElement)
{
    let panelDiv = btn!.parentNode!.parentNode!;
    (panelDiv.querySelector(".input-query.create-folder") as HTMLDivElement).style.display = "none";
    (panelDiv.querySelector(".controls") as HTMLDivElement).style.display = "flex";
}

export function createFolderClicked(btn: HTMLButtonElement, filesPanelID: string)
{
    const currentPath: string = panelsPaths[filesPanelID];
    if (currentPath !== "")
    {
        const folderNameInput = btn.parentNode!.querySelector("input") as HTMLInputElement;
        const folderName = folderNameInput.value.trim();
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

        const params: rcRequest = {
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
                folderNameInput.value = "";
                hideCreateFolder(btn);
                refreshClicked(filesPanelID);
            }
        });
    }
    else // shouldn't be possible to get here, as there is now a similar guard on showing this block at all
    {
        alert("Cannot create a folder in nowhere. Choose a remote first.");
        return;
    }
}
