"""python tests/profile_test.py — the mood scoring of track_profile (no network).

The numbers below are real measurements of real songs, taken on 2026-10-12."""
import os
import sys
import tempfile

os.environ["NOTKA_DATA_DIR"] = tempfile.mkdtemp()
os.environ["NOTKA_NO_PROFILING"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from music_resolver.services import track_profile as tp  # noqa: E402

SONGS = {
    "Max Richter - On the Nature of Daylight": dict(energy=0.02, valence=0.02, danceability=0.11, acousticness=0.88, instrumentalness=0.94, speechiness=0.04, tempo=90),
    "Billie Eilish - when the party's over": dict(energy=0.13, valence=0.25, danceability=0.49, acousticness=0.93, instrumentalness=0.03, speechiness=0.06, tempo=106),
    "Labrinth - Jealous": dict(energy=0.10, valence=0.20, danceability=0.53, acousticness=0.91, instrumentalness=0.01, speechiness=0.06, tempo=104),
    "Metallica - Enter Sandman": dict(energy=0.82, valence=0.50, danceability=0.65, acousticness=0.03, instrumentalness=0.38, speechiness=0.05, tempo=123),
    "Eminem - Lose Yourself": dict(energy=0.65, valence=0.63, danceability=0.71, acousticness=0.23, instrumentalness=0.0, speechiness=0.24, tempo=108),
    "Daft Punk - One More Time": dict(energy=0.65, valence=0.49, danceability=0.68, acousticness=0.04, instrumentalness=0.33, speechiness=0.08, tempo=120),
    "Pharrell - Happy": dict(energy=0.58, valence=0.81, danceability=0.58, acousticness=0.67, instrumentalness=0.0, speechiness=0.05, tempo=153),
    "Monetochka - Kazhdyj raz": dict(energy=0.81, valence=0.69, danceability=0.75, acousticness=0.28, instrumentalness=0.03, speechiness=0.15, tempo=110),
    "Kendrick Lamar - HUMBLE.": dict(energy=0.55, valence=0.35, danceability=0.85, acousticness=0.06, instrumentalness=0.01, speechiness=0.18, tempo=121),
}
fails = 0


def ok(cond, msg):
    global fails
    print(("PASS " if cond else "FAIL ") + msg)
    fails += 0 if cond else 1


def top(song, n=3):
    fits = {m: tp.mood_fit(SONGS[song], m) for m in tp.MOODS}
    return [m for m, _ in sorted(fits.items(), key=lambda kv: -kv[1])[:n]], fits


print("mood fit of each song (best three):")
for name in SONGS:
    best, fits = top(name)
    print(f"  {name:42s} " + "  ".join(f"{m}={fits[m]:.2f}" for m in best))

ok("sleep" in top("Max Richter - On the Nature of Daylight", 3)[0], "Max Richter: sleep is in the top three")
ok("energize" not in top("Max Richter - On the Nature of Daylight", 4)[0], "Max Richter is not «Бодрое»")
ok(top("Labrinth - Jealous", 3)[0][0] in ("sad", "chill", "romance"), "Labrinth Jealous is sad / calm / romantic")
ok(tp.mood_fit(SONGS["Labrinth - Jealous"], "sad") > tp.mood_fit(SONGS["Eminem - Lose Yourself"], "sad") + 0.3, "Jealous is much sadder than Lose Yourself")
ok(top("Metallica - Enter Sandman", 2)[0][0] in ("workout", "energize"), "Metallica: workout / energize first")
ok(tp.mood_fit(SONGS["Metallica - Enter Sandman"], "sleep") < 0.2, "Metallica is not for sleep")
ok("party" in top("Daft Punk - One More Time", 3)[0], "Daft Punk: party in the top three")
ok("party" in top("Pharrell - Happy", 3)[0] or "energize" in top("Pharrell - Happy", 2)[0], "Happy is lively / party")
ok(tp.mood_fit(SONGS["Pharrell - Happy"], "sad") < 0.15, "Happy is not sad")
ok(tp.mood_fit(SONGS["Kendrick Lamar - HUMBLE."], "sad") < 0.35, "an aggressive rap banger is not «Грустное»")
ok(tp.mood_fit(SONGS["Eminem - Lose Yourself"], "romance") < 0.45, "Lose Yourself is not «Романтика»")
ok(tp.mood_fit(SONGS["Pharrell - Happy"], "focus") < 0.6, "a song with a bright vocal is not for concentration")
ok(tp.mood_fit(SONGS["Max Richter - On the Nature of Daylight"], "focus") > 0.6, "instrumental piano/strings is for concentration")
ok(tp.mood_fit(SONGS["Monetochka - Kazhdyj raz"], "energize") > tp.mood_fit(SONGS["Billie Eilish - when the party's over"], "energize") + 0.4, "a lively pop song beats a ballad for «Бодрое»")

# every mood separates the calm from the loud
for mood in ("chill", "sleep", "sad", "romance"):
    calm = max(tp.mood_fit(SONGS[s], mood) for s in ("Max Richter - On the Nature of Daylight", "Billie Eilish - when the party's over", "Labrinth - Jealous"))
    loud = max(tp.mood_fit(SONGS[s], mood) for s in ("Metallica - Enter Sandman", "Monetochka - Kazhdyj raz", "Daft Punk - One More Time"))
    ok(calm > loud, f"«{mood}»: the calm songs outrank the loud ones")

# the fallbacks: tags stand in for sound
ok((tp.tag_prior(["ambient", "classical"], "sleep") or 0) >= 0.7, "ambient/classical tags suggest sleep")
ok((tp.tag_prior(["thrash metal"], "workout") or 0) >= 0.7, "thrash metal tags suggest workout")
ok(tp.tag_prior(["thrash metal"], "sleep") is None, "metal says nothing about sleep")
ok(tp.mood_fit({}, "chill") is None and tp.mood_fit(None, "chill") is None, "no measurement -> None, not a guess")

# store: a track's own sound wins, then the artist's other tracks, then tags
tp._tracks_db().update({"yt:a1": dict(SONGS["Metallica - Enter Sandman"], ak=tp.artist_key("Metallica"))})
tp._artists_db().update({"foo": {"tags": ["ambient"], "at": 1}})
fit, how = tp.fit_for("yt:a1", "Metallica", "workout")
ok(how == "track" and fit > 0.7, f"own sound is used first ({how}, {fit})")
fit, how = tp.fit_for("yt:other", "Metallica & Friends", "workout")
ok(how == "artist" and fit > 0.6, f"the artist's other tracks stand in ({how}, {fit})")
fit, how = tp.fit_for("yt:x", "Foo", "sleep")
ok(how == "tags" and fit > 0.4, f"tags stand in when nothing is measured ({how}, {fit})")
fit, how = tp.fit_for("yt:z", "Foo", "workout")
ok(how == "tags" and fit <= 0.3, f"known genres that do not point to the mood count against it ({how}, {fit})")
fit, how = tp.fit_for("yt:y", "Nobody Known", "sleep")
ok(fit is None and how == "none", "nothing known -> no opinion")

print("\n" + (f"{fails} FAILED" if fails else "all passed"))
sys.exit(1 if fails else 0)
