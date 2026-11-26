# Current work — crxwov

participant: crxwov
status: active
updated_at_utc: 2026-11-26T17:28:49Z
agent: Codex
branch: main

## Karaoke follow-up
- Scoped production patch against deployed web revision 5f14cf8. Inline parenthetical vocals now retain provider timing below the lead, TTML syllables join into whole words, words get a brief lift, and the active lead follows the cover midpoint.
- Verified 31 Python tests, JavaScript syntax, word transitions and backward seek, patch applicability, production health, and public asset hashes on notka.site.
- Deployed five runtime files. Backup: /opt/notka/hotfix-backups/lyrics-word-cues-d2NuMgEZ. Authenticated playback and visual acceptance remain unchecked.
- Artifact: server-patches/lyrics-word-cues.patch.

## Karaoke opt-in
- Deployed default-off karaoke setting and softer word transitions. Preserved synced line display and lyric parsing. Chromium fixture verified default, opt-in, transition, and restoration. Public health and asset hashes verified. Backup: /opt/notka/hotfix-backups/karaoke-option-f1OTz16R. Authenticated playback remains unchecked.

## Karaoke timing correction
- Deployed exact-video timing priority, TTML syllable grouping and overlapping background vocals, the media clock, and a stable word baseline. 33 tests passed. Public Monëy so big endpoint now returns Unison word timings, with backing vocals at 3.533–5.002 seconds. Public assets verified. Backup: /opt/notka/hotfix-backups/karaoke-timing-6yrR416W. End-to-end visual match during playback remains unchecked.

## Karaoke timeline and continuous fill
- Deployed whole-word color transition at completion, clock-based vocal intervals, near-identical backing-row suppression, and line fallback for unusable word timestamps. Verified Chromium timeline cases, four real provider payloads, and public asset hashes. Backup: /opt/notka/hotfix-backups/karaoke-words-JDjhW1jL. Authenticated playback remains unchecked.

## Karaoke word animation
- Deployed 240 ms whole-word fade and 460 ms glow at completion. Chromium verified intermediate brightness, stable geometry, final white, and no glow on seek. Public assets and health verified. Backup: /opt/notka/hotfix-backups/karaoke-fade-KnlTsJET. Authenticated playback remains unchecked.

## Ad-lib labeling and final word
- Deployed ad-lib role and timing correction. Verified token alignment, preserved alternate leads, removed guessed inline timing, and kept rows readable through final-word fade. 36 tests, Chromium timeline, health, public frontend hashes, and exact-track ad-lib timing passed. Backup: /opt/notka/hotfix-backups/karaoke-adlib-kHR5BHhl. Authenticated playback unchecked.

## Left-to-right karaoke fill
- Deployed left-to-right word fill from audio position, with a feathered edge and stable baseline. Single-word ad-libs over three seconds remain visible without an unreliable sweep. Chromium checked progress, seek, terminal word, and Right Foot Creep payload. Production hashes and health verified. Backup: /opt/notka/hotfix-backups/karaoke-sweep-WR1F94Pe. Authenticated playback unchecked.

## Uniform word fill
- Deployed a 220 ms maximum left-to-right sweep per word from its provider start. Short words finish by their timestamp; completed words hold through the gap. Verified JS timing cases, patch replay, health and public asset hashes. Backup: /opt/notka/hotfix-backups/karaoke-even-G3wG6hAl. Authenticated playback unchecked.

## Provider word duration
- Deployed explicit provider durations and a short fill only for inferred ends. 37 tests, JS timing cases, public hashes, and both provider payload shapes verified. Backup: /opt/notka/hotfix-backups/karaoke-duration-KHK4ENqU. Authenticated playback unchecked.

## Short word timestamps and vocal gaps
- Deployed short/zero duration word handling and separate visual end for inferred timings. Restored word mode on 11 Hatër rows. Verified real payload, zero-duration case, inferred pause cutoffs, production health and public hashes. Backup: /opt/notka/hotfix-backups/karaoke-pauses-Bu9oMFod. Authenticated playback unchecked.

## Karaoke visual finish
- Deployed a wider soft gradient edge, masked glint that follows the edge, and restrained finish glow. Chromium preview, geometry, reduced-motion behavior, and public assets verified. Timing logic unchanged. Backup: /opt/notka/hotfix-backups/karaoke-polish-0y55wDCF. Authenticated playback unchecked.

## Studio equalizer
- Local implementation verified. Simple presets preserved, Studio adds five parametric bands, response graph and automatic headroom. Compressor bypassed when normalization is off. Chromium verified transparent flat route, -6 dB band, boost headroom, mode persistence and 390 px layout. Patch checked against exact production files. Deployment and real-device audition pending authorization.

## Spicy Lyrics-inspired word animation
- Deployed original analog of Spicy Lyrics 1c02f47 word behavior: fixed-width neutral sweep, time-linked lift, scale and soft in-flight glow. Chromium verified progression, settle, seek and reduced motion. Hashes and health passed. Backup: /opt/notka/hotfix-backups/karaoke-motion-cXHaRnjP. Track playback and split-letter parity unchecked.

## Karaoke damped word spring
- Deployed critically damped word motion, with up to 1.02 px lift at 60 px type and continuous return after fill completion. Normal and reduced-motion Chromium checks, short-word series, and public hashes passed. First deploy rolled back on transient origin health failure; retry succeeded. Backup: /opt/notka/hotfix-backups/karaoke-spring-ptwMFir5. Authenticated playback unchecked.

## Softer karaoke sweep
- Deployed softened sweep, 100 ms minimum visual duration, subtler glow and 0.42 px maximum lift at 60 px. Verified intermediate frames, short words, seek, reduced motion, origin health and public hashes. Backup: /opt/notka/hotfix-backups/karaoke-soft-tQ7rDDlV. Authenticated playback unchecked.

## Karaoke line handoff and trailing fade
- Deployed slower centered line handoff, eased vertical and opacity transitions, and per-word trailing illumination fade. Chromium verified an interrupted glide, intermediate word fading, seek and reduced motion. Public asset hashes and origin health passed. Backup: /opt/notka/hotfix-backups/karaoke-handoff-JeDLHFBj. Authenticated playback unchecked.

## YouTube download retry
- Scope: local server patch for music_resolver/providers/youtube_common.py against Leksik's 7091560. No production changes or credentials.
- Acceptance: only an actual sign-in refusal refreshes the timer, cookie download tries the other route after a transient failure, and local regression checks pass.
- Baseline: both failures reproduced with stubbed calls. Leksik's latest coordination record marks his task completed.
- Result: server-patches/youtube-download-retry.patch prepared locally. Real sign-in refusal starts the monotonic window; successful cookie requests do not extend it. Both route orders retry the other route, and ordinary download remains available when preferred cookies fail.
- Verification: 20 pytest cases including four regressions, nine cookie checks, and byte-for-byte patch replay against 7091560 for LF and CRLF.
- Next: production deployment and a live playback check require separate release authorization. No code was pushed.
## YouTube provider rollout
- Authorized production rollout of youtube-download-retry.patch. Scope: one provider file and restart of notka. No other service or repository changes.
- Baseline is byte-identical to 7091560; origin health is good. Leksik's latest scoped work is completed.
- Result: deployed exactly one file, restarted notka, and verified expected hash df36ec32213588f3fa05179713c8893d9fa7c593ae9faa76416af989f8589bc8. Backup: /opt/notka/hotfix-backups/youtube-download-retry-fYuE9yr0.
- Validation: origin and public health OK, unit active, no error-priority journal entries in the post-restart check. Public YouTube Music cold prepare succeeded in 21.6 s; start and seek returned 206 and 64 KiB each. Broader smoke succeeded functionally, but two searches exceeded 8 s (one already exceeded it before rollout).
- Next: runtime rollout complete. Patch remains local in canonical notka-app, and no runtime code was pushed.
## Cold playback follow-up
- Scope: measure public cold first bytes and validate the provider's route metadata and duplicate download behavior after the deployed patch.
- Evidence: public prepare 21.6 s, live resolve budget 10 s, foreground full download 11.4 s with no slot wait.
- Verified public first bytes in 29.9 s and 35.9 s on distinct cold tracks. Provider manager logged 15 s resolve timeouts. One foreground download logged 19.2 s after the 10 s prepare lookup budget, with no slot wait.
- Prepared server-patches/youtube-cold-start-route.patch locally against current production bytes. It reports the actual lookup route and removes repeated identical cookie download/lookup attempts. 21 tests pass, including three new regressions, and replay matches the tested provider byte for byte.
- Cold latency is unresolved. No new rollout. The measured sequential resolve/download fallback remains; any change to how these two operations share a startup budget requires separate validation.
## Finland cold playback relay
- User selected fl-vpn. Scope: loopback YouTube range relay on fl-vpn, restricted SSH link, and optional live routing for YouTube on Notka. No VPN changes.
- Acceptance: cold playable M4A prefix in about two seconds, verified seek, warm/parallel request handling, no new disk audio cache, preserved fallback and unaffected providers.
- Baseline: five Finland cold tracks delivered in 1.07–1.28 s. German endpoint did not resolve the same five. Current Notka route samples reached 30–36 s on fallback.
- Deployed: loopback relay on fl-vpn and restricted Notka SSH link. Both services active and enabled. Notka uses the relay for uncached YouTube ranges and retains its existing fallback for initial failures.
- Verification: 18 route tests passed. Five cold prefixes over the private link took 1.14–1.52 s. Public Notka first audio bytes on three cold tracks took 1.45, 1.59 and 1.73 s; their 64 KiB M4A prefixes took 1.50–1.78 s. Each seek returned 206 and all three had no local audio cache file before or after. Live logs verified Finland routing. Health, app and the preexisting cached range passed.
- Rollback: /opt/notka/hotfix-backups/finland-audio-relay-V2A8DdZY and disable 91-finland-audio-relay.conf. Local artifacts: server-patches/finland-audio-relay.py and finland-audio-routes.patch. Native-client playback was not tested; no runtime code pushed.
## YouTube incident 2026-11-26
- Authorized by crxwov: urgent diagnosis, minimal fix and scoped production rollout despite missing/stale coordination records; do not replace other work.
- Scope: YouTube provider failure classification and admin cookie alert, regression checks, one scoped runtime patch. Preserve Finland relay, cookies and daily metrics.
- Evidence: 172 failed and 343 successful cookie attempts today; current playback works. Alert is based on cumulative daily counts; exact failure cause under investigation.
- Stages: diagnosis active; regression/fix pending; production verification pending.
- Acceptance: validate current cookie route, classify real failure, keep genuine auth warnings, verify playback and seek.
- Next: isolated cookie extraction probes and inspect recent failure classes.

- Diagnosis confirmed: cookie extraction for 6_ESpGfPP20 succeeded in 5.01 s; daily failures include generic extraction failures, alert persists despite 343 cookie successes. Minimal fix: track consecutive sign-in refusals since cookie success, expire after ten minutes, leave daily counters unchanged. Regression and scoped two-file rollout next.

- Regression: five failures reproduced on production baseline; all six checks pass on candidate. Two-file patch prepared, syntax valid. Next: full-module import and admin summary validation in an isolated process, then atomic deployment with hash guard and automatic rollback.

- Full candidate imports and actual admin summary passed three scenarios in isolated server process; daily metrics untouched. Deployment authorized; two exact hashes guarded, backup and rollback prepared. No API/auth contract or client changes.

- Result: deployed two files; backup /opt/notka/hotfix-backups/youtube-cookie-alert-g79juxu_. Live internal admin summary returns no YouTube alert; historical 172 failed / 343 successful counts preserved.
- Verification: six regression tests; five reproduced failures on baseline; three full-module/admin scenarios; patch replay byte-identical; public health OK. Two public audio starts and two seeks returned 206 / 65536 bytes, first bytes in 190-357 ms.
- Artifacts: server-patches/youtube-cookie-alert.patch and youtube-cookie-alert-check.py. Runtime code not pushed. Scope completed; no current reservation. Authenticated browser rendering and device playback not tested; intermittent upstream refusals remain possible and still trigger a current auth alert.

## Playback latency continuation
- User reports slow starts on all clients and requests continuation of the authorized incident repair.
- Scope: read-only client/startup tracing; minimal server routes/Finland relay correction if confirmed. Preserve audio identity, cached files, fallback, cookies and previous alert fix.
- Evidence: iTunes resolves take 5-8 s and bypass Finland; occasional Finland 502 falls back to slow extraction. No claim that these explain every reported delay yet.
- Acceptance: reproduce slow public prepare/start, reduce cold latency with exact-track identity and seek verified, preserve both client contracts.
- Stages: diagnosis active; regression/fix pending; rollout pending.
- Next: measure representative uncached YouTube and iTunes requests and inspect client prepare ordering.
