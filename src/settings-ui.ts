import * as settings from "./settings.js";
import * as functions from "./functions.js";
import { countQueuedFolderFiles } from "./queue.js";
import { refreshView, timerRefreshViewFunction } from "./transfers.js";

let settingsOpen: boolean = false;

const btnSettings: HTMLButtonElement =
    document.getElementById("btn-settings") as HTMLButtonElement;
const settingsBlock: HTMLDivElement =
    document.getElementById("settings") as HTMLDivElement;
const settingsChbxPolling: HTMLInputElement =
    document.getElementById("chbx-polling") as HTMLInputElement;
const manualRefresh: HTMLDivElement =
    document.getElementById("manualRefresh") as HTMLDivElement;
const btnManualRefresh: HTMLButtonElement =
    document.getElementById("btn-manualRefresh") as HTMLButtonElement;
const indicatorGuiFrozen: HTMLImageElement =
    document.getElementById("indicator-gui-frozen") as HTMLImageElement;
const inputRefreshView: HTMLInputElement =
    document.getElementById("input-refresh-view") as HTMLInputElement;
const outputRefreshViewValue: HTMLOutputElement =
    document.getElementById("output-refresh-view-value") as HTMLOutputElement;
const inputRefresh: HTMLDivElement =
    document.getElementById("inputRefresh") as HTMLDivElement;
const indicatorRcloneTransfersYellow: HTMLImageElement =
    document.getElementById("indicator-rclone-transfers-yellow") as HTMLImageElement;
const indicatorRcloneTransfersRed: HTMLImageElement =
    document.getElementById("indicator-rclone-transfers-red") as HTMLImageElement;

// these are exported because `queue.getActiveQueueSlots()` reads the allowance from the slider
// (actual number of allowed transfers lives in rclone, so it is not mirrored in `settings.userSettings`)
export const inputMaximumAllowedTransfers: HTMLInputElement =
    document.getElementById("input-maximum-allowed-transfers") as HTMLInputElement;
const outputMaximumAllowedTransfersValue: HTMLOutputElement =
    document.getElementById("output-maximum-allowed-transfers-value") as HTMLOutputElement;

export function initSettingsUI()
{
    settingsChbxPolling.checked = settings.userSettings.timerRefreshEnabled;
    inputRefreshView.value = settings.userSettings.timerRefreshView.toString();
    updateRefreshViewHeat();

    if (settings.userSettings.timerRefreshEnabled === false)
    {
        indicatorGuiFrozen.style.display = "block";
    }

    getMaximumAllowedRcloneTransfers();

    btnSettings.addEventListener(
        "click",
        function()
        {
            if (settingsOpen === false)
            {
                // in case it has been changed with `/options/set` in the meantime
                getMaximumAllowedRcloneTransfers();
                settingsBlock.style.display = "block";
            }
            else
            {
                settingsBlock.style.display = "none";
            }
            settingsOpen = !settingsOpen;
        }
    );

    settingsChbxPolling.addEventListener(
        "change",
        function()
        {
            if (this.checked === true)
            {
                settings.userSettings.timerRefreshEnabled = true;
                indicatorGuiFrozen.style.display = "none";
                manualRefresh.style.display = "none";
                inputRefresh.style.display = "flex";
            }
            else
            {
                settings.userSettings.timerRefreshEnabled = false;
                indicatorGuiFrozen.style.display = "block";
                inputRefresh.style.display = "none";
                manualRefresh.style.display = "flex";
            }
        }
    );

    // the span with current value and slider heat colour follow the knob,
    // but the timer itself is only restarted on `change`
    inputRefreshView.addEventListener(
        "input",
        updateRefreshViewHeat
    );
    inputRefreshView.addEventListener(
        "change",
        function()
        {
            settings.userSettings.timerRefreshView = parseInt(this.value);

            window.clearInterval(settings.userSettings.timerRefreshViewInterval);
            settings.userSettings.timerRefreshViewInterval = window.setInterval(
                timerRefreshViewFunction,
                settings.userSettings.timerRefreshView * 1000
            );
        }
    );

    btnManualRefresh.addEventListener("click", refreshView);

    settings.userSettings.timerRefreshViewInterval = window.setInterval(
        timerRefreshViewFunction,
        settings.userSettings.timerRefreshView * 1000
    );

    // the span with current value and slider heat colour follow the knob,
    // but the actual request to rclone is only sent on `change`
    inputMaximumAllowedTransfers.addEventListener(
        "input",
        updateMaximumAllowedTransfersHeat
    );
    inputMaximumAllowedTransfers.addEventListener(
        "change",
        function()
        {
            // this value lives in rclone, no point in storing it in `settings.userSettings`
            setMaximumAllowedRcloneTransfers(parseInt(this.value));

            updateRcloneTransfersIndicators();

            // items that were queued when just a single transfer was allowed
            // did not get counted then, but now (when there is more than one
            // transfer allowed) they needs to be counted
            countQueuedFolderFiles();
        }
    );
}

// heatmap-coloring the slider for UI auto-refresh frequency:
// 1 - red (every second, too frequent)
// 2 - green (every two seconds, recommended)
// 3..120 - gradually going into dark blue (less and less frequent updates)
function updateRefreshViewHeat()
{
    const value: number = parseInt(inputRefreshView.value);

    let hue: number = 0;
    let lightness: number = 42;

    if (value === 2) { hue = 120; }
    else if (value > 2)
    {
        // heatmap-coloring starts at 3, because 1 and 2 are fixed colors
        const rampEnd: number = parseInt(inputRefreshView.max);
        const fraction: number = (value - 3) / (rampEnd - 3);

        // hue stops at blue (240) halfway, so the second half of the range
        // has only the lightness left to say anything with
        hue = 120 + 120 * Math.min(fraction * 2, 1);
        if (fraction > 0.5) { lightness = 42 - 22 * (fraction - 0.5) * 2; }
    }

    inputRefreshView.style.accentColor = "hsl("
        .concat(
            Math.round(hue).toString(),
            " 75% ",
            Math.round(lightness).toString(),
            "%)"
        );

    outputRefreshViewValue.textContent = inputRefreshView.value;
}

const transfersHeatYellowAt: number = 3;
const transfersHeatRedAt: number = 6;
// heatmap-coloring the slider for the number of maximum allowed transfers:
// 1 - green (a single transfer at a time is always good)
// 3 - yellow (not too many transfers at once are still more or less okay)
// 6..max - red (a lot of parallel transfers is a really bad idea)
function updateMaximumAllowedTransfersHeat()
{
    const min: number = parseInt(inputMaximumAllowedTransfers.min);
    const value: number = parseInt(inputMaximumAllowedTransfers.value);

    let hue: number = 0;

    if (value < transfersHeatYellowAt)
    {
        hue = 120 - 60 * (value - min) / (transfersHeatYellowAt - min);
    }
    else if (value < transfersHeatRedAt)
    {
        hue = 60 - 60 * (value - transfersHeatYellowAt) / (transfersHeatRedAt - transfersHeatYellowAt);
    }

    inputMaximumAllowedTransfers.style.accentColor =
        "hsl(".concat(Math.round(hue).toString(), " 75% 42%)");

    outputMaximumAllowedTransfersValue.textContent = inputMaximumAllowedTransfers.value;
}

function updateRcloneTransfersIndicators()
{
    const value: number = parseInt(inputMaximumAllowedTransfers.value);

    indicatorRcloneTransfersYellow.style.display =
        (value > 1 && value < transfersHeatRedAt) ? "block" : "none";
    indicatorRcloneTransfersRed.style.display =
        (value >= transfersHeatRedAt) ? "block" : "none";
}

// this is not a part of `refreshView()` because it only changes when rclone itself
// is restarted with a different `--transfers` value or when `/options/set` is called
function getMaximumAllowedRcloneTransfers()
{
    let params: functions.rcRequest = { "blocks": "main" };
    functions.sendRequestToRclone("/options/get", params, function(rez: functions.rcOptions | null)
    {
        if (rez === null) { return; }

        const transfers: number = rez["main"]["Transfers"];

        // user might have launched rclone with `--transfers` value higher than the slider's maximum,
        // while the range input would just clamp to its `max`, which would be incorrect and also
        // would make `getActiveQueueSlots()` allocate less slots than actually allowed,
        // so the slider gets wider to fit the real value instead
        if (transfers > parseInt(inputMaximumAllowedTransfers.max))
        {
            inputMaximumAllowedTransfers.max = transfers.toString();
        }
        inputMaximumAllowedTransfers.value = transfers.toString();

        updateMaximumAllowedTransfersHeat();
        updateRcloneTransfersIndicators();
    });
}

function setMaximumAllowedRcloneTransfers(transfers: number)
{
    let params: functions.rcRequest = { "main": { "Transfers": transfers } };
    functions.sendRequestToRclone("/options/set", params, function(rez: {} | null)
    {
        // the value is only(?) ever sent after being validated, so on success rclone now has
        // exactly what the input shows, so there is no need to update anything, however
        // a failure would leave the input showing an incorrect/unsynced value
        if (rez === null) { getMaximumAllowedRcloneTransfers(); }
    });
}
