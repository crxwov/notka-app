// node tests/karaoke_test.js : how a line's time is shared among its words (miniapp/app.js, karaokeTimes)
const fs = require("fs");
const path = require("path");
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const src = fs.readFileSync(path.join(__dirname, "..", "miniapp", "app.js"), "utf8").split(CR + LF).join(LF);
const i = src.indexOf("  function karaokeTimes(words, start, end) {");
const j = src.indexOf("  function karaokeStop() {");
if (i < 0 || j < 0) throw new Error("karaokeTimes not found");
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const karaokeTimes = new Function("clamp", src.slice(i, j) + LF + "return karaokeTimes;")(clamp);
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

const words = "Well, that's alright because I like the way it hurts".split(" ");
const t = karaokeTimes(words, 4, 9);
ok(t.length === words.length, "one time slot per word");
ok(Math.abs(t[0][0] - 4) < 1e-9, "the first word starts with the line");
ok(t.every((x, k) => x[1] > x[0] && (k === 0 || Math.abs(x[0] - t[k - 1][1]) < 1e-9)), "slots follow each other without gaps or overlaps");
ok(t[t.length - 1][1] <= 9 - 0.1, "the last word ends before the next line starts");
ok(t[6][1] - t[6][0] < t[3][1] - t[3][0], "a short word (the) is lit faster than a long one (because)");
const short = karaokeTimes(["Hey"], 10, 11);
ok(short[0][1] <= 11, "a one-word line fits its slot (" + short[0][1].toFixed(2) + ")");
const gap = karaokeTimes("Hello darkness my old friend".split(" "), 0, 60);
ok(gap[gap.length - 1][1] < 6, "a long gap after a line does not stretch the singing (" + gap[gap.length - 1][1].toFixed(2) + " s)");
const fast = karaokeTimes(words, 0, 2);
ok(fast[fast.length - 1][1] <= 2, "a quickly sung line is squeezed into its time");

// the clock that carries audio.currentTime between its coarse readings
const ci = src.indexOf("  function karaokeClockStep(c, reading, nowMs, paused, rate) {");
const cj = src.indexOf("  const smoothstep");
const karaokeClockStep = new Function(src.slice(ci, cj) + LF + "return karaokeClockStep;")();
// a player that reports its time every 250 ms, drawn at 60 fps for 2 seconds
const c = { base: 0, at: 0, last: -1 };
let worst = 0, prev = -1, monotone = true, maxStep = 0;
for (let f = 0; f <= 120; f++) {
  const nowMs = f * 16.667;
  const truth = nowMs / 1000;
  const reading = Math.floor(truth / 0.25) * 0.25;         // what audio.currentTime says
  const t = karaokeClockStep(c, reading, nowMs, false, 1);
  worst = Math.max(worst, Math.abs(t - truth));
  if (prev >= 0) { if (t < prev - 1e-9) monotone = false; maxStep = Math.max(maxStep, t - prev); }
  prev = t;
}
ok(worst < 0.03, "the carried clock is within 30 ms of the truth between readings (worst " + (worst * 1000).toFixed(0) + " ms)");
ok(monotone, "the carried clock never goes backwards");
ok(maxStep < 0.03, "no frame jumps by more than 30 ms (largest " + (maxStep * 1000).toFixed(0) + " ms)");
const raw = []; let lastRaw = -1, rawMax = 0;
for (let f = 0; f <= 120; f++) { const r = Math.floor((f * 16.667 / 1000) / 0.25) * 0.25; if (lastRaw >= 0) rawMax = Math.max(rawMax, r - lastRaw); lastRaw = r; }
ok(rawMax >= 0.25 - 1e-9, "(for comparison: the raw reading jumps by " + (rawMax * 1000).toFixed(0) + " ms at once)");
const paused = { base: 0, at: 0, last: -1 };
karaokeClockStep(paused, 10, 0, false, 1);
ok(karaokeClockStep(paused, 10, 5000, true, 1) === 10, "paused: the time stands still");
const sought = { base: 0, at: 0, last: -1 };
karaokeClockStep(sought, 10, 0, false, 1);
ok(Math.abs(karaokeClockStep(sought, 90, 100, false, 1) - 90) < 0.001, "a seek is followed at once");
console.log(fails ? LF + fails + " FAILED" : LF + "all passed");
process.exit(fails ? 1 : 0);
