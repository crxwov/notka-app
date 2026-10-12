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
console.log(fails ? LF + fails + " FAILED" : LF + "all passed");
process.exit(fails ? 1 : 0);
