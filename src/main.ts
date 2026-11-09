import * as settings from "./settings.js";
import * as functions from "./functions.js";
import { initPanels } from "./panel.js";
import { initQueue } from "./queue.js";
import { initChecks } from "./check.js";
import { initSettingsUI } from "./settings-ui.js";
import { initTabs } from "./tabs.js";
import { refreshView } from "./transfers.js";

const guiVersion: string = "2026.10.10";

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
    const queryParameters: URLSearchParams = new URLSearchParams(window.location.search);
    settings.rcloneSettings.loginToken = queryParameters.get("login_token");
    //console.debug(settings.rcloneSettings.loginToken);

    // `rclone gui <path>` serves the UI on a port of its own and passes the rc API address
    // with credentials in the URL that it opens. The address is taken only together
    // with the credentials, otherwise a malicious crafted link could make the UI send
    // the credentials from `js/settings.js` to an evil host
    const rcUrl: string | null = queryParameters.get("url");
    const rcUser: string | null = queryParameters.get("user");
    const rcPass: string | null = queryParameters.get("pass");
    if (
        rcUrl !== null && rcUser !== null && rcPass !== null
        &&
        (rcUrl.startsWith("http://") || rcUrl.startsWith("https://"))
    )
    {
        // the address ends with a slash, but every rc query
        // starts with a slash too
        settings.rcloneSettings.host = rcUrl.replace(/\/+$/, "");
        settings.rcloneSettings.user = rcUser;
        settings.rcloneSettings.pass = rcPass;
    }

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
    initChecks();
    initSettingsUI();
    initTabs();

    refreshView();
}
