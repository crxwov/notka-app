const fs = require("fs");
const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
const src = fs.readFileSync(require("path").join(__dirname, "..", "miniapp", "app.js") , "utf8").split(CR + LF).join(LF);
const pick = (a, b) => {
  const i = src.indexOf(a);
  if (i < 0) throw new Error("start marker not found: " + a);
  const j = src.indexOf(b, i);
  if (j < 0) throw new Error("end marker not found: " + b);
  return src.slice(i, j + b.length);
};
const translit = pick("  const TRANSLIT = {", "};");
const loose = pick("  function looseKey(text) {", "return s.replace(/(.)\\1+/g, \"$1\");" + LF + "  }");
const taste = pick("  // <taste>", "// </taste>");
const mod = new Function(translit + LF + loose + LF + taste + LF + "return { buildTaste, tasteOf, rankByTasteWith, artistParts, looseKey };")();
const { buildTaste, rankByTasteWith, tasteOf } = mod;
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };

const mk = (artist, title) => ({ id: artist + "|" + title, artist, title });
const results = [
  mk("Random A", "Love 1"), mk("Random B", "Love 2"), mk("Random C", "Love 3"), mk("Random D", "Love 4"),
  mk("Random E", "Love 5"), mk("Random F", "Love 6"), mk("Eminem", "Love The Way You Lie"),
  mk("Random G", "Love 8"), mk("Random H", "Love 9"), mk("Random I", "Love 10"),
  mk("Random J", "Love 11"), mk("Labrinth", "Love 12"),
];
const empty = buildTaste({});
ok(rankByTasteWith(empty, results).map((t) => t.id).join() === results.map((t) => t.id).join(), "no taste -> order untouched");

const t = buildTaste({ listened: { Eminem: 200 }, favorites: [mk("Labrinth", "x"), mk("Labrinth", "y")], followed: [], playlistTracks: [], recent: [] });
const ranked = rankByTasteWith(t, results).map((x) => x.artist);
console.log("   top 4:", ranked.slice(0, 4).join(" | "));
ok(ranked[0] === "Eminem", "heavily listened artist comes first");
ok(ranked.indexOf("Labrinth") < results.findIndex((x) => x.artist === "Labrinth"), "liked artist climbs");
ok(ranked.filter((a) => a.startsWith("Random")).join() === results.filter((x) => x.artist.startsWith("Random")).map((x) => x.artist).join(), "strangers keep their relative order");

const weak = buildTaste({ listened: { "Random J": 1 } });
const r2 = rankByTasteWith(weak, results).map((x) => x.artist);
ok(r2.indexOf("Random J") >= results.findIndex((x) => x.artist === "Random J") - 3, "one minute of listening moves it only a little");

const ru = buildTaste({ followed: ["Тревис Скотт"] });
ok(tasteOf(ru, "Travis Scott") > 0, "Cyrillic name matches Latin name");
const j = buildTaste({ followed: ["Kanye West"] });
ok(tasteOf(j, "Kanye West, Jay-Z") > 0 && tasteOf(j, "Drake") === 0, "joint credit counts for the liked artist; a stranger does not");
ok(new Set(rankByTasteWith(t, results).map((x) => x.id)).size === results.length, "same tracks, none lost");
console.log(fails ? LF + fails + " FAILED" : LF + "all passed");
process.exit(fails ? 1 : 0);
