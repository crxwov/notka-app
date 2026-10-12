# Mood, character and genre of a track: research and design (2026-10-12)

## How others do it
- **Spotify**: audio features from The Echo Nest (energy, valence, danceability, acousticness, tempo, instrumentalness) + editorial playlists + listening behaviour. Its public `audio-features`, `recommendations` and `related-artists` endpoints return 403 for apps created after 2024-11-27, so they are not an option.
- **Yandex Music «Моя волна»**: an audio model that reads the content of a track, plus behaviour (switching instrumental tracks away → more vocals). Not available to outsiders.
- **YouTube Music**: editorial «Moods & genres» playlists. This is what Нотка used; it says nothing about an individual track.
- **Open research**: Essentia (mood classifiers happy/sad/relaxed/aggressive/party, Discogs-EffNet 400 styles). Needs TensorFlow; too heavy for the 1 vCPU / 2 GB server.

## Sources tested live (2026-10-12)
| Source | Gives | Verdict |
|---|---|---|
| ReccoBeats `POST /v1/analysis/audio-features` (multipart `audioFile`, MP3 44.1 kHz stereo, ~30 s) | energy, valence, danceability, acousticness, instrumentalness, speechiness, tempo, loudness | **Used.** No key. Discriminates well on 9 real songs (Max Richter energy 0.02, Metallica 0.82, Pharrell valence 0.81). Lookup by name/ISRC is NOT supported, only by Spotify id or audio upload. 502s happen. Terms of use not read: check before scaling. |
| MusicBrainz artist `inc=tags+genres` | genres and tags per artist (Max Richter → ambient, classical, minimalism; Metallica → thrash metal…) | **Used** per artist, cached 90 days, 1 request/s. Per-recording tags are almost always empty. |
| Deezer search/track/album | album genre (coarse), `bpm` (often 0), ISRC | Not used yet. Fallback for genre. |
| iTunes Search | `primaryGenreName` (coarse: «Soundtrack») | Rate-limited (403 after a few calls). Not used. |
| Last.fm `track.getTopTags` | crowd tags («chill», «sad», «workout»): the best mood vocabulary | **Not used: needs a free API key** (owner registers at last.fm/api). Planned as next source. |
| Spotify embed anon token → `/v1/search` | Spotify ids | Could not be tested from a Russian IP; the server in Germany can reach Spotify. Open question. |

## Design (implemented)
`music_resolver/services/track_profile.py`
1. When a track is played (`/prepare` now receives title/artist/duration) and its audio is on disk, a background worker cuts two 30 s stretches, asks ReccoBeats for features, averages them, stores in `data/track_profiles.json`. **Global**: every track anyone plays is profiled for everyone.
2. The artist's genres/tags are fetched from MusicBrainz in the same worker (`data/artist_tags.json`).
3. `mood_fit(features, mood)` → 0..1 for 8 moods. Each mood has a «gate» (sad needs low valence, party needs danceability, sleep/chill need low energy, focus needs few words) so that other traits cannot rescue a wrong track. Verified by `tests/profile_test.py` on real measurements.
4. `fit_for()` uses the track's own sound, else the artist's other tracks (×0.9), else genre tags (×0.7, weak), else «unknown».
5. `mood_mix._by_mood` ranks mood-mix candidates by that fit, drops measured mismatches, keeps unknowns in the middle, and queues unknown artists for lookup. Seeds whose own sound suits the mood go first. A running mood mix is topped up from the same mood (`/mood`), not from whatever plays.
6. `GET /profile?source&id&artist` shows what is known (for checking).

## Known limits
- Profiles grow with listening: on day one almost nothing is measured, so moods lean on tags and YouTube playlists; it gets better every day.
- Features from a 30 s excerpt vary (energy 0.59–0.81 on one track by excerpt); two excerpts are averaged.
- Genres are not shown to listeners yet; they are used only inside ranking.
- ReccoBeats is a third party: audio excerpts leave the server. `NOTKA_NO_PROFILING=1` switches the whole thing off; `AUDIO_FEATURES_URL` can point to another service.

## Next
Last.fm key → crowd mood tags; show genre/mood chips on a track; use mood fit in «Мой микс» for evening/morning; own audio model if the service becomes unreliable.
