import * as settings from "./settings.js";
import * as functions from "./functions.js";
import { initPanels } from "./panel.js";
import { initQueue } from "./queue.js";
import { initSettingsUI } from "./settings-ui.js";
import { refreshView } from "./transfers.js";

const guiVersion: string = "2026.8.3";

const rcloneOS: HTMLSpanElement =
    document.getElementById("rcloneOS") as HTMLSpanElement;
const rcloneVersion: HTMLSpanElement =
    document.getElementById("rcloneVersion") as HTMLSpanElement;
const guiVersionSpan: HTMLSpanElement =
    document.getElementById("guiVersion") as HTMLSpanElement;

window.onload = () =>
{
    // check if there is login_token query parameter present
    //
    // this has to happen before anything sends a request, because `sendRequestToRclone()`
    // builds the `Authorization` header out of it
    settings.rcloneSettings.loginToken = new URLSearchParams(
        window.location.search
    ).get("login_token");
    //console.debug(settings.rcloneSettings.loginToken);

    guiVersionSpan.textContent = guiVersion;

    // get versions
    functions.sendRequestToRclone(
        "/core/version",
        null,
        function(rez: functions.rcVersion | null)
        {
            if (rez === null) { return; }

            rcloneOS.textContent = rez["os"].concat(" (", rez["arch"], ")");
            rcloneVersion.textContent = rez["version"];
        }
    );

    // every module owns the elements it works with and handles their listeners
    initPanels();
    initQueue();
    initSettingsUI();

    refreshView();
}
