// node tests/mix_test.js : the rules of «Мой микс» (miniapp/mix.js)
const path = require("path");
const Mix = require(path.join(__dirname, "..", "miniapp", "mix.js"));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };

const T = (artist, title, n) => ({ id: `${artist}|${title}${n || ""}`, artist, title });
const maxRun = (list) => {
  let best = 1, run = 1;
  for (let i = 1; i < list.length; i++) { run = list[i].artist === list[i - 1].artist ? run + 1 : 1; best = Math.max(best, run); }
  return best;
};

// a listener: loves Eminem and Labrinth, dislikes Drake (skips him)
const familiar = [T("Eminem", "Lose Yourself"), T("Eminem", "Mockingbird"), T("Labrinth", "Jealous"), T("Labrinth", "Still Don't Know My Name"),
  T("Oasis", "Wonderwall"), T("Oasis", "Champagne Supernova"), T("Kanye West", "Runaway"), T("Noize MC", "Выдыхай")];
const adjacent = [];
for (let i = 0; i < 12; i++) adjacent.push(T("Eminem", "Deep Cut " + i));        // a flood of one artist
for (let i = 0; i < 6; i++) adjacent.push(T("Drake", "Song " + i));              // disliked
for (let i = 0; i < 10; i++) adjacent.push(T("Newcomer " + i, "Fresh " + i));
adjacent.push(T("Labrinth", "Lose Yourself (Slowed + Reverb)"));                 // spam version
adjacent.push(T("Eminem", "Mockingbird (Official Video)"));                      // the same song as a familiar one
adjacent.push(T("Newcomer 1", "Fresh 1 [Remastered]"));                          // duplicate of a candidate
const affinity = (a) => ({ eminem: 0.8, labrinth: 0.7, oasis: 0.5 }[String(a).toLowerCase()] || 0);
const skips = (a) => (String(a).toLowerCase() === "drake" ? 6 : 0);
const skipRate = (a) => (String(a).toLowerCase() === "drake" ? 0.9 : 0);
const base = { familiar, adjacent, affinity, trackWeight: () => 0.3, skipRate, skips, recentIds: new Set(), exclude: new Set(), size: 24 };

const mix = Mix.assemble(Object.assign({ rng: Mix.mkRng(7) }, base));
console.log("   " + mix.slice(0, 12).map((t) => t.artist).join(" | "));

ok(mix.length >= 20, "a full mix is built (" + mix.length + ")");
ok(!mix.some((t) => t.artist === "Drake"), "an artist the listener keeps skipping is not served as new");
ok(!mix.some((t) => /slowed|reverb/i.test(t.title)), "slowed + reverb versions are left out");
ok(new Set(mix.map(Mix.songKey)).size === mix.length, "no song twice, even under another name");
ok(new Set(mix.map((t) => t.id)).size === mix.length, "no track twice");
ok(maxRun(mix) === 1, "the same artist never plays twice in a row");
const eminemCount = mix.filter((t) => t.artist === "Eminem").length;
ok(eminemCount <= 6, "one artist does not take over (" + eminemCount + " of " + mix.length + ")");
const famIds = new Set(familiar.map((t) => t.id));
const famShare = mix.filter((t) => famIds.has(t.id)).length / mix.length;
ok(famShare > 0.25 && famShare < 0.55, "familiar and new are mixed, about 40/60 (" + Math.round(famShare * 100) + "% familiar)");
ok(!famIds.has(mix[0].id), "the first track is a discovery, then comes the familiar");

// recent tracks are held back
const recent = new Set(familiar.slice(0, 4).map((t) => t.id));
const mix2 = Mix.assemble(Object.assign({}, base, { recentIds: recent, rng: Mix.mkRng(7) }));
const firstHalf = mix2.slice(0, 12).filter((t) => recent.has(t.id)).length;
ok(firstHalf === 0, "what played in the last two days stays out of the first half");

// the queue is excluded, so extending does not repeat
const queued = new Set(mix.slice(0, 10).map((t) => t.id));
const more = Mix.assemble(Object.assign({}, base, { exclude: queued, rng: Mix.mkRng(11) }));
ok(!more.some((t) => queued.has(t.id)), "extension does not repeat what is already queued");

// a listener who really listens to slowed versions keeps them
const keep = Mix.assemble(Object.assign({}, base, { allowSpam: true, rng: Mix.mkRng(7) }));
ok(keep.some((t) => /slowed/i.test(t.title)), "if the listener's own library has such versions, they are allowed");

// seeds
const pool = familiar.concat(adjacent.slice(0, 6));
const seeds = Mix.pickSeeds(pool, (t) => affinity(t.artist) + 0.1, 5, Mix.mkRng(3));
ok(seeds.length === 5 && new Set(seeds.map((t) => t.id)).size === 5, "five different seeds");
ok(Object.values(seeds.reduce((m, t) => ((m[t.artist] = (m[t.artist] || 0) + 1), m), {})).every((n) => n <= 2), "no more than two seeds per artist");

// determinism for a fixed seed, variety across seeds
const a = Mix.assemble(Object.assign({}, base, { rng: Mix.mkRng(1) })).map((t) => t.id).join();
const b = Mix.assemble(Object.assign({}, base, { rng: Mix.mkRng(1) })).map((t) => t.id).join();
const c = Mix.assemble(Object.assign({}, base, { rng: Mix.mkRng(2) })).map((t) => t.id).join();
ok(a === b && a !== c, "same chance -> same mix; another chance -> another mix");

// poor input never crashes
ok(Mix.assemble({ familiar: [], adjacent: [] }).length === 0, "nothing in, nothing out");
ok(Mix.assemble({ familiar, adjacent: [], size: 5 }).length === 5, "only familiar tracks: still a mix");

console.log(fails ? "\n" + fails + " FAILED" : "\nall passed");
process.exit(fails ? 1 : 0);
