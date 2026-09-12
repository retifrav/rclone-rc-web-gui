import { getMaximumAllowedRcloneTransfers } from "./settings-ui.js";
import { hideDonationButton } from "./settings.js";

type Tab = {
    "button": HTMLInputElement,
    "block": HTMLDivElement,
    // runs every time the tab is opened, including on a direct switch from another tab,
    // which is not a close followed by an open and so is easy to miss
    "onShow"?: () => void
}

const btnDonation: HTMLInputElement =
    document.getElementById("btn-donation") as HTMLInputElement;
const donationBlock: HTMLDivElement =
    document.getElementById("donation") as HTMLDivElement;
const btnSettings: HTMLInputElement =
    document.getElementById("btn-settings") as HTMLInputElement;
const settingsBlock: HTMLDivElement =
    document.getElementById("settings") as HTMLDivElement;

// the header icons are the tab strip and no strip is drawn anywhere,
// so this list is the only place that says which tabs exist
const tabs: Array<Tab> = [
    {
        "button": btnDonation,
        "block": donationBlock
    },
    {
        "button": btnSettings,
        "block": settingsBlock,
        // in case it has been changed with `/options/set` in the meantime
        "onShow": getMaximumAllowedRcloneTransfers
    }
]

// the tab that is currently open, `null` when they are all closed,
// which is how the UI starts - nothing is remembered between reloads
let activeTab: Tab | null = null;

export function initTabs()
{
    for (let t = 0; t < tabs.length; t++)
    {
        // per-iteration binding, every listener gets its own tab
        const tab: Tab = tabs[t];
        tab.button.addEventListener(
            "click",
            function()
            {
                tabClicked(tab);
            }
        );
    }

    if (hideDonationButton === true)
    {
        btnDonation.style.display = "none";
    }
}

// clicking on a header icon opens/closes that tab
// or closes whichever other one that was open
function tabClicked(tab: Tab)
{
    const wasActive: boolean = (activeTab === tab);

    if (activeTab !== null) { hideTab(activeTab); }
    activeTab = null;

    if (wasActive === true) { return; }

    tab.block.style.display = "block";
    tab.button.setAttribute("aria-expanded", "true");
    activeTab = tab;

    // after the state is already consistent, so that an open tab
    // wouldn't(?) get recorded as closed
    if (tab.onShow !== undefined) { tab.onShow(); }
}

function hideTab(tab: Tab)
{
    tab.block.style.display = "none";
    tab.button.setAttribute("aria-expanded", "false");
}
