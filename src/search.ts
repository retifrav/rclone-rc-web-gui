import { panelsPaths, debounce } from "./functions.js";

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
    searchBlock.style.display = "flex";
    (searchBlock.querySelector("input") as HTMLInputElement).focus();
}

export function hideSearch(btn: HTMLButtonElement | HTMLInputElement, filesPanelID: string)
{
    let panelDiv = btn!.parentNode!.parentNode!;
    (panelDiv.querySelector(".input-query.search") as HTMLDivElement).style.display = "none";
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
}

export const searchQueryChanged = debounce(
    (searchTerm: string, filesPanelID: string) =>
    {
        clearSearch(filesPanelID);

        // don't start search until there are at least 3 symbols
        if (searchTerm.length < 3)
        {
            if (searchTerm.length !== 0) { console.warn("The search query is too short"); }
            return;
        }

        //console.debug(`Searching for [${searchTerm}]...`);

        const fileLines: HTMLDivElement[] = Array.from(
            (document.getElementById(filesPanelID) as HTMLDivElement)
                .querySelectorAll(".file-list-item > .fileLine")
        );
        for (let i = 0; i < fileLines.length; i++)
        {
            if (
                !(fileLines[i].querySelector("p") as HTMLParagraphElement)
                    .textContent!.toLowerCase().includes(
                        searchTerm.toLowerCase()
                    )
            )
            {
                (fileLines[i].parentNode as HTMLDivElement).style.display = "none";
            }
        }
    },
    200
);
