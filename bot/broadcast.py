import asyncio
import glob
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Ensure environment is loaded from project root .env
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter, TelegramBadRequest
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("notka.broadcast")

DEFAULT_TEXT = (
    "⚡️Нотка переехала на новый сервер. Нажмите /start, чтобы обновить бота. "
    "Плейлисты и любимое на месте"
)


def collect_user_ids(data_dir: Path) -> set[int]:
    user_ids: set[int] = set()

    # 1. users.json
    users_file = data_dir / "users.json"
    if users_file.exists():
        try:
            data = json.loads(users_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                for k in data.keys():
                    if k.isdigit():
                        user_ids.add(int(k))
        except Exception as e:
            logger.warning("Failed to parse users.json: %s", e)

    # 2. sync/*.json
    for p in data_dir.glob("sync/*.json"):
        stem = p.stem
        if stem.isdigit():
            user_ids.add(int(stem))

    # 3. plus.json
    plus_file = data_dir / "plus.json"
    if plus_file.exists():
        try:
            data = json.loads(plus_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                for k in data.keys():
                    if k.isdigit():
                        user_ids.add(int(k))
        except Exception as e:
            logger.warning("Failed to parse plus.json: %s", e)

    return user_ids


async def run_broadcast(text: str = DEFAULT_TEXT) -> None:
    token = os.environ.get("BOT_TOKEN", "").strip()
    if not token:
        logger.error("BOT_TOKEN is not set in environment or .env")
        sys.exit(1)

    miniapp_url = os.environ.get("MINIAPP_URL", "").strip()
    keyboard = None
    if miniapp_url:
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="🔥 Открыть Нотку", web_app=WebAppInfo(url=miniapp_url))]
            ]
        )

    data_dir = Path(os.environ.get("NOTKA_DATA_DIR") or PROJECT_ROOT / "data")
    user_ids = sorted(collect_user_ids(data_dir))
    logger.info("Found %d unique users to broadcast to.", len(user_ids))

    bot = Bot(token=token)

    sent_count = 0
    blocked_count = 0
    failed_count = 0

    for idx, user_id in enumerate(user_ids, start=1):
        retries = 3
        while retries > 0:
            try:
                await bot.send_message(
                    chat_id=user_id,
                    text=text,
                    reply_markup=keyboard,
                )
                sent_count += 1
                logger.info("[%d/%d] Sent to %s", idx, len(user_ids), user_id)
                await asyncio.sleep(0.05)  # Telegram limit: ~30 msg/sec
                break
            except TelegramRetryAfter as e:
                logger.warning("Hit rate limit. Sleeping for %s seconds...", e.retry_after)
                await asyncio.sleep(e.retry_after + 0.5)
                retries -= 1
            except TelegramForbiddenError:
                blocked_count += 1
                logger.info("[%d/%d] User %s blocked the bot", idx, len(user_ids), user_id)
                break
            except TelegramBadRequest as e:
                failed_count += 1
                logger.warning("[%d/%d] Bad request for %s: %s", idx, len(user_ids), user_id, e)
                break
            except Exception as e:
                failed_count += 1
                logger.error("[%d/%d] Failed to send to %s: %s", idx, len(user_ids), user_id, e)
                break

    await bot.session.close()

    logger.info(
        "Broadcast completed. Total: %d, Sent: %d, Blocked/Forbidden: %d, Failed: %d",
        len(user_ids),
        sent_count,
        blocked_count,
        failed_count,
    )


if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TEXT
    asyncio.run(run_broadcast(msg))
