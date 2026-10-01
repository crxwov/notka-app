from music_resolver.config import Settings
from music_resolver.providers.base import MusicProvider
from music_resolver.providers.itunes_catalog import ITunesCatalogProvider
from music_resolver.providers.soundcloud import SoundCloudProvider
from music_resolver.providers.youtube_music import YoutubeMusicProvider
from music_resolver.providers.youtube_web import YoutubeWebProvider
from music_resolver.services.music_service import MusicService
from music_resolver.services.provider_manager import ProviderManager


def build_music_service(settings: Settings) -> MusicService:
    youtube_music = YoutubeMusicProvider(settings)
    youtube_web = YoutubeWebProvider(settings)
    # iTunes Search never plays audio itself (see itunes_catalog.py) — it
    # only supplies catalog data, and hands playback back to this same
    # YouTube provider. Third attempt at this role: Spotify's Web API turned
    # out to require a Premium subscription even for app-only access, and
    # MusicBrainz's free search cluster turned out to have sustained
    # overload (routine 503s). Apple's iTunes Search API is also free and
    # keyless, but backed by Apple's own infrastructure — reliably fast.
    # youtube_web is wired in as a search-only fallback for when YouTube
    # Music's own search comes up empty for a track that does exist on
    # YouTube proper (see itunes_catalog._match_on_youtube).
    itunes = ITunesCatalogProvider(settings, youtube_provider=youtube_music, youtube_fallback_provider=youtube_web)
    youtube_music.set_catalog_provider(itunes)

    available: dict[str, MusicProvider] = {
        "youtube_music": youtube_music,
        "soundcloud": SoundCloudProvider(settings),
        "youtube_web": youtube_web,
        "itunes": itunes,
    }
    disabled = set(settings.disabled_providers)
    providers = [available[name] for name in settings.provider_order if name in available and name not in disabled]
    if not providers:
        providers = [provider for name, provider in available.items() if name not in disabled]
    # "itunes" is reached directly by source= (album/artist/track routing,
    # and the /stream flow for tracks matched through it) rather than
    # through the general search/resolve fallback chain, so it must always
    # be resolvable via manager.get("itunes") even when PROVIDER_ORDER
    # doesn't mention it.
    if itunes not in providers and "itunes" not in disabled:
        providers.append(itunes)
    manager = ProviderManager(providers=providers, timeout=settings.provider_timeout)
    return MusicService(manager=manager, settings=settings)
