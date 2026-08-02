import { panelsPaths, debounce } from "./functions.js";
import { updateFilesCount } from "./panel.js";

export function showSearch(btn: HTMLButtonElement, filesPanelID: string)
{
    if (panelsPaths[filesPanelID] === "")
    {
        alert("Nothing to search in, choose a remote first.");
        return;
    }

    const panelDiv = btn.parentNode!.parentNode!.parentNode!;
    (panelDiv.querySelector(".controls") as HTMLDivElement).style.display = "none";

    const searchBlock = panelDiv.querySelector(".input-query.search") as HTMLDivElement;
    searchBlock.style.display = "grid";
    (searchBlock.querySelector("input") as HTMLInputElement).focus();
}

export function hideSearch(btn: HTMLButtonElement | HTMLInputElement, filesPanelID: string)
{
    let panelDiv = btn!.parentNode!.parentNode!;
    const searchBlock = panelDiv.querySelector(".input-query.search") as HTMLDivElement;
    searchBlock.style.display = "none";
    // the search query needs to be emptied with the block, otherwise reopening the search panel
    // will show a query that is not being applied to anything, since `clearSearch()` has just
    // made the entire listing unfiltered again (same with `createFolderClicked()`)
    (searchBlock.querySelector("input") as HTMLInputElement).value = "";
    (panelDiv.querySelector(".controls") as HTMLDivElement).style.display = "flex";

    clearSearch(filesPanelID);
}

function clearSearch(filesPanelID: string)
{
    const fileLines: HTMLDivElement[] = Array.from(
        (document.getElementById(filesPanelID) as HTMLDivElement)
            .querySelectorAll(".file-list-item > .fileLine")
    );
    for (let i = 0; i < fileLines.length; i++)
    {
        (fileLines[i].parentNode as HTMLDivElement).style.display = "flex";
    }

    updateFilesCount(filesPanelID);
}

export const searchQueryChanged = debounce(
    (searchTerm: string, filesPanelID: string) =>
    {
        clearSearch(filesPanelID);

        // don't start search until there are at least 3 symbols entered
        if (searchTerm.length < 3)
        {
            //console.warn("The search query is too short");
            return;
        }

        //console.debug(`Searching for [${searchTerm}]...`);

        // both sides are normalized, because a name can arrive decomposed (NFD, "e" + U+0301),
        // which is what a remote fed from macOS tends to hold, and it would never match
        // the same name typed as composed NFC. Worth to mention that this is a display-side
        // filter only — the transfer itself always uses the byte-exact name that rclone gave us
        const needle = searchTerm.normalize("NFC").toLowerCase();

        const fileLines: HTMLDivElement[] = Array.from(
            (document.getElementById(filesPanelID) as HTMLDivElement)
                .querySelectorAll(".file-list-item > .fileLine")
        );
        for (let i = 0; i < fileLines.length; i++)
        {
            if (
                !(fileLines[i].querySelector(".file-name") as HTMLParagraphElement)
                    .textContent!
                    .normalize("NFC")
                    .toLowerCase()
                    .includes(needle)
            )
            {
                (fileLines[i].parentNode as HTMLDivElement).style.display = "none";
            }
        }

        updateFilesCount(filesPanelID);
    },
    200
);
