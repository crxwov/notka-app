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
    MenuButtonWebApp,
    Message,
    ReplyKeyboardRemove,
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


async def main() -> None:
    config = load_config()
    bot = Bot(token=config.bot_token)
    dp = Dispatcher()

    # The Mini App's address changes with every launch (free tunnel). The
    # menu button next to the message field is set once for everyone and
    # always opens the current address — unlike a keyboard button, which
    # keeps the address it was sent with.
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Нотка", web_app=WebAppInfo(url=config.miniapp_url))
        )
    except Exception:
        logger.exception("Could not set the menu button")

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
        # also clears the old keyboard button, which may hold a dead address
        await message.answer(
            "Кнопка «Нотка» слева от поля ввода тоже всегда под рукой.",
            reply_markup=ReplyKeyboardRemove(),
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
