import asyncio
import hashlib
import json
import os
import re
import logging
import time
from urllib.parse import quote, urlencode

import httpx

from dotenv import load_dotenv

load_dotenv()

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    FSInputFile,
    InputMediaPhoto,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQuery,
    InlineQueryResultAudio,
    InlineQueryResultCachedAudio,
    BufferedInputFile,
    ChatMemberUpdated,
    CallbackQuery,
    InlineQueryResultsButton,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from bot.config import load_config
from music_resolver.services import metrics, plus_store, sync_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("notka.bot")


# Welcome banner: sent with the menu. After the first send Telegram
# gives a file_id, which is reused so the picture is not uploaded again.
WELCOME_BANNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "notka-menu-banner.png")
MENU_BANNERS = {
    "home": WELCOME_BANNER,
    "profile": os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "notka-profile-banner.png"),
    "plus": os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "notka-plus-banner.png"),
}
_banner_file_ids: dict[str, str] = {}
SUPPORT_URL = "https://t.me/notka_support"
PLUS_MAX_DAYS = 3660


async def send_welcome(message: Message, text: str, keyboard: InlineKeyboardMarkup, page: str = "home") -> None:
    banner_path = MENU_BANNERS[page]
    if os.path.exists(banner_path):
        try:
            sent = await message.answer_photo(
                _banner_file_ids.get(page) or FSInputFile(banner_path), caption=text, reply_markup=keyboard
            )
            if sent.photo:
                _banner_file_ids[page] = sent.photo[-1].file_id
            return
        except Exception:
            logger.exception("Could not send the welcome banner, falling back to text")
    await message.answer(text, reply_markup=keyboard)


def build_open_app_inline_keyboard(miniapp_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="🔥 Открыть Нотку", web_app=WebAppInfo(url=miniapp_url))]]
    )


def build_main_menu_keyboard(miniapp_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🎧 Открыть Нотку", web_app=WebAppInfo(url=miniapp_url), style="primary")],
            [
                InlineKeyboardButton(text="Поддержка", url=SUPPORT_URL),
                InlineKeyboardButton(text="Профиль", callback_data="menu:profile"),
            ],
        ]
    )


def _plural_ru(value: int, one: str, few: str, many: str) -> str:
    n = abs(value) % 100
    if 11 <= n <= 14:
        return many
    n %= 10
    return one if n == 1 else few if 2 <= n <= 4 else many


def format_duration(seconds: int) -> str:
    minutes = max(0, int(seconds)) // 60
    if minutes < 60:
        return f"{minutes} {_plural_ru(minutes, 'минута', 'минуты', 'минут')}"
    hours, minutes = divmod(minutes, 60)
    if hours < 24:
        result = f"{hours} {_plural_ru(hours, 'час', 'часа', 'часов')}"
    else:
        days, hours = divmod(hours, 24)
        result = f"{days} {_plural_ru(days, 'день', 'дня', 'дней')}"
        if hours:
            result += f" {hours} {_plural_ru(hours, 'час', 'часа', 'часов')}"
    if minutes:
        result += f" {minutes} {_plural_ru(minutes, 'минута', 'минуты', 'минут')}"
    return result


def listening_seconds(user_id: int) -> int:
    devices = sync_store.load(user_id).get("devices") or {}
    if not isinstance(devices, dict):
        return 0
    total = 0
    for device in devices.values():
        listens = device.get("listens") if isinstance(device, dict) else None
        if not isinstance(listens, dict):
            continue
        try:
            total += max(0, int(listens.get("seconds") or 0))
        except (TypeError, ValueError, OverflowError):
            continue
    return total


def clamp_plus_days(days: int) -> int:
    return min(PLUS_MAX_DAYS, max(1, int(days)))


def build_profile_text(user_id: int) -> tuple[str, bool]:
    plus = plus_store.status(user_id)
    if plus["plus"]:
        remaining = max(60, int(plus["until"] - time.time()))
        subscription = f"Нотка Плюс: активна ещё {format_duration(remaining)}"
    else:
        subscription = "Нотка Плюс: не активна"
    return f"👤 Профиль\n\n{subscription}\nПрослушано: {format_duration(listening_seconds(user_id))}", plus["plus"]


def build_profile_keyboard(plus_active: bool) -> InlineKeyboardMarkup:
    action = "Продлить Нотку Плюс" if plus_active else "Приобрести Нотку Плюс"
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=action, callback_data="menu:plus:config:30")],
        [InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:home")],
    ])


def build_plus_keyboard(days: int, plus_active: bool) -> InlineKeyboardMarkup:
    action = "Продлить" if plus_active else "Купить"
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="− 1 день", callback_data=f"menu:plus:step:{days}:-1"),
            InlineKeyboardButton(text="+ 1 день", callback_data=f"menu:plus:step:{days}:1"),
        ],
        [InlineKeyboardButton(text=f"{action} {days} дн.", callback_data=f"menu:plus:pay:{days}")],
        [InlineKeyboardButton(text="⬅️ Назад", callback_data="menu:profile")],
    ])


async def edit_menu_message(message: Message, page: str, text: str, keyboard: InlineKeyboardMarkup) -> None:
    banner_path = MENU_BANNERS[page]
    if message.photo and os.path.exists(banner_path):
        try:
            edited = await message.edit_media(
                media=InputMediaPhoto(media=_banner_file_ids.get(page) or FSInputFile(banner_path), caption=text),
                reply_markup=keyboard,
            )
            if isinstance(edited, Message) and edited.photo:
                _banner_file_ids[page] = edited.photo[-1].file_id
            return
        except Exception:
            logger.exception("Could not replace the menu banner, keeping the current image")
    if message.photo:
        await message.edit_caption(caption=text, reply_markup=keyboard)
    else:
        await message.edit_text(text, reply_markup=keyboard)


def build_plus_config_text(days: int) -> str:
    return f"Нотка Плюс\n\nСрок подписки: {days} {_plural_ru(days, 'день', 'дня', 'дней')}"


def build_plus_payment_text(days: int) -> str:
    return f"plat_check\n\nВыбранный срок: {days} {_plural_ru(days, 'день', 'дня', 'дней')}\n\nОплата пока не подключена."


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

    @dp.message(CommandStart())
    async def handle_start(message: Message) -> None:
        _touch_message_user(message.from_user)
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
        await send_welcome(
            message,
            "Привет! Это Нотка — музыка прямо в Телеграме.\n\n"
            "Жми на кнопку ниже, чтобы найти и включить трек.",
            build_main_menu_keyboard(config.miniapp_url),
        )

    @dp.callback_query(F.data.startswith("menu:"))
    async def handle_menu_callback(query: CallbackQuery) -> None:
        if not isinstance(query.message, Message):
            await query.answer("Сообщение меню недоступно.", show_alert=True)
            return
        if query.message.chat.type != "private":
            await query.answer("Открой Нотку в личном чате с ботом.", show_alert=True)
            return

        data = query.data or ""
        page = "home"
        if data == "menu:home":
            text = (
                "Привет! Это Нотка — музыка прямо в Телеграме.\n\n"
                "Жми на кнопку ниже, чтобы найти и включить трек."
            )
            keyboard = build_main_menu_keyboard(config.miniapp_url)
        elif data == "menu:profile":
            page = "profile"
            text, plus_active = build_profile_text(query.from_user.id)
            keyboard = build_profile_keyboard(plus_active)
        else:
            parts = data.split(":")
            if len(parts) == 4 and parts[:3] == ["menu", "plus", "config"]:
                page = "plus"
                try:
                    days = clamp_plus_days(int(parts[3]))
                except ValueError:
                    await query.answer("Эта кнопка устарела. Отправь /start.", show_alert=True)
                    return
                plus_active = plus_store.status(query.from_user.id)["plus"]
                text = build_plus_config_text(days)
                keyboard = build_plus_keyboard(days, plus_active)
            elif len(parts) == 5 and parts[:3] == ["menu", "plus", "step"]:
                page = "plus"
                try:
                    days, change = clamp_plus_days(int(parts[3])), int(parts[4])
                except ValueError:
                    await query.answer("Эта кнопка устарела. Отправь /start.", show_alert=True)
                    return
                if change not in (-1, 1):
                    await query.answer("Эта кнопка устарела. Отправь /start.", show_alert=True)
                    return
                updated_days = clamp_plus_days(days + change)
                if updated_days == days:
                    edge = "минимальный" if change < 0 else "максимальный"
                    await query.answer(f"Уже выбран {edge} срок.")
                    return
                plus_active = plus_store.status(query.from_user.id)["plus"]
                text = build_plus_config_text(updated_days)
                keyboard = build_plus_keyboard(updated_days, plus_active)
            elif len(parts) == 4 and parts[:3] == ["menu", "plus", "pay"]:
                page = "plus"
                try:
                    days = clamp_plus_days(int(parts[3]))
                except ValueError:
                    await query.answer("Эта кнопка устарела. Отправь /start.", show_alert=True)
                    return
                text = build_plus_payment_text(days)
                keyboard = InlineKeyboardMarkup(inline_keyboard=[
                    [InlineKeyboardButton(text="⬅️ Назад", callback_data=f"menu:plus:config:{days}")],
                    [InlineKeyboardButton(text="Главное меню", callback_data="menu:home")],
                ])
            else:
                await query.answer("Эта кнопка устарела. Отправь /start.", show_alert=True)
                return

        await query.answer()
        await edit_menu_message(query.message, page, text, keyboard)

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

    # ---- inline mode: «@notka_app_bot название» in any chat. The results are
    # the songs themselves; the picked one lands in the chat as music. ----
    backend = f"http://127.0.0.1:{os.environ.get('PORT', '8080')}"
    internal_headers = {"x-internal": hashlib.sha256(("internal|" + os.environ.get("BOT_TOKEN", "")).encode()).hexdigest()[:24]}
    public_base = re.sub(r"/app/?$", "", config.miniapp_url.split("?", 1)[0]).rstrip("/")
    warmed: dict[str, float] = {}
    warm_tasks: set[asyncio.Task] = set()

    async def warm(source: str, source_id: str, title: str, artist: str, cover: str = "") -> None:
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
                    params={"t": title, "a": artist, "c": cover},
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
            cover = str(track.get("artwork") or "")
            url = f"{public_base}/inline/{quote(source)}/{quote(source_id)}.mp3?" + urlencode({"t": title, "a": artist, "c": cover})
            rid = hashlib.sha1(f"{source}:{source_id}".encode()).hexdigest()[:40]
            stored = inline_files.get(f"{source}:{source_id}")
            if stored:
                # already in the store: Telegram has the file, with its cover; it is sent at once
                items.append(InlineQueryResultCachedAudio(id=rid, audio_file_id=stored))
            else:
                items.append(
                    InlineQueryResultAudio(id=rid, audio_url=url, title=title, performer=artist or None, audio_duration=duration or None)
                )
            picks.append((source, source_id, title, artist, cover, duration))
            if len(items) >= 10:
                break
        await query.answer(items, cache_time=300, is_personal=False, button=open_button)
        # the first four are made ready while the list is on the screen (the converter works two at a time)
        for source, source_id, title, artist, cover, duration in picks[:4]:
            if storage_chat():
                task = asyncio.create_task(ensure_uploaded(source, source_id, title, artist, cover, duration))
            else:
                task = asyncio.create_task(warm(source, source_id, title, artist, cover))
            warm_tasks.add(task)
            task.add_done_callback(warm_tasks.discard)

    # ---- the music store: a private channel the bot is an admin of. A track is uploaded there once, WITH its cover, and
    # from then on it is offered as a file that Telegram already has: it shows the cover and is sent at once. ----
    files_path = plus_store.DATA_DIR / "inline_files.json"
    storage_path = plus_store.DATA_DIR / "inline_storage.json"

    def _read_json(path) -> dict:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _write_json(path, data) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)

    inline_files: dict[str, str] = _read_json(files_path)

    def storage_chat() -> int | None:
        env = os.environ.get("INLINE_STORAGE_CHAT_ID", "").strip()
        if env.lstrip("-").isdigit():
            return int(env)
        value = _read_json(storage_path).get("chat_id")
        return int(value) if value else None

    @dp.my_chat_member()
    async def handle_my_chat_member(update: ChatMemberUpdated) -> None:
        # the bot was made an admin of a channel: that channel becomes the music store
        if update.chat.type != "channel":
            return
        status = update.new_chat_member.status
        if status in ("administrator", "creator"):
            _write_json(storage_path, {"chat_id": update.chat.id, "title": update.chat.title})
            for admin in admin_ids:
                try:
                    await bot.send_message(admin, f"Склад музыки подключён: «{update.chat.title}». Теперь треки в чатах будут с обложками и отправляться сразу, как только загрузятся на склад (первые разы пару секунд).")
                except Exception:
                    pass
        elif status in ("left", "kicked") and _read_json(storage_path).get("chat_id") == update.chat.id:
            _write_json(storage_path, {})

    upload_lock = asyncio.Lock()
    uploading: set[str] = set()

    async def ensure_uploaded(source: str, source_id: str, title: str, artist: str, cover: str, duration: int) -> None:
        key = f"{source}:{source_id}"
        chat = storage_chat()
        if not chat or key in inline_files or key in uploading:
            return
        uploading.add(key)
        try:
            async with upload_lock:  # one at a time: the server is small
                async with httpx.AsyncClient(timeout=240) as client:
                    mp3 = await client.get(f"{backend}/inline/{quote(source)}/{quote(source_id)}.mp3", params={"t": title, "a": artist, "c": cover})
                    if mp3.status_code != 200 or len(mp3.content) < 20_000:
                        return
                    thumb = None
                    if cover:
                        t = await client.get(f"{backend}/inline-thumb/{quote(source)}/{quote(source_id)}.jpg", params={"c": cover})
                        if t.status_code == 200 and len(t.content) < 200_000:
                            thumb = BufferedInputFile(t.content, filename="cover.jpg")
                sent = await bot.send_audio(
                    chat_id=chat,
                    audio=BufferedInputFile(mp3.content, filename=f"{artist} - {title}.mp3"[:120]),
                    title=title, performer=artist or None, duration=duration or None, thumbnail=thumb,
                )
                if sent.audio:
                    inline_files[key] = sent.audio.file_id
                    _write_json(files_path, inline_files)
        except Exception:
            logger.exception("Could not put %s into the music store", key)
        finally:
            uploading.discard(key)

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

    # ---- YouTube cookies: the owner sends cookies.txt to the bot; it is kept and used on its
    # own when YouTube asks the server to sign in (nothing to do over ssh) ----
    cookies_path = plus_store.DATA_DIR / "youtube-cookies.txt"

    @dp.message(F.document)
    async def handle_document(message: Message) -> None:
        doc = message.document
        if message.from_user.id not in admin_ids or not doc or not (doc.file_name or "").lower().endswith(".txt"):
            await message.answer("Не понял. Жми /start, чтобы открыть Нотку.")
            return
        if doc.file_size and doc.file_size > 2 * 1024 * 1024:
            await message.answer("Файл слишком большой для файла кук.")
            return
        tmp = cookies_path.with_suffix(".upload")
        try:
            cookies_path.parent.mkdir(parents=True, exist_ok=True)
            await bot.download(doc, destination=tmp)
            text = tmp.read_text(encoding="utf-8", errors="replace")
        except Exception:
            logger.exception("Could not take the cookies file")
            await message.answer("Не получилось принять файл, попробуй ещё раз.")
            return
        rows = [ln for ln in text.splitlines() if ln.strip() and not ln.startswith("#") and ln.count("\t") >= 6]
        yt = [ln for ln in rows if "youtube.com" in ln or "google.com" in ln]
        if len(yt) < 3:
            tmp.unlink(missing_ok=True)
            await message.answer(
                "Это не похоже на файл кук YouTube (нужен формат Netscape: cookies.txt из расширения «Get cookies.txt LOCALLY» "
                "на странице youtube.com, вошедшего в аккаунт)."
            )
            return
        os.replace(tmp, cookies_path)
        try:
            os.chmod(cookies_path, 0o600)
        except OSError:
            pass
        await message.answer(
            f"Куки YouTube сохранены ({len(yt)} записей). Они применяются сами, только когда YouTube просит войти. "
            "Сообщение с файлом лучше удалить из чата."
        )

    @dp.message(Command("cookies"))
    async def handle_cookies_status(message: Message) -> None:
        if message.from_user.id not in admin_ids:
            await message.answer("Не понял команду. Жми /start, чтобы открыть Нотку.")
            return
        if cookies_path.exists():
            age_days = (time.time() - cookies_path.stat().st_mtime) / 86400
            await message.answer(f"Куки YouTube загружены {age_days:.0f} дн. назад. Пришлите новый cookies.txt файлом, чтобы обновить.")
        else:
            await message.answer("Куки YouTube не загружены. Пришлите файл cookies.txt сюда, если YouTube станет просить войти.")

    @dp.message()
    async def handle_other(message: Message) -> None:
        _touch_message_user(message.from_user)
        await message.answer(
            "Привет! Это Нотка — музыка прямо в Телеграме. 🎧\n\n"
            "Жми кнопку ниже или отправь /start, чтобы открыть плеер в Telegram.",
            reply_markup=build_open_app_inline_keyboard(config.miniapp_url),
        )

    logger.info("Starting Notka bot polling...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
