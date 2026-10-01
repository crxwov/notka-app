// Promo codes for «Нотка Плюс». Needs tests/serve_local.py running (it reads BOT_TOKEN from .env).
//   node tests/promo.mjs
import { launch } from "./cdp.mjs";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BASE = "http://127.0.0.1:8099";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const dir = path.join(here, "shots");
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(ok ? "PASS" : "FAIL", name, extra); };

const token = (fs.readFileSync(path.join(root, ".env"), "utf8").match(/^BOT_TOKEN=(.+)$/m) || [])[1].trim();
// initData exactly as Telegram signs it for a Mini App
function initData(userId, tokenToSign = token) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAtest", user: JSON.stringify({ id: userId, first_name: "Тест" }) };
  const checkString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(tokenToSign).digest();
  fields.hash = crypto.createHmac("sha256", secret).update(checkString).digest("hex");
  return new URLSearchParams(fields).toString();
}
const py = (code) => execFileSync(path.join(root, "venv", "Scripts", "python.exe"), ["-c", `import sys; sys.path.insert(0, r"${root}")\nfrom music_resolver.services import plus_store as s\n${code}`], { cwd: root, encoding: "utf8" });
const USERS = [990000001, 990000002, 990000003, 990000004];
const cleanup = () => py(`import json\nd = s._load()\nfor c in ("TESTKOD", "TESTLINK"): d["codes"].pop(c, None)\nfor u in ${JSON.stringify(USERS)}: d["users"].pop(str(u), None)\ns._save(d)`);
const redeem = async (userId, code, data) => {
  const res = await fetch(`${BASE}/plus/redeem`, { method: "POST", headers: { "content-type": "application/json", "X-Telegram-Init-Data": data ?? initData(userId) }, body: JSON.stringify({ code }) });
  return { status: res.status, body: await res.json() };
};

cleanup();
py(`s.create_code("testkod", 30, 2)\ns.create_code("TESTLINK", 7, 50, 3)`);

const b = await launch({ dir });
// Telegram's own script, loaded by the page, would replace WebApp with an empty one (we are not in Telegram),
// so the stand-in is made impossible to overwrite
const asUser = (id) => b.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const app = { initData: ${JSON.stringify(initData(id))}, initDataUnsafe: { user: { id: ${id}, first_name: "Тест" } }, ready() {}, expand() {}, isVersionAtLeast() { return false; } }; const box = {}; Object.defineProperty(box, "WebApp", { get: () => app, set() {} }); Object.defineProperty(window, "Telegram", { get: () => box, set() {} }); })();` });
const text = (id) => b.eval(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`);
try {
  // ---- the server alone ----
  const anon = await (await fetch(`${BASE}/plus/status`)).json();
  check("without Telegram nobody is recognised", anon.plus === false && anon.known === false);
  check("a code can't be redeemed without Telegram", (await redeem(0, "TESTKOD", "")).status === 401);
  const forged = await redeem(USERS[2], "TESTKOD", initData(USERS[2], "123456:not-the-real-token"));
  check("initData signed with another token is refused", forged.status === 401, JSON.stringify(forged.body));

  // ---- in the app, as a Telegram user ----
  const first = await asUser(USERS[0]);
  await b.goto(`${BASE}/app/`);
  await b.eval(`localStorage.clear(); localStorage.setItem("notka_state_v2", ${JSON.stringify(JSON.stringify({ favorites: [], playlists: [], onboardingSeenV2: true }))}); true`);
  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.click("#home-avatar-btn");
  await b.click("#menu-plus");
  await b.eval("document.getElementById('plus-promo-btn').click(); true");
  await b.sleep(400);
  const type = (v) => b.eval(`(() => { const i = document.getElementById("promo-input"); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event("input")); return true; })()`);
  await type("NOSUCHCODE");
  await b.click("#promo-confirm");
  await b.waitFor("!document.getElementById('promo-error').hidden", 10000, "error for a wrong code");
  check("a wrong code is explained", (await text("promo-error")).includes("нет"), await text("promo-error"));
  await b.shot("promo-1-error");

  await type(" testkod ");
  await b.click("#promo-confirm");
  await b.waitFor("!document.getElementById('promo-step-done').hidden", 10000, "code accepted");
  await b.sleep(700);
  await b.shot("promo-2-done");
  check("the code works in any case, with spaces around", (await text("promo-done-until")).startsWith("30 дней Плюса"), await text("promo-done-until"));
  check("the limited run is shown", (await text("promo-done-left")).includes("первых 2") && (await text("promo-done-left")).endsWith("1"), await text("promo-done-left"));
  await b.click("#promo-done-btn");
  await b.sleep(400);
  check("the page says until when Плюс is on", (await text("plus-bar-note")).startsWith("Плюс включён до") && await b.eval("getComputedStyle(document.getElementById('plus-buy-btn')).display === 'none'"), await text("plus-bar-note"));
  await b.shot("promo-3-active");

  await b.goto(`${BASE}/app/`);
  await b.waitFor("document.body.dataset.screen !== 'splash'", 8000, "leave splash");
  await b.sleep(800);
  const st = await (await fetch(`${BASE}/plus/status`, { headers: { "X-Telegram-Init-Data": initData(USERS[0]) } })).json();
  check("the server remembers Плюс for this user", st.plus === true && st.known === true && st.until > Date.now() / 1000 + 29 * 86400);

  // ---- the run really is limited ----
  check("the same user can't use a code twice", (await redeem(USERS[0], "TESTKOD")).body.error.code === "ALREADY_USED");
  const second = await redeem(USERS[1], "TestKod");
  check("the second listener gets the last activation", second.status === 200 && second.body.left === 0, JSON.stringify(second.body));
  check("the third one is told the code is gone", (await redeem(USERS[2], "TESTKOD")).body.error.code === "EXHAUSTED");

  // ---- a link from an ad: the code activates by itself ----
  await b.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: first.identifier });
  await asUser(USERS[3]);
  await b.goto(`${BASE}/app/?promo=TESTLINK`);
  await b.waitFor("!document.getElementById('promo-step-done').hidden", 20000, "code from the link accepted");
  check("a link with a code opens Плюс and activates it", (await b.eval("document.body.dataset.screen")) === "plus" && (await text("promo-done-until")).startsWith("7 дней Плюса"), await text("promo-done-until"));
  check("no page errors", b.errors.length === 0, b.errors.join(" | ").slice(0, 400));
} catch (err) {
  failed++;
  console.log("FAIL", err.message);
  await b.shot("promo-fail");
} finally {
  await b.close();
  cleanup();
}
process.exit(failed ? 1 : 0);
