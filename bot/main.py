import asyncio
import hashlib
import os
import re
import logging
import time
from urllib.parse import quote, urlencode

import httpx

from dotenv import load_dotenv

load_dotenv()

from aiogram import Bot, Dispatcher
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQuery,
    InlineQueryResultAudio,
    InlineQueryResultsButton,
    MenuButtonWebApp,
    Message,
    ReplyKeyboardRemove,
    WebAppInfo,
)

from bot.config import load_config
from music_resolver.services import plus_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("notka.bot")


# Welcome banner (Для бота/welcome.jpg): sent with /start. After the first send Telegram
# gives a file_id, which is reused so the picture is not uploaded again.
WELCOME_BANNER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Для бота", "welcome.jpg")
_banner_file_id: str | None = None


async def send_welcome(message: Message, text: str, keyboard: InlineKeyboardMarkup) -> None:
    global _banner_file_id
    if os.path.exists(WELCOME_BANNER):
        try:
            sent = await message.answer_photo(
                _banner_file_id or FSInputFile(WELCOME_BANNER), caption=text, reply_markup=keyboard
            )
            if not _banner_file_id and sent.photo:
                _banner_file_id = sent.photo[-1].file_id
            return
        except Exception:
            logger.exception("Could not send the welcome banner, falling back to text")
    await message.answer(text, reply_markup=keyboard)


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

    try:
        await bot.set_my_description(
            "Нотка — музыка прямо в Телеграме. Ищи любой трек и включай его, не выходя из чата. Нажми «Старт», чтобы открыть."
        )
        await bot.set_my_short_description("Музыка прямо в Telegram")
    except Exception:
        logger.exception("Could not set the bot description")

    @dp.message(CommandStart())
    async def handle_start(message: Message) -> None:
        # Links shared from the Mini App: t.me/<bot>?start=t_<src>_<id> (a track)
        # or ?start=p_<id> (a playlist). Answer with a button that opens Нотка
        # straight on it.
        parts = (message.text or "").split(maxsplit=1)
        payload = parts[1].strip() if len(parts) > 1 else ""
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
            "Жми на кнопку ниже, чтобы найти и включить трек.",
            reply_markup=build_open_app_inline_keyboard(config.miniapp_url),
        )
        # also clears the old keyboard button, which may hold a dead address
        await message.answer(
            "Кнопка «Нотка» слева от поля ввода тоже всегда под рукой.",
            reply_markup=ReplyKeyboardRemove(),
        )

    # ---- for the owner (ADMIN_IDS in .env): promo codes for «Нотка Плюс» ----
    admin_ids = {int(x) for x in re.findall(r"\d+", os.environ.get("ADMIN_IDS", ""))}

    @dp.message(Command("id"))
    async def handle_id(message: Message) -> None:
        await message.answer(f"Твой номер в Telegram: {message.from_user.id}")

    @dp.message(Command("promo"))
    async def handle_promo(message: Message, command: CommandObject) -> None:
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

    # ---- inline mode: «@notka_app_bot название» in any chat. The results are
    # the songs themselves; the picked one lands in the chat as music. ----
    backend = f"http://127.0.0.1:{os.environ.get('PORT', '8080')}"
    internal_headers = {"x-internal": hashlib.sha256(("internal|" + os.environ.get("BOT_TOKEN", "")).encode()).hexdigest()[:24]}
    public_base = re.sub(r"/app/?$", "", config.miniapp_url.split("?", 1)[0]).rstrip("/")
    warmed: dict[str, float] = {}
    warm_tasks: set[asyncio.Task] = set()

    async def warm(source: str, source_id: str, title: str, artist: str) -> None:
        key = f"{source}:{source_id}"
        if time.time() - warmed.get(key, 0) < 600:
            return
        warmed[key] = time.time()
        if len(warmed) > 500:
            for old in sorted(warmed, key=warmed.get)[:250]:
                warmed.pop(old, None)
        try:
            async with httpx.AsyncClient(timeout=240) as client:
                await client.get(
                    f"{backend}/inline-warm/{quote(source)}/{quote(source_id)}",
                    params={"t": title, "a": artist},
                )
        except Exception:
            warmed.pop(key, None)

    @dp.inline_query()
    async def handle_inline(query: InlineQuery) -> None:
        text = (query.query or "").strip()
        open_button = InlineQueryResultsButton(text="Открыть Нотку", web_app=WebAppInfo(url=config.miniapp_url))
        if len(text) < 2:
            await query.answer([], button=open_button, cache_time=5, is_personal=False)
            return
        found: list[dict] = []
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                try:
                    await client.post(f"{backend}/internal/metric", params={"name": "inline"}, headers=internal_headers)
                except Exception:
                    pass
                res = await client.get(f"{backend}/search", params={"q": text, "limit": 12})
                if res.status_code == 200:
                    found = res.json().get("results") or []
        except Exception:
            logger.exception("Inline search failed")
        items = []
        picks = []
        for track in found:
            source, source_id = track.get("source"), track.get("sourceId")
            duration = int(track.get("duration") or 0)
            if not source or not source_id or duration > 900:  # a quarter of an hour: the file would be too big
                continue
            title = (track.get("title") or "Без названия")[:120]
            artist = (track.get("artist") or "")[:120]
            url = f"{public_base}/inline/{quote(source)}/{quote(source_id)}.mp3?" + urlencode({"t": title, "a": artist})
            items.append(
                InlineQueryResultAudio(
                    id=hashlib.sha1(f"{source}:{source_id}".encode()).hexdigest()[:40],
                    audio_url=url,
                    title=title,
                    performer=artist or None,
                    audio_duration=duration or None,
                )
            )
            picks.append((source, source_id, title, artist))
            if len(items) >= 10:
                break
        await query.answer(items, cache_time=300, is_personal=False, button=open_button)
        for source, source_id, title, artist in picks[:2]:
            task = asyncio.create_task(warm(source, source_id, title, artist))
            warm_tasks.add(task)
            task.add_done_callback(warm_tasks.discard)

    # ---- «/stats»: the owner's quick summary in the chat (the full one is on the admin site) ----
    @dp.message(Command("stats"))
    async def handle_stats(message: Message) -> None:
        if message.from_user.id not in admin_ids:
            await message.answer("Не понял команду. Жми /start, чтобы открыть Нотку.")
            return
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                res = await client.get(f"{backend}/internal/summary", headers=internal_headers)
            data = res.json()
            c = data["cards"]
            counters = data.get("counters") or {}
            today = lambda name: (counters.get(name) or [0])[-1]
            await message.answer(
                "📊 Нотка сейчас\n\n"
                f"Людей всего: {c['users']}\n"
                f"Сегодня: {c['dau']} · за неделю: {c['wau']} · за месяц: {c['mau']}\n"
                f"Новых за 7 дней: {c['new_7d']}\n"
                f"На Плюсе сейчас: {c['plus_active']} (всего было {c['plus_ever']})\n"
                f"Часов прослушано: {c['hours']} · прослушиваний: {c['plays']}\n\n"
                f"Сегодня: открытий {today('opens')}, поисков {today('search')}, треков {today('play')}, "
                f"inline {today('inline')}, переносов {today('import')}"
            )
        except Exception:
            logger.exception("Could not build the stats")
            await message.answer("Не получилось собрать статистику, попробуй позже.")

    @dp.message()
    async def handle_other(message: Message) -> None:
        await message.answer(
            "Не понял команду. Жми /start, чтобы открыть Нотку.",
        )

    logger.info("Starting Notka bot polling...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
