import os
from dataclasses import dataclass


@dataclass(frozen=True)
class BotConfig:
    bot_token: str
    miniapp_url: str


def load_config() -> BotConfig:
    token = os.environ.get("BOT_TOKEN", "").strip()
    if not token:
        raise RuntimeError(
            "BOT_TOKEN is not set. Create a .env file (see .env.example) "
            "or export BOT_TOKEN before running the bot."
        )
    miniapp_url = os.environ.get("MINIAPP_URL", "").strip()
    if not miniapp_url:
        raise RuntimeError(
            "MINIAPP_URL is not set. It must be an https:// URL where the "
            "Mini App (miniapp/ folder) is hosted. Telegram refuses to open "
            "WebApp buttons pointing at http:// or localhost."
        )
    return BotConfig(bot_token=token, miniapp_url=miniapp_url)
