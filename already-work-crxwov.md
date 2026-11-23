# Current work — crxwov

participant: crxwov
status: active

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
- Active. Soften vertical handoff and fade word illumination behind the audio-timed foreground. Preserve reduced motion and text readability.
