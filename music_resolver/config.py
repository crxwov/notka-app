import os
import urllib.error
import urllib.request
from dataclasses import dataclass


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _get_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_list(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


_proxy_checks: dict[str, bool] = {}


def _usable_proxy(value: str | None) -> str | None:
    """Return the proxy only if something is actually listening on it.

    A dead proxy (expired plan, changed address) otherwise takes every
    provider down with it — search just answers "all providers are
    unavailable". Checked once per process start: when the proxy is
    unreachable we go direct and say so in the console; once a working
    proxy is back in .env, the next start picks it up again.
    """
    if not value:
        return None
    if value in _proxy_checks:
        return value if _proxy_checks[value] else None
    # A real request through the proxy, not just a port check: a proxy can
    # accept the TCP connection and still refuse to forward anything.
    url = value if "://" in value else f"http://{value}"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": url, "https": url}))
    try:
        with opener.open("https://music.youtube.com/", timeout=8) as resp:
            ok = resp.status < 500
    except urllib.error.HTTPError as exc:
        ok = exc.code < 500  # the proxy forwarded it; the site just answered oddly
    except Exception:
        ok = False
    _proxy_checks[value] = ok
    if not ok:
        print("Прокси из .env не отвечает — работаю напрямую, без него.")
    return value if ok else None


@dataclass(frozen=True)
class Settings:
    port: int
    provider_timeout: float
    cache_ttl: int
    resolve_cache_ttl: int
    log_level: str
    search_limit: int
    provider_order: list[str]
    disabled_providers: list[str]
    stream_response_mode: str
    ytdlp_cookie_file: str | None
    ytdlp_cookies_from_browser: str | None
    ytdlp_proxy: str | None
    ytdlp_force_ipv6: bool
    itunes_proxy: str | None
    ytmusic_proxy: str | None
    ytmusic_location: str | None
    spotify_client_id: str | None
    spotify_client_secret: str | None


def load_settings() -> Settings:
    stream_mode = os.getenv("STREAM_RESPONSE_MODE", "proxy").strip().lower()
    if stream_mode not in {"redirect", "json", "proxy"}:
        stream_mode = "proxy"
    return Settings(
        port=_get_int("PORT", 8080),
        provider_timeout=_get_float("PROVIDER_TIMEOUT", 15.0),
        cache_ttl=_get_int("CACHE_TTL", 300),
        resolve_cache_ttl=_get_int("RESOLVE_CACHE_TTL", 1800),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        search_limit=_get_int("SEARCH_LIMIT", 10),
        provider_order=_get_list("PROVIDER_ORDER", ["youtube_music", "soundcloud", "youtube_web"]),
        disabled_providers=_get_list("DISABLED_PROVIDERS", []),
        stream_response_mode=stream_mode,
        ytdlp_cookie_file=os.getenv("YTDLP_COOKIE_FILE") or None,
        ytdlp_cookies_from_browser=os.getenv("YTDLP_COOKIES_FROM_BROWSER") or None,
        ytdlp_proxy=_usable_proxy(os.getenv("YTDLP_PROXY")),
        ytdlp_force_ipv6=_get_bool("YTDLP_FORCE_IPV6"),
        # Separate from YTDLP_PROXY (yt-dlp bundles its own proxy handling
        # and this app never routes YouTube traffic through httpx), but
        # falls back to it when set: the same proxy that gets YouTube
        # access working from a restricted network will just as likely
        # fix iTunes Search's /search endpoint, which has been observed
        # hard-403ing from Russian IPs specifically (while /lookup by
        # numeric id is unaffected) — see itunes_catalog.py's _get().
        itunes_proxy=_usable_proxy(os.getenv("ITUNES_PROXY") or os.getenv("YTDLP_PROXY")),
        # YouTube Music's own service doesn't officially operate in Russia
        # (unlike plain YouTube/googlevideo, which yt-dlp reaches fine) —
        # ytmusicapi's unauthenticated search, hit directly from a Russian
        # IP with no proxy, silently comes back missing large chunks of the
        # catalog (confirmed by hand: an official, currently-released
        # Yeat/ADL track simply doesn't appear in the "songs" search results
        # at all, even though it's really on YouTube Music). Routing through
        # the same proxy that unblocks yt-dlp/iTunes fixes this the same way.
        ytmusic_proxy=_usable_proxy(os.getenv("YTMUSIC_PROXY") or os.getenv("YTDLP_PROXY")),
        # Pins the catalog region ytmusicapi asks for, instead of leaving it
        # to be auto-detected from the (proxied or not) request IP — keeps
        # search results consistent regardless of which exit node a given
        # proxy happens to use. See ytmusicapi's `location` parameter.
        ytmusic_location=os.getenv("YTMUSIC_LOCATION") or None,
        spotify_client_id=os.getenv("SPOTIFY_CLIENT_ID") or None,
        spotify_client_secret=os.getenv("SPOTIFY_CLIENT_SECRET") or None,
    )
