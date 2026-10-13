import asyncio
import os
import re
import logging
import time

from dotenv import load_dotenv

load_dotenv()

from aiogram import Bot, Dispatcher
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    ReplyKeyboardRemove,
    WebAppInfo,
)

from bot.config import load_config
from music_resolver.services import auth_store, metrics, plus_store

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

    def _touch_message_user(user) -> None:
        if not user:
            return
        metrics.touch_user(
            user.id,
            profile={
                "name": (user.full_name or "")[:80],
                "username": (user.username or "")[:40],
                "lang": (user.language_code or "")[:8],
                "premium": bool(user.is_premium),
            }
        )

    async def _send_auth_code_reply(message: Message) -> None:
        user = message.from_user
        if not user:
            return
        _touch_message_user(user)
        code = auth_store.generate_code_for_user(user.id, user.username or "", user.full_name or "")
        login_label = f"@{user.username}" if user.username else f"ID: {user.id}"
        await message.answer(
            f"🔐 <b>Вход в мобильное приложение Нотка</b>\n\n"
            f"Твой код подтверждения: <code>{code}</code>\n"
            f"Твой логин: <code>{login_label}</code>\n\n"
            f"Введи этот 6-значный код в приложении на телефоне.\n"
            f"⏳ Код действует 5 минут.\n"
            f"⚠️ Никому не сообщай этот код!",
            parse_mode="HTML",
        )

    @dp.message(CommandStart())
    async def handle_start(message: Message) -> None:
        _touch_message_user(message.from_user)
        # Links shared from the Mini App: t.me/<bot>?start=t_<src>_<id> (a track)
        # or ?start=p_<id> (a playlist). Answer with a button that opens Нотка
        # straight on it.
        parts = (message.text or "").split(maxsplit=1)
        payload = parts[1].strip() if len(parts) > 1 else ""

        if payload in ("login", "code", "auth"):
            await _send_auth_code_reply(message)
            return

        # t.me/<bot>?start=promo_CODE — a link from an ad: Нотка opens
        # with the code already entered
        promo = re.fullmatch(r"promo_([A-Za-zА-Яа-яЁё0-9_-]{3,24})", payload)
        if promo:
            sep = "&" if "?" in config.miniapp_url else "?"
            await message.answer(
                "У тебя промокод на Нотку Плюс 🎁\nЖми на кнопку — он активируется сам.",
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[[InlineKeyboardButton(
                        text="🎁 Активировать Плюс",
                        web_app=WebAppInfo(url=f"{config.miniapp_url}{sep}promo={plus_store.normalize_code(promo.group(1))}"),
                    )]]
                ),
            )
            return
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
            "Жми на кнопку ниже, чтобы найти и включить трек.\n\n"
            "📱 Для входа в мобильное приложение на Android отправь /code",
            reply_markup=build_open_app_inline_keyboard(config.miniapp_url),
        )
        # also clears the old keyboard button, which may hold a dead address
        await message.answer(
            "Кнопка «Нотка» слева от поля ввода тоже всегда под рукой.",
            reply_markup=ReplyKeyboardRemove(),
        )

    # ---- Mobile App Authentication Code ----
    @dp.message(Command("code", "login", "auth"))
    async def handle_code(message: Message) -> None:
        await _send_auth_code_reply(message)

    # ---- for the owner (ADMIN_IDS in .env): promo codes for «Нотка Плюс» ----
    admin_ids = {int(x) for x in re.findall(r"\d+", os.environ.get("ADMIN_IDS", ""))}

    @dp.message(Command("id"))
    async def handle_id(message: Message) -> None:
        _touch_message_user(message.from_user)
        await message.answer(f"Твой номер в Telegram: {message.from_user.id}")

    @dp.message(Command("promo"))
    async def handle_promo(message: Message, command: CommandObject) -> None:
        _touch_message_user(message.from_user)
        if message.from_user.id not in admin_ids:
            await message.answer("Не понял команду. Жми /start, чтобы открыть Нотку.")
            return
        args = (command.args or "").split()
        me = await bot.get_me()
        if not args:
            codes = plus_store.list_codes()
            if not codes:
                await message.answer(
                    "Промокодов пока нет.\n\n"
                    "Создать: /promo КОД ДНЕЙ СКОЛЬКО_АКТИВАЦИЙ [СКОЛЬКО_ДНЕЙ_ДЕЙСТВУЕТ]\n"
                    "Например: /promo НОТКА 30 100 14 — месяц Плюса, первым 100 людям, код живёт 14 дней."
                )
                return
            lines = []
            for code, entry in codes.items():
                state = "выключен" if entry.get("off") else (
                    "истёк" if entry.get("expires") and entry["expires"] < time.time() else "действует")
                lines.append(f"{code} — {entry['days']} дн., активировано {len(entry['used'])} из {entry['limit']}, {state}")
            await message.answer("Промокоды:\n" + "\n".join(lines) + "\n\nВыключить: /promo off КОД")
            return
        if args[0].lower() == "off" and len(args) == 2:
            ok = plus_store.disable_code(args[1])
            await message.answer("Код выключен." if ok else "Такого кода нет.")
            return
        try:
            code, days, limit = args[0], int(args[1]), int(args[2])
            valid_days = int(args[3]) if len(args) > 3 else None
            plus_store.create_code(code, days, limit, valid_days)
        except (IndexError, ValueError, plus_store.PromoError):
            await message.answer(
                "Не получилось. Формат: /promo КОД ДНЕЙ СКОЛЬКО_АКТИВАЦИЙ [СКОЛЬКО_ДНЕЙ_ДЕЙСТВУЕТ]\n"
                "Код — от 3 до 24 букв и цифр без пробелов."
            )
            return
        code = plus_store.normalize_code(code)
        await message.answer(
            f"Готово: {code} даёт {days} дн. Плюса, первым {limit}"
            + (f", действует {valid_days} дн." if valid_days else "")
            + f"\n\nСсылка для рекламы (код вводится сам):\nhttps://t.me/{me.username}?start=promo_{code}"
        )

    @dp.message()
    async def handle_other(message: Message) -> None:
        _touch_message_user(message.from_user)
        txt = (message.text or "").strip().lower()
        if any(w in txt for w in ("код", "code", "войти", "логин", "вход", "auth", "login")):
            await _send_auth_code_reply(message)
            return
        await message.answer(
            "Привет! Это Нотка — музыка прямо в Телеграме. 🎧\n\n"
            "📱 Чтобы получить код для входа в приложение, отправь /code\n"
            "Или жми /start, чтобы открыть плеер в Telegram.",
            reply_markup=build_open_app_inline_keyboard(config.miniapp_url),
        )

    logger.info("Starting Notka bot polling...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
