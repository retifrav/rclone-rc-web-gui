import * as settings from "./settings.js";
import * as functions from "./functions.js";
import { countQueuedFolderFiles } from "./queue.js";
import { refreshView, timerRefreshViewFunction } from "./transfers.js";

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
const separatorIndicators: HTMLSpanElement =
    document.getElementById("separator-indicators") as HTMLSpanElement;

const inputMaximumAllowedTransfers: HTMLInputElement =
    document.getElementById("input-maximum-allowed-transfers") as HTMLInputElement;
const outputMaximumAllowedTransfersValue: HTMLOutputElement =
    document.getElementById("output-maximum-allowed-transfers-value") as HTMLOutputElement;

export function initSettingsUI()
{
    // the slider is the only validation a user-edited `js/settings.js` gets. Range input
    // clamps an assigned value to its own `min`/`max` and snaps it to `step`, so assigning
    // the setting to it and then reading it back is not a pointless round-trip as it might
    // look like:
    //
    // - `300` comes back as `120`;
    // - `0` and `-5` come back as `1`;
    // - `2.5` comes back as `3`;
    // - anything that is not a number comes back falls back to the range's default
    //   of `min + (max - min) / 2`, which is 60.5 here and snaps up to `61`. That fallback
    //   is also why the read-back can never come back `NaN`.
    //
    // The interval is built from the value that came back, otherwise UI could show `120`
    // while actually polling every `300` seconds, or show `1` while `setInterval(fn, 0)`
    // would hammer rclone with several requests per second
    inputRefreshView.value = settings.userSettings.timerRefreshView.toString();
    settings.userSettings.timerRefreshView = parseInt(inputRefreshView.value);
    updateRefreshViewHeat();

    updateRefreshViewControls();

    getMaximumAllowedRcloneTransfers();

    settingsChbxPolling.addEventListener(
        "change",
        function()
        {
            settings.userSettings.timerRefreshEnabled = this.checked;

            updateRefreshViewControls();
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
            // this value lives in rclone, no point in storing it in `settings.userSettings`,
            // and nothing else happens here: everything that speaks for rclone rather than
            // for the knob is done by the `/options/get` that follows the set
            setMaximumAllowedRcloneTransfers(parseInt(this.value));
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

// the only authority on how the GUI looks while auto-refreshing the view is ON or OFF
//
// it paints the initial state too, not just the changes, because `js/settings.js`
// can be edited by user to disable UI auto-refreshing
function updateRefreshViewControls()
{
    const refreshEnabled: boolean = settings.userSettings.timerRefreshEnabled === true;

    // assigning `checked` does not trigger `change` event,
    // so calling this from the checkbox's own listener does not(?) loop
    settingsChbxPolling.checked = refreshEnabled;

    indicatorGuiFrozen.style.display = refreshEnabled ? "none" : "block";
    inputRefresh.style.display = refreshEnabled ? "flex" : "none";
    manualRefresh.style.display = refreshEnabled ? "none" : "flex";

    updateSeparatorIndicators();
}

// the number of transfers that rclone has actually confirmed, which is not the same thing
// as the slider's value: the slider follows the knob, while rclone is only told on `change`,
// so during a drag (also while `/options/set` is in flight and forever after the one that failed)
// the two disagree. Anything that claims something about rclone (queue's slot budget,
// header indicators) has to read this and not the input, which is also why the input
// is not exported anymore. It starts at `1` - the same value that the markup and the CSS show,
// and it is written in exactly one place: the `/options/get` callback
//
// it is an exported `let` instead of a getter function, because then the compiler is the one
// keeping that single writer (assigning to it from another module is an error), and because
// a getter would have to be named one word away from `getMaximumAllowedRcloneTransfers()`,
// which does something entirely different
export let rcloneTransfers: number = 1;

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

// an icon in the header claims something about rclone and not about the knob, so it reads
// the confirmed value. That used to be the slider's value, which was only correct because
// of where this function was called from - now it can not be called at a moment when it would
// speak for a value that has not settled
function updateRcloneTransfersIndicators()
{
    indicatorRcloneTransfersYellow.style.display =
        (rcloneTransfers > 1 && rcloneTransfers < transfersHeatRedAt) ? "block" : "none";
    indicatorRcloneTransfersRed.style.display =
        (rcloneTransfers >= transfersHeatRedAt) ? "block" : "none";

    updateSeparatorIndicators();
}

// the separator should only be visible when there is at least one visible status indicator
function updateSeparatorIndicators()
{
    const anyIndicatorVisible: boolean =
        indicatorRcloneTransfersYellow.style.display === "block"
        || indicatorRcloneTransfersRed.style.display === "block"
        || indicatorGuiFrozen.style.display === "block";

    separatorIndicators.style.display = anyIndicatorVisible ? "block" : "none";
}

// two of these requests can easily(?) be in flight at the same time - the one that follows
// every `/options/set` and the one that `tabs.ts` fires when the settings tab is opened,
// and the responses are not ordered, so the older answer arriving last would put back
// the value that rclone had before the set. Only the newest request gets to write anything,
// the same counter trick that `panelsListingGeneration` does in `panel.ts` (there is one
// slider here, so is no(?) need for mapping)
let rcloneTransfersGeneration: number = 0;

// this is not a part of `refreshView()` because it only changes when rclone itself
// is restarted with a different `--transfers` value or when `/options/set` is called
//
// exported because `tabs.ts` calls it every time the settings tab is opened,
// which includes switching to it from another tab (not via close and open)
export function getMaximumAllowedRcloneTransfers()
{
    const generation: number = ++rcloneTransfersGeneration;

    let params: functions.rcRequest = { "blocks": "main" };
    functions.sendRequestToRclone("/options/get", params, function(rez: functions.rcOptions | null)
    {
        if (rez === null) { return; }

        // a newer request has been sent in the meantime, so this answer is stale
        if (generation !== rcloneTransfersGeneration) { return; }

        const transfers: number = rez["main"]["Transfers"];
        const previousTransfers: number = rcloneTransfers;

        // user might have launched rclone with `--transfers` value higher than the slider's maximum,
        // while the range input would just clamp to its `max`, so the slider gets wider to fit
        // the real value instead. This is not only about the slider showing the right number:
        // a clamped slider would send its clamped value on the very next `change`, for example
        // silently downgrading rclone from 32 transfers to 20
        if (transfers > parseInt(inputMaximumAllowedTransfers.max))
        {
            inputMaximumAllowedTransfers.max = transfers.toString();
        }
        inputMaximumAllowedTransfers.value = transfers.toString();

        // the assignment above will throw first if rclone ever answers without a usable number,
        // so this one doesn't need a guard
        rcloneTransfers = transfers;

        updateMaximumAllowedTransfersHeat();
        updateRcloneTransfersIndicators();

        // items that were queued when just a single transfer was allowed did not get counted
        // then, but now (when there is more than one transfer allowed) they need to be counted.
        // This has to happen after `rcloneTransfers` has been updated, because that is what
        // `countQueueItemFiles()` looks at to decide whether counting is worth it at all
        //
        // and it only happens when the allowance has actually changed, because this callback also
        // runs every time the settings tab is opened: an item whose `/operations/size` is simply
        // still in flight also has `fileCount` at `-1`, so counting them unconditionally here
        // would fire another recursive walk of every queued folder on every tab open
        if (transfers !== previousTransfers) { countQueuedFolderFiles(); }
    });
}

function setMaximumAllowedRcloneTransfers(transfers: number)
{
    let params: functions.rcRequest = { "main": { "Transfers": transfers } };
    functions.sendRequestToRclone("/options/set", params, function() // function(rez)
    {
        // a success here is not a confirmation of anything: rclone documents `options/set`
        // as silently ignoring an option it doesn't know and warns that not every option
        // has an effect when it is changed this way. So what rclone has now is only known
        // by asking, and that answer is the only writer of `rcloneTransfers` - this is also
        // what repaints the slider and the indicators when the set has failed
        getMaximumAllowedRcloneTransfers();
    });
}
