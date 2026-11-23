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
- Active. Scope: web lyric timeline, repeated background highlights, word fill, cache versions. Preserve provider data. Verify overlapping vocals, gaps, bad timing and seeks on several samples.
