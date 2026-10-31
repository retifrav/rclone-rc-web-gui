import { requestRcloneWithError, rcRequest, rcEmptyResponse, rcOutcome, panelsPaths } from "./functions.js";
import { refreshClicked } from "./panel.js";
import { showDialog, showMessage, setDialogError } from "./dialog.js";

export function createFolderClicked(filesPanelID: string)
{
    // the path is taken once, so the folder gets created where the dialog says it will be
    const currentPath: string = panelsPaths[filesPanelID];
    if (currentPath === "")
    {
        showMessage(
            "warning",
            "No remote chosen",
            [ "Nothing to create a folder in, choose a remote first." ]
        );
        return;
    }

    const pathLine: HTMLParagraphElement = document.createElement("p");
    pathLine.appendChild(document.createTextNode("In "));
    const pathCode: HTMLElement = document.createElement("code");
    pathCode.appendChild(document.createTextNode(currentPath));
    pathLine.appendChild(pathCode);

    const folderNameInput: HTMLInputElement = Object.assign(
        document.createElement("input"),
        {
            type: "text",
            className: "dialog-input",
            placeholder: "Folder name",
            autofocus: true
        }
    );
    folderNameInput.setAttribute("aria-label", "Folder name");
    // the error is about the name as it was, so it goes away as soon as the name is being edited
    folderNameInput.addEventListener(
        "input",
        function()
        {
            this.removeAttribute("aria-invalid");
            setDialogError(this.closest("dialog") as HTMLDialogElement, "");
        }
    );

    showDialog(
        {
            icon: "folder-plus.svg",
            title: "New folder",
            body: [ pathLine, folderNameInput ],
            buttons: [
                { label: "Cancel", value: "" },
                {
                    label: "Create",
                    value: "create",
                    style: "primary",
                    onClick: function(dialog: HTMLDialogElement, button: HTMLButtonElement)
                    {
                        // leading/trailing whitespace in a name is almost always undesired,
                        // many backends reject or rewrite it anyway, rclone itself has
                        // a `RightSpace` encoding exactly for that
                        const folderName = folderNameInput.value.trim();
                        const folderNameProblem = getFolderNameProblem(folderName);
                        if (folderNameProblem !== "")
                        {
                            folderNameInput.setAttribute("aria-invalid", "true");
                            setDialogError(dialog, folderNameProblem);
                            folderNameInput.focus();
                            return false;
                        }

                        createFolder(dialog, button, folderNameInput, currentPath, folderName, filesPanelID);
                        // the dialog is closed once rclone has created the folder
                        return false;
                    }
                }
            ]
        }
    );
}

function getFolderNameProblem(folderName: string) : string
{
    if (!folderName)
    {
        return "A folder needs a name.";
    }
    // rclone takes `remote` as a literal path relative to `fs` and does not(?) check it,
    // so a path separator or/and dots can resolve somewhere outside of `fs`
    if (folderName.includes("/") || folderName.includes("\\"))
    {
        return "A folder name cannot contain \"/\" or \"\\\".";
    }
    if (folderName === "." || folderName === "..")
    {
        return "A folder name cannot be \".\" or \"..\".";
    }
    return "";
}

function createFolder(
    dialog: HTMLDialogElement,
    btn: HTMLButtonElement,
    folderNameInput: HTMLInputElement,
    currentPath: string,
    folderName: string,
    filesPanelID: string
)
{
    // this also keeps Enter from sending the request again while it is in flight,
    // as pressing Enter does nothing when the default button is disabled
    btn.disabled = true;

    // const lastSlash = currentPath.lastIndexOf("/") + 1;
    // const basePath = lastSlash !== 0 ? currentPath.substring(0, lastSlash) : currentPath.concat("/");
    // const targetPath = currentPath.substring(lastSlash, currentPath.length).concat("/", folderName);
    //console.debug(currentPath, basePath, targetPath);

    const params: rcRequest = {
        "fs": currentPath,
        "remote": folderName
    };
    // this goes to `requestRcloneWithError()` directly and not via `sendRequestToRclone()`, because
    // the dialog needs to know about all three outcomes: a request that never made it to rclone would
    // otherwise leave the dialog open with a disabled button and no explanation. And when rclone
    // refuses, its own reason ("permission denied", a remote missing from its config) is shown
    requestRcloneWithError<rcEmptyResponse>("/operations/mkdir", params).then(
        function(outcome: rcOutcome<rcEmptyResponse>)
        {
            btn.disabled = false;
            if (outcome.rez === null)
            {
                setDialogError(
                    dialog,
                    outcome.error !== ""
                        ? "rclone could not create the folder: ".concat(outcome.error)
                        // a refusal that isn't rclone's own, such as a 401 (status code is in console)
                        : "rclone could not create the folder, the browser console has the details."
                );
                folderNameInput.focus();
                return;
            }

            // a no-op if the dialog has been closed while the request was in flight,
            // but the listing still needs to be refreshed then
            dialog.close("create");
            refreshClicked(filesPanelID);
        },
        function()
        {
            btn.disabled = false;
            setDialogError(dialog, "Could not reach rclone, so the folder has not been created.");
            folderNameInput.focus();
        }
    );
}
