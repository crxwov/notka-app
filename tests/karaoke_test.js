// node tests/karaoke_test.js : how real word timings become light slots (miniapp/app.js, karaokeTimes)
const fs = require("fs");
const path = require("path");
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const src = fs.readFileSync(path.join(__dirname, "..", "miniapp", "app.js"), "utf8").split(CR + LF).join(LF);
const i = src.indexOf("  function karaokeTimes(wordList) {");
const j = src.indexOf("  function karaokeStop() {");
if (i < 0 || j < 0) throw new Error("karaokeTimes not found");
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const karaokeTimes = new Function("clamp", src.slice(i, j) + LF + "return karaokeTimes;")(clamp);
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

// real word timings: [from, to, text]
const w = [[4.0, 4.4, "Well, "], [4.4, 4.5, "a "], [5.0, 5.9, "alright"]];
const t = karaokeTimes(w);
ok(t.length === w.length, "one time slot per word");
ok(t[0][0] === 4.0 && t[0][1] === 4.4, "a word is lit from its own start to its own end");
ok(t[1][1] - t[1][0] >= 0.14 - 1e-9 && t[1][1] <= 5.0, "a very short word still takes a moment, but never runs into the next word");
ok(t[2][0] === 5.0 && Math.abs(t[2][1] - 5.9) < 1e-9, "a word after a pause starts at its own time (nothing is guessed)");
const tight = karaokeTimes([[1.0, 1.3, "a "], [1.1, 1.4, "b"]]);
ok(tight[0][1] <= 1.1 + 1e-9, "overlapping timings: the earlier word ends where the next begins");

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
