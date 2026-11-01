// Proves that a change to the stylesheets changed nothing on screen: drives the real GUI through
// several states and, in each, compares the computed style of every element between the
// stylesheets of the working tree and those of a git revision. See `.claude/notes/stylesheets.md`.
//
//     node .claude/scripts/compare-styles.mjs [<revision>]    (HEAD by default)
//
// The baseline is the revision's `index.html` stylesheet `<link>`s, in their order, injected as
// `<style>` elements while the working tree's `<link>`s are disabled, so both are compared on the
// same DOM. Starts `rclone rcd` (on 5572, which the default `js/settings.js` talks to) and
// `chromium-headless-shell` itself and stops both on the way out. Temporary files go to
// `os.tmpdir()`, so `TMPDIR` decides where. Needs node 22+ (global `WebSocket`), `rclone` and `tsc`.
//
// Exit codes: 0 - no differences, and the negative control was detected; 1 - differences;
// 2 - the harness itself failed (including a negative control that went unnoticed)
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const revision = process.argv[2] ?? "HEAD";
const rcdPort = 5572;
const sleep = ms => new Promise(r => setTimeout(r, ms));

class HarnessError extends Error {}

// --- the baseline stylesheets ---

function getStylesheetLinks(html)
{
    return [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map(
        m => m[0].match(/\bhref="([^"]+)"/)[1]
    );
}

function getBaselineSheets()
{
    const git = (...args) => execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
    const sheets = getStylesheetLinks(git("show", revision + ":index.html")).map(
        href => ({ href: href, text: git("show", revision + ":" + href.replace(/^\.\//, "")) })
    );
    for (const sheet of sheets)
    {
        // an inline <style> resolves relative URLs against the page and not against css/
        if (/@import|url\(/.test(sheet.text))
        {
            throw new HarnessError(
                sheet.href + " at " + revision + " has an @import or a url(), which an inline <style> "
                + "would resolve differently - teach the script to rewrite them first"
            );
        }
    }
    return sheets;
}

// the negative control: the spinner rule moved in front of everything, i.e. above `.filesList > *`,
// which it ties with - a split getting that one order wrong. The comparison must notice it
function getControlSheets(sheets)
{
    const spinnerRule = /^\.loadingAnimation \{[^}]*\}\n/m;
    const index = sheets.findIndex(s => spinnerRule.test(s.text));
    if (index === -1)
    {
        throw new HarnessError("no `.loadingAnimation` rule in the baseline, so the negative control cannot be built");
    }
    const rule = sheets[index].text.match(spinnerRule)[0];
    const control = sheets.map(s => ({ ...s }));
    control[index].text = control[index].text.replace(rule, "");
    control[0].text = rule + control[0].text;
    return control;
}

// --- the processes ---

const children = [];
let tmpDir = null;

function startDetached(command, args, logFile)
{
    const log = fs.openSync(logFile, "w");
    // a process group of its own, so that killing it takes Chromium's zygotes along
    const child = spawn(command, args, { detached: true, stdio: ["ignore", log, log] });
    fs.closeSync(log);
    children.push(child);
    return child;
}

function isGroupAlive(pid)
{
    try { process.kill(-pid, 0); return true; }
    catch (e) { return false; }
}

async function cleanUp()
{
    for (const child of children)
    {
        if (isGroupAlive(child.pid)) { process.kill(-child.pid, "SIGTERM"); }
    }
    for (const child of children)
    {
        for (let i = 0; i < 50 && isGroupAlive(child.pid); i++) { await sleep(100); }
        if (isGroupAlive(child.pid)) { process.kill(-child.pid, "SIGKILL"); }
    }
    children.length = 0;
    if (tmpDir !== null)
    {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
    }
}

async function assertPortFree(port)
{
    await new Promise((resolve, reject) =>
    {
        const server = net.createServer();
        server.once("error", () => reject(new HarnessError(
            "port " + port + " is taken, and the default js/settings.js only talks to that one"
        )));
        server.listen(port, "127.0.0.1", () => server.close(resolve));
    });
}

async function waitUntil(what, test, timeout = 15000)
{
    const t0 = Date.now();
    while (!(await test()))
    {
        if (Date.now() - t0 > timeout) { throw new HarnessError("timed out waiting for " + what); }
        await sleep(200);
    }
}

function createTestRemotes()
{
    const left = path.join(tmpDir, "data", "left");
    const right = path.join(tmpDir, "data", "right");
    fs.mkdirSync(path.join(left, "sub-folder"), { recursive: true });
    fs.mkdirSync(right, { recursive: true });
    fs.writeFileSync(path.join(left, "a.txt"), "one\n");
    fs.writeFileSync(path.join(left, "b.txt"), "two\n");
    fs.writeFileSync(path.join(left, "a-file-with-a-rather-long-name-that-has-no-break-opportunity-at-all_0123456789abcdefghij.txt"), "x");
    fs.writeFileSync(path.join(left, "sub-folder", "c.txt"), "y\n");
    // slow enough under --bwlimit to still be in flight when the current transfers table renders
    fs.writeFileSync(path.join(left, "big.bin"), Buffer.alloc(3000000));
    fs.writeFileSync(path.join(right, "a.txt"), "different\n");
    const config = path.join(tmpDir, "rclone.conf");
    fs.writeFileSync(config, `[left]\ntype = alias\nremote = ${left}\n\n[right]\ntype = alias\nremote = ${right}\n`);
    return config;
}

async function rc(command, params)
{
    const response = await fetch("http://127.0.0.1:" + rcdPort + "/" + command, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
    });
    if (response.status !== 200) { throw new HarnessError(command + " answered " + response.status + ": " + await response.text()); }
    return response.json();
}

async function startServers()
{
    await assertPortFree(rcdPort);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "compare-styles-"));
    const config = createTestRemotes();

    startDetached("rclone", [
        "rcd", "--rc-no-auth", "--rc-addr", "127.0.0.1:" + rcdPort, "--config", config,
        "--transfers", "4", "--bwlimit", "20k", repoRoot
    ], path.join(tmpDir, "rcd.log"));
    await waitUntil("rclone rcd", async () =>
    {
        try { return (await fetch("http://127.0.0.1:" + rcdPort + "/core/version", { method: "POST" })).status === 200; }
        catch (e) { return false; }
    });

    // the binary itself rather than the /usr/bin wrapper, which does not exec it
    const realChromium = "/usr/lib/chromium/chromium-headless-shell";
    const profile = path.join(tmpDir, "chrome");
    startDetached(fs.existsSync(realChromium) ? realChromium : "chromium-headless-shell", [
        "--no-sandbox", "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"
    ], path.join(tmpDir, "chrome.log"));
    const portFile = path.join(profile, "DevToolsActivePort");
    await waitUntil("Chromium's DevTools port", () => fs.existsSync(portFile) && fs.readFileSync(portFile, "utf8").includes("\n"));
    return parseInt(fs.readFileSync(portFile, "utf8").split("\n")[0]);
}

// --- the DevTools protocol ---

async function connect(devtoolsPort)
{
    const targets = await (await fetch("http://127.0.0.1:" + devtoolsPort + "/json/list")).json();
    const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener("open", r));
    let seq = 0;
    const pending = new Map();
    const failedRequests = [];
    const consoleErrors = [];
    ws.addEventListener("message", e =>
    {
        const m = JSON.parse(e.data);
        if (m.id && pending.has(m.id))
        {
            const p = pending.get(m.id);
            pending.delete(m.id);
            m.error ? p.reject(new HarnessError(JSON.stringify(m.error))) : p.resolve(m.result);
        }
        else if (m.method === "Network.responseReceived" && m.params.response.status >= 400)
        {
            failedRequests.push(m.params.response.status + " " + m.params.response.url);
        }
        else if (m.method === "Runtime.exceptionThrown")
        {
            consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
        }
        else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
        {
            consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) =>
    {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const ev = async (expression) =>
    {
        const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) { throw new HarnessError(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); }
        return r.result.value;
    };
    const waitFor = (expression, timeout = 30000) => waitUntil(expression, () => ev(expression), timeout);
    return { ws, send, ev, waitFor, failedRequests, consoleErrors };
}

// runs in the page: switching between the working tree's stylesheets and the baseline, and the snapshots
const pageHelpers = `
    window.__setMode = (mode) => {
        let styles = [...document.querySelectorAll('style[data-compare-styles]')];
        if (styles.length === 0) {
            styles = __baseline.map(s => {
                const st = document.createElement('style');
                st.dataset.compareStyles = s.href;
                document.head.appendChild(st);
                return st;
            });
        }
        const sheets = mode === 'baseline' ? __baseline : (mode === 'control' ? __control : null);
        styles.forEach((st, i) => { st.textContent = sheets === null ? '' : sheets[i].text; });
        for (const l of document.querySelectorAll('link[rel=stylesheet]')) { l.disabled = (mode !== 'new'); }
    };
    window.__snap = () => {
        // the swap gives every @keyframes a new identity, which can restart an animation
        for (const a of document.getAnimations()) { try { a.finish(); } catch (e) { a.pause(); a.currentTime = 0; } }
        const out = [];
        for (const el of document.querySelectorAll('*')) {
            if (el.matches('style[data-compare-styles]')) { continue; }
            const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
                + (el.classList.length ? '.' + [...el.classList].join('.') : '');
            const pseudos = el.tagName === 'DIALOG' ? [null, '::before', '::after', '::backdrop'] : [null, '::before', '::after'];
            for (const p of pseudos) {
                const cs = getComputedStyle(el, p);
                const o = {};
                for (let i = 0; i < cs.length; i++) { o[cs[i]] = cs.getPropertyValue(cs[i]); }
                out.push({ name: name + (p ?? ''), o });
            }
        }
        return out;
    };
    window.__compare = (other) => {
        __setMode('new'); const a = __snap();
        __setMode(other); const b = __snap();
        __setMode('new');
        if (a.length !== b.length) {
            return { entries: a.length, diffs: [{ name: '(the DOM changed between the snapshots)', prop: 'entries', before: b.length, after: a.length }] };
        }
        const diffs = [];
        for (let i = 0; i < a.length; i++) {
            if (a[i].name !== b[i].name) {
                diffs.push({ name: '(the DOM changed between the snapshots)', prop: 'entry ' + i, before: b[i].name, after: a[i].name });
                break;
            }
            for (const k of new Set([...Object.keys(a[i].o), ...Object.keys(b[i].o)])) {
                if (a[i].o[k] !== b[i].o[k]) { diffs.push({ name: a[i].name, prop: k, before: b[i].o[k], after: a[i].o[k] }); }
            }
        }
        return { entries: a.length, diffs };
    };
`;

async function run(devtoolsPort, baseline, control)
{
    const { ws, send, ev, waitFor, failedRequests, consoleErrors } = await connect(devtoolsPort);
    const width = w => send("Emulation.setDeviceMetricsOverride", { width: w, height: 1000, deviceScaleFactor: 1, mobile: false });
    const pressEnter = async () =>
    {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    };

    for (const domain of ["Page", "Runtime", "Network", "DOM", "CSS"]) { await send(domain + ".enable"); }
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await width(1280);
    await send("Page.navigate", { url: "http://127.0.0.1:" + rcdPort + "/" });
    await sleep(500);
    await waitFor(`document.readyState === "complete" && document.getElementById("leftPanelRemote").options.length > 1`);
    await ev(`window.__baseline = ${JSON.stringify(baseline)}; window.__control = ${JSON.stringify(control)};` + pageHelpers);

    // a finished copy for the completed table, then a slow one for the current table
    await rc("operations/copyfile", { srcFs: "left:", srcRemote: "b.txt", dstFs: "right:", dstRemote: "copied.txt" });
    await rc("operations/copyfile", { srcFs: "left:", srcRemote: "big.bin", dstFs: "right:", dstRemote: "big.bin", _async: true });

    // state 1: both panels listed, a check run through the GUI (only those get a row of their own)
    await ev(`(() => {
        for (const [id, remote] of [['leftPanelRemote', 'left'], ['rightPanelRemote', 'right']]) {
            const sel = document.getElementById(id);
            sel.value = [...sel.options].find(o => o.textContent.startsWith(remote)).value;
            sel.dispatchEvent(new Event('change'));
        }
    })()`);
    await waitFor(`document.querySelectorAll('#leftPanelFiles .file-list-item').length > 3 && document.querySelectorAll('#rightPanelFiles .file-list-item').length > 0`);
    await ev(`document.getElementById('leftPanelCommandCheck').click()`);
    await waitFor(`!!document.querySelector('#completedTransfersBody > tr.clickable')`, 45000);
    await waitFor(`!!document.querySelector('#currentTransfersBody > tr')`);
    // otherwise the current transfers table is rebuilt between two snapshots (no visible change)
    await ev(`import('/js/settings.js').then(m => { m.userSettings.timerRefreshEnabled = false; })`);
    await sleep(2500);
    await ev(`(() => {
        // the real spinner is gone as soon as the listing lands, so put one where openPath() does
        document.getElementById('rightPanelFiles').appendChild(Object.assign(document.createElement('div'), { className: 'loadingAnimation' }));
        document.getElementById('completedTransfersTrimmed').style.display = 'block';
        document.querySelector('#leftPanelFiles input[name=fileListItem]').click();
    })()`);

    // forcing pseudo-classes has to actually take effect, or the forced passes prove nothing
    const { root } = await send("DOM.getDocument", { depth: -1 });
    const { nodeId: probe } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "#btn-settings" });
    const probeExpression = `getComputedStyle(document.getElementById('btn-settings')).backgroundColor`;
    const unforced = await ev(probeExpression);
    await send("CSS.forcePseudoState", { nodeId: probe, forcedPseudoClasses: ["hover"] });
    const forced = await ev(probeExpression);
    await send("CSS.forcePseudoState", { nodeId: probe, forcedPseudoClasses: [] });
    if (unforced === forced) { throw new HarnessError("a forced :hover changed nothing on #btn-settings (" + forced + ")"); }

    const controlResult = await ev(`__compare('control')`);

    const results = [];
    const compareState = async (state) =>
    {
        for (const w of [1280, 400])
        {
            await width(w);
            await sleep(200);
            for (const isForced of [false, true])
            {
                let nodeIds = [];
                if (isForced)
                {
                    const { root } = await send("DOM.getDocument", { depth: -1 });
                    nodeIds = (await send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "*" })).nodeIds;
                    for (const nodeId of nodeIds)
                    {
                        await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover", "focus", "focus-visible", "focus-within", "active"] });
                    }
                }
                const r = await ev(`__compare('baseline')`);
                results.push({ state, width: w, forced: isForced, entries: r.entries, diffs: r.diffs });
                for (const nodeId of nodeIds) { await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] }); }
            }
        }
        await width(1280);
    };

    await compareState("panels, transfers, spinner, check row");

    // state 2: the settings tab, one search row with too short a query and one filtering rows away
    await ev(`document.getElementById('btn-settings').click(); document.getElementById('leftPanelCommandShowSearch').click(); document.getElementById('rightPanelCommandShowSearch').click(); document.getElementById('leftPanelSearchQuery').focus()`);
    // typed rather than assigned, a value being too short only once the user has edited it
    await send("Input.insertText", { text: "ab" });
    await ev(`document.getElementById('rightPanelSearchQuery').focus()`);
    await send("Input.insertText", { text: "a.t" });
    await sleep(500);
    await waitFor(`document.getElementById('leftPanelSearchQuery').matches(':invalid')`);
    await compareState("settings tab, search rows");

    await ev(`document.getElementById('btn-donation').click()`);
    await compareState("donation tab");

    await ev(`document.querySelector('#completedTransfersBody > tr.clickable').click()`);
    await waitFor(`document.querySelectorAll('dialog[open] .dialog-list > li').length > 0`);
    await compareState("check results dialog");
    await ev(`document.querySelector('dialog[open]').close()`);
    await sleep(200);

    // state 5: the New folder dialog with its validation error, two more dialogs stacked on top
    await ev(`document.getElementById('leftPanelCommandShowCreateFolder').click()`);
    await sleep(300);
    await send("Input.insertText", { text: "a/b" });
    await pressEnter();
    await waitFor(`!!document.querySelector('.dialog-input[aria-invalid=true]')`);
    await ev(`import('/js/dialog.js').then(d => {
        d.showConfirmation('trash3.svg', 'Delete', ['Really?', Object.assign(document.createElement('code'), { textContent: 'some/path' })], 'Delete');
        d.showMessage('error', 'Test message', ['A message body']);
    })`);
    await waitFor(`document.querySelectorAll('dialog[open]').length === 3`);
    await compareState("new folder dialog with error, confirmation and message stacked");

    ws.close();
    return { controlResult, results, failedRequests, consoleErrors };
}

// --- main ---

// one line per element; the properties that merely follow `color` (currentColor) and a ::before/::after
// that merely repeats its element are folded away, as a single `color` change otherwise reads as 50 lines
function formatDiffs(diffs)
{
    const byName = new Map();
    for (const d of diffs)
    {
        if (!byName.has(d.name)) { byName.set(d.name, []); }
        byName.get(d.name).push(d);
    }
    const signature = ds => ds.map(d => d.prop + "\u0000" + d.before + "\u0000" + d.after).join("\n");
    const lines = [];
    for (const [name, ds] of byName)
    {
        const pseudo = name.match(/^(.*)::(before|after)$/);
        if (pseudo !== null && byName.has(pseudo[1]) && signature(byName.get(pseudo[1])) === signature(ds)) { continue; }
        const color = ds.find(d => d.prop === "color");
        const shown = color === undefined ? ds : ds.filter(d => d === color || d.before !== color.before || d.after !== color.after);
        const folded = ds.length - shown.length;
        lines.push(
            name + " { " + shown.map(d => d.prop + ": " + d.before + " -> " + d.after).join("; ")
            + (folded > 0 ? "; +" + folded + " properties following color" : "") + " }"
        );
    }
    return lines;
}

function printDiffs(diffs, limit)
{
    const lines = formatDiffs(diffs);
    for (const line of lines.slice(0, limit)) { console.log("        " + line); }
    if (lines.length > limit) { console.log("        ... and " + (lines.length - limit) + " more elements"); }
}

async function main()
{
    const baseline = getBaselineSheets();
    const control = getControlSheets(baseline);
    const current = getStylesheetLinks(fs.readFileSync(path.join(repoRoot, "index.html"), "utf8"));
    console.log("baseline (" + revision + "): " + baseline.map(s => s.href).join(" "));
    console.log("working tree:   " + current.join(" "));

    execFileSync("tsc", [], { cwd: repoRoot, stdio: "inherit" });
    const devtoolsPort = await startServers();
    const { controlResult, results, failedRequests, consoleErrors } = await run(devtoolsPort, baseline, control);

    console.log("differences read <baseline> -> <working tree>");
    const controlOk = controlResult.diffs.length > 0 && controlResult.diffs.every(d => d.name === "div.loadingAnimation");
    console.log((controlOk ? "ok    " : "FAIL  ") + "negative control (spinner rule moved first): " + controlResult.diffs.length + " differences");
    printDiffs(controlResult.diffs, 10);

    let differences = 0;
    for (const r of results)
    {
        differences += r.diffs.length;
        console.log((r.diffs.length === 0 ? "ok    " : "DIFF  ") + r.state + " @" + r.width + "px" + (r.forced ? ", forced" : "")
            + ": " + r.diffs.length + " differences in " + r.entries + " entries");
        printDiffs(r.diffs, 15);
    }
    for (const f of failedRequests) { console.log("warning: failed request " + f); }
    for (const c of consoleErrors) { console.log("warning: console error " + c); }

    if (!controlOk) { return 2; }
    return differences === 0 ? 0 : 1;
}

for (const signal of ["SIGINT", "SIGTERM"])
{
    process.on(signal, async () => { await cleanUp(); process.exit(130); });
}
const deadline = setTimeout(async () =>
{
    console.error("compare-styles: gave up after 5 minutes");
    await cleanUp();
    process.exit(2);
}, 300000);
try
{
    process.exitCode = await main();
}
catch (e)
{
    console.error("compare-styles: " + (e instanceof HarnessError ? e.message : (e.stack ?? e)));
    process.exitCode = 2;
}
finally
{
    clearTimeout(deadline);
    await cleanUp();
}
