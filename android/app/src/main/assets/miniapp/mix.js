/* «Мой микс»: Нотка собирает его сама.
 *
 * YouTube Music здесь только поставщик кандидатов («что играет рядом»). Что из этого попадёт в микс
 * и в каком порядке, решают эти правила, и они не зависят от того, что сочтёт нужным показать YouTube:
 *
 *  1. в микс идёт и знакомое, и новое (по умолчанию 40 / 60), по очереди, а не пачками;
 *  2. выше то, что ближе к вкусу: знакомые исполнители, сердечки, что слушали долго;
 *  3. ниже или совсем нет того, что человек пропускает: исполнитель с частыми пропусками выпадает;
 *  4. недавно игравшее не повторяется (последние двое суток);
 *  5. одинаковые песни (перезаливы, «(Official Video)», «feat.») считаются одной;
 *  6. один исполнитель не идёт три раза подряд и не больше двух раз на дюжину;
 *  7. всякие slowed / sped up / 8D / nightcore не берутся, если у человека таких нет в любимом.
 *
 * Функции чистые (ничего не знают про экран и сеть), поэтому проверяются тестом tests/mix_test.js.
 */
(function (root) {
  "use strict";

  const SPAM = /\b(slowed|sped\s*up|speed\s*up|8d(\s*audio)?|nightcore|karaoke|bass\s*boosted|reverb(ed)?|1\s*hour|10\s*hours?)\b/i;
  const SOFT = /\b(live|remix|cover|acoustic|instrumental|mashup|lo-?fi|tiktok|version|edit)\b/i;

  // the same song under different names: «Song (Official Video)», «Song - feat. X», «Song [Remastered]»
  function songKey(track) {
    const title = String((track && track.title) || "")
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, " ")
      .replace(/\b(feat\.?|ft\.?|featuring|official|video|audio|lyrics?|remaster(ed)?|hd|hq)\b.*$/i, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    const artist = String((track && track.artist) || "").toLowerCase().split(/,|&| feat\.? | x /)[0].replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return title + "|" + artist;
  }

  function mkRng(seed) {
    if (seed == null) return Math.random;
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // `weight(track)` >= 0 says how much a track deserves to be a seed (taste, a heart, recency);
  // picked at random in proportion to it, none twice, and at most two from one artist
  function pickSeeds(tracks, weight, n, rng) {
    rng = rng || Math.random;
    const pool = tracks.map((t) => ({ t, w: Math.max(0.05, weight(t)) }));
    const out = [];
    const perArtist = new Map();
    while (out.length < n && pool.length) {
      const total = pool.reduce((s, x) => s + x.w, 0);
      let r = rng() * total;
      let i = 0;
      for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
      const [picked] = pool.splice(i, 1);
      const key = String(picked.t.artist || "").toLowerCase();
      if ((perArtist.get(key) || 0) >= 2) continue;
      perArtist.set(key, (perArtist.get(key) || 0) + 1);
      out.push(picked.t);
    }
    return out;
  }

  /*  o = {
   *    familiar: [track], adjacent: [track],
   *    affinity(artist) -> 0..1,       trackWeight(track) -> 0..1 (a heart, played a lot),
   *    skipRate(artist) -> 0..1,       skips(artist) -> count,
   *    recentIds: Set of ids played lately,  exclude: Set of ids already in the queue,
   *    allowSpam: bool (the listener has such versions of their own),
   *    familiarShare: 0..1 (default 0.4), size, rng
   *  }
   */
  function assemble(o) {
    const rng = o.rng || Math.random;
    const size = o.size || 40;
    const share = o.familiarShare == null ? 0.4 : o.familiarShare;
    const exclude = o.exclude || new Set();
    const recent = o.recentIds || new Set();
    const seenSong = new Set();

    const usable = (t, kind) => {
      if (!t || !t.id || exclude.has(t.id)) return false;
      if (!o.allowSpam && SPAM.test(t.title || "")) return false;
      // an artist who is skipped again and again is not played back to them as «new»
      if (kind === "adjacent" && o.skips && o.skips(t.artist) >= 3 && o.skipRate && o.skipRate(t.artist) > 0.6) return false;
      return true;
    };
    const scored = (list, kind) => {
      const seen = new Set();
      return list
        .filter((t) => usable(t, kind))
        .filter((t) => { const k = songKey(t); if (seen.has(k)) return false; seen.add(k); return true; })
        .map((t) => {
          let s = (o.affinity ? o.affinity(t.artist) : 0) * 1.0;
          if (kind === "familiar" && o.trackWeight) s += o.trackWeight(t) * 0.8;
          if (o.skipRate) s -= o.skipRate(t.artist) * 1.5;
          if (SOFT.test(t.title || "")) s -= 0.35;
          if (recent.has(t.id)) s -= 1.2;
          s += rng() * 0.6; // a little chance, so the mix is not the same every time
          return { t, s };
        })
        .sort((a, b) => b.s - a.s);
    };

    const pools = { familiar: scored(o.familiar || [], "familiar"), adjacent: scored(o.adjacent || [], "adjacent") };
    const out = [];
    const recentArtists = [];
    let fam = 0;

    const artistOf = (t) => String(t.artist || "").toLowerCase().split(/,|&| feat\.? | x /)[0].trim();
    const perArtistCap = Math.max(3, Math.ceil(size * 0.15));
    const count = new Map();
    // how strict a place for the next track is: 0 is the full set of rules, 3 is «anything left»
    const fits = (t, level) => {
      if (seenSong.has(songKey(t))) return false;
      const a = artistOf(t);
      if (level >= 3) return out.length < 8; // «anything left» only to avoid an empty mix; a short mix beats a flood
      if (recentArtists[recentArtists.length - 1] === a) return false;        // never twice in a row
      if (recent.has(t.id)) return false;                                     // played in the last two days
      if (level >= 2) return true;
      if (recentArtists.slice(-3).includes(a)) return false;                  // not three in a row
      if ((count.get(a) || 0) >= perArtistCap) return false;                  // one artist does not take over
      if (level >= 1) return true;
      return recentArtists.slice(-12).filter((x) => x === a).length < 2;      // two per dozen
    };
    const take = (kind) => {
      const other = kind === "familiar" ? "adjacent" : "familiar";
      // the strictest level wins across both lists before any rule is relaxed
      for (let level = 0; level <= 3; level++) {
        for (const k of [kind, other]) {
          const idx = pools[k].findIndex(({ t }) => fits(t, level));
          if (idx >= 0) return { t: pools[k].splice(idx, 1)[0].t, kind: k };
        }
      }
      return null;
    };

    while (out.length < size && (pools.familiar.length || pools.adjacent.length)) {
      // familiar and new in turn, in the share asked for
      const want = out.length === 0 ? "adjacent" : (fam / out.length < share ? "familiar" : "adjacent");
      const got = take(want);
      if (!got) break;
      push(got.t, got.kind);
    }
    function push(t, kind) {
      out.push(t);
      seenSong.add(songKey(t));
      const a = artistOf(t);
      recentArtists.push(a);
      count.set(a, (count.get(a) || 0) + 1);
      if (kind === "familiar") fam++;
    }
    return out;
  }

  root.NotkaMix = { songKey, pickSeeds, assemble, mkRng, SPAM };
  if (typeof module !== "undefined" && module.exports) module.exports = root.NotkaMix;
})(typeof window !== "undefined" ? window : globalThis);
