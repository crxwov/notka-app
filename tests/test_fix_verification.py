import asyncio
from music_resolver.config import load_settings
from music_resolver.providers.itunes_catalog import ITunesCatalogProvider
from music_resolver.providers.youtube_music import YoutubeMusicProvider
from music_resolver.providers.soundcloud import SoundCloudProvider
from music_resolver.services.music_service import MusicService
from music_resolver.services.provider_manager import ProviderManager
from music_resolver.services.matcher import score_candidate, rank_candidates

async def main():
    s = load_settings()
    yt = YoutubeMusicProvider(s)
    sc = SoundCloudProvider(s)
    it = ITunesCatalogProvider(s, youtube_provider=yt, soundcloud_provider=sc)
    mgr = ProviderManager([yt, it, sc], timeout=15.0)
    svc = MusicService(mgr, s)

    print("==================================================")
    print("TEST 1: Discography Matching for Yeat 'DANGEROUS SUMMER'")
    print("==================================================")
    yeat_tracks = [
        ("PUT IT ONG", "Yeat", 157),
        ("LOCO", "Yeat", 154),
        ("LOOSE LEAF", "Yeat", 170),
        ("OH I DID", "Yeat & NGeeYL", 176),
        ("COMË N GO", "Yeat", 198),
        ("IM YEAT", "Yeat & BNYX®", 168),
        ("GROWING PAINS", "Yeat", 233),
    ]

    for title, artist, dur in yeat_tracks:
        target = await it._match_on_youtube(title, artist, dur)
        print(f"Track: {title} by {artist} ({dur}s) -> MATCH: {target}")
        assert target and not target.startswith("sc:"), f"Expected YouTube target, got {target}"
        assert not any(bad in target.lower() for bad in ["slowed", "remake"]), "Fan remake matched!"
    print(">>> TEST 1 PASSED: All Yeat tracks matched official studio releases!")

    print("\n==================================================")
    print("TEST 2: Search Ranking for 'Yeat Dangerous Summer'")
    print("==================================================")
    resp = await svc.search("Yeat Dangerous Summer", limit=5)
    print("Search results for 'Yeat Dangerous Summer':")
    for r in resp.results:
        print(f"  [{r.source}] {r.title} by {r.artist} (conf={r.confidence})")
    
    top = resp.results[0]
    assert "yeat" in top.artist.lower(), f"Expected Yeat as top artist, got {top.artist}"
    print(">>> TEST 2 PASSED: Yeat ranks at #1 for 'Yeat Dangerous Summer'!")

    print("\n==================================================")
    print("TEST 3: SoundCloud DRM Fallback Recovery")
    print("==================================================")
    # Simulate a corrupted match pointing to a DRM soundcloud track
    test_track_id = "1830618443"  # PUT IT ONG
    it._match_cache[test_track_id] = "sc:https://soundcloud.com/lilyeat/put-it-ong"
    print(f"Injected DRM soundcloud target into cache: {it._match_cache[test_track_id]}")

    # Now call resolve() - it should catch the DRM exception, purge the bad match, and fall back to YouTube!
    resolved = await it.resolve(test_track_id)
    print(f"Resolved track title: {resolved.track.title}, playback type: {resolved.playback.type}")
    new_match = it._match_cache.get(test_track_id)
    print(f"Recovered match in cache: {new_match}")
    assert new_match and not new_match.startswith("sc:"), f"Expected YouTube fallback, got {new_match}"
    print(">>> TEST 3 PASSED: SoundCloud DRM error automatically healed with YouTube fallback!")

    print("\n==================================================")
    print("TEST 4: ensure_matched fast suffix lookup")
    print("==================================================")
    suffix = await it.ensure_matched(test_track_id)
    print(f"ensure_matched for {test_track_id}: {suffix}")
    assert suffix == new_match, f"Expected {new_match}, got {suffix}"
    print(">>> TEST 4 PASSED: ensure_matched returned valid suffix instantly!")

    print("\n==================================================")
    print("ALL VERIFICATION SUITE TESTS PASSED CLEANLY!")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(main())
