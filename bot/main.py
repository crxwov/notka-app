import asyncio
import re
import logging

from dotenv import load_dotenv

load_dotenv()

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)

from bot.config import load_config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("notka.bot")


def build_open_app_inline_keyboard(miniapp_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔥 Открыть Нотку", web_app=WebAppInfo(url=miniapp_url))]
        ]
    )


def build_open_app_reply_keyboard(miniapp_url: str) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="🔥 Открыть Нотку", web_app=WebAppInfo(url=miniapp_url))]],
        resize_keyboard=True,
    )


async def main() -> None:
    config = load_config()
    bot = Bot(token=config.bot_token)
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def handle_start(message: Message) -> None:
        # Links shared from the Mini App: t.me/<bot>?start=t_<src>_<id> (a track)
        # or ?start=p_<id> (a playlist). Answer with a button that opens Нотка
        # straight on it.
        parts = (message.text or "").split(maxsplit=1)
        payload = parts[1].strip() if len(parts) > 1 else ""
        if re.fullmatch(r"[tp]_[A-Za-z0-9_-]{2,60}", payload):
            is_track = payload.startswith("t_")
            sep = "&" if "?" in config.miniapp_url else "?"
            url = f"{config.miniapp_url}{sep}{'t' if is_track else 'p'}={payload[2:]}"
            await message.answer(
                "С тобой поделились треком в Нотке 🎧" if is_track else "С тобой поделились плейлистом в Нотке 🎧",
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[[InlineKeyboardButton(
                        text="▶ Слушать" if is_track else "▶ Открыть плейлист",
                        web_app=WebAppInfo(url=url),
                    )]]
                ),
            )
            return
        await message.answer(
            "Привет! Это Нотка — музыка прямо в Телеграме.\n\n"
            "Жми на кнопку ниже, чтобы найти и включить трек.",
            reply_markup=build_open_app_inline_keyboard(config.miniapp_url),
        )
        await message.answer(
            "Кнопка снизу тоже всегда под рукой.",
            reply_markup=build_open_app_reply_keyboard(config.miniapp_url),
        )

    @dp.message()
    async def handle_other(message: Message) -> None:
        await message.answer(
            "Не понял команду. Жми /start, чтобы открыть Нотку.",
        )

    logger.info("Starting Notka bot polling...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
