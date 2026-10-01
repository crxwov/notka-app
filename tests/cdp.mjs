// Minimal Chrome DevTools driver: launches headless Chrome, exposes
// evaluate / screenshot / sleep, and collects console errors.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

export async function launch({ port = 9333, width = 390, height = 844, dir }) {
  mkdirSync(dir, { recursive: true });
  const proc = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(dir, "profile-" + Date.now())}`,
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${width},${height}`,
    "about:blank",
  ], { stdio: "ignore" });

  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === "page");
    } catch (e) { /* not up yet */ }
  }
  if (!target) throw new Error("Chrome did not start");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let nextId = 1;
  const pending = new Map();
  const errors = [];
  const requests = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push("EXCEPTION: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    } else if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
      errors.push(msg.params.type + ": " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    } else if (msg.method === "Network.requestWillBeSent") {
      requests.push(msg.params.request.url);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });

  const api = {
    errors,
    requests,
    send,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    async goto(url) { await send("Page.navigate", { url }); await api.sleep(600); },
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async waitFor(expression, timeout = 20000, label = expression) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await api.eval(expression)) return true;
        await api.sleep(250);
      }
      throw new Error("timeout waiting for: " + label);
    },
    async click(selector) {
      const ok = await api.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
      if (!ok) throw new Error("no element: " + selector);
      await api.sleep(350);
    },
    async shot(name) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      const file = path.join(dir, name + ".png");
      writeFileSync(file, Buffer.from(r.data, "base64"));
      return file;
    },
    async close() { try { await send("Browser.close"); } catch (e) { /* gone */ } proc.kill(); },
  };
  return api;
}
