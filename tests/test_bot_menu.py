import asyncio

from bot import main as bot_main


def test_main_menu_button_order_and_color():
    keyboard = bot_main.build_main_menu_keyboard("https://notka.example/app")

    assert keyboard.inline_keyboard[0][0].text == "🎧 Открыть Нотку"
    assert keyboard.inline_keyboard[0][0].style == "primary"
    assert keyboard.inline_keyboard[1][0].url == "https://t.me/notka_support"
    assert keyboard.inline_keyboard[1][1].callback_data == "menu:profile"


def test_fallback_open_app_keyboard_stays_unchanged():
    keyboard = bot_main.build_open_app_inline_keyboard("https://notka.example/app")

    assert len(keyboard.inline_keyboard) == 1
    assert keyboard.inline_keyboard[0][0].style is None


def test_duration_uses_minutes_hours_and_days():
    assert bot_main.format_duration(0) == "0 минут"
    assert bot_main.format_duration(59 * 60) == "59 минут"
    assert bot_main.format_duration(90 * 60) == "1 час 30 минут"
    assert bot_main.format_duration(26 * 3600) == "1 день 2 часа"


def test_listening_seconds_aggregates_devices_and_ignores_bad_values(monkeypatch):
    monkeypatch.setattr(bot_main.sync_store, "load", lambda _: {
        "devices": {
            "phone": {"listens": {"seconds": 90}},
            "desktop": {"listens": {"seconds": 120}},
            "bad": {"listens": {"seconds": "unknown"}},
        }
    })

    assert bot_main.listening_seconds(123) == 210


def test_plus_term_stays_in_supported_range():
    assert bot_main.clamp_plus_days(-1) == 1
    assert bot_main.clamp_plus_days(30) == 30
    assert bot_main.clamp_plus_days(bot_main.PLUS_MAX_DAYS + 1) == bot_main.PLUS_MAX_DAYS


def test_plus_keyboard_keeps_term_and_back_navigation():
    keyboard = bot_main.build_plus_keyboard(30, plus_active=True)

    assert keyboard.inline_keyboard[0][0].callback_data == "menu:plus:step:30:-1"
    assert keyboard.inline_keyboard[0][1].callback_data == "menu:plus:step:30:1"
    assert keyboard.inline_keyboard[1][0].callback_data == "menu:plus:pay:30"
    assert keyboard.inline_keyboard[2][0].callback_data == "menu:profile"


def test_profile_shows_current_plus_and_listening_time(monkeypatch):
    monkeypatch.setattr(bot_main.plus_store, "status", lambda _: {"plus": True, "until": 5000})
    monkeypatch.setattr(bot_main, "listening_seconds", lambda _: 26 * 3600)
    monkeypatch.setattr(bot_main.time, "time", lambda: 1000)

    text, plus_active = bot_main.build_profile_text(123)

    assert plus_active
    assert "Нотка Плюс: активна ещё 1 час 6 минут" in text
    assert "Прослушано: 1 день 2 часа" in text


def test_payment_step_is_an_explicit_non_mutating_placeholder():
    text = bot_main.build_plus_payment_text(30)

    assert text.startswith("plat_check")
    assert "30 дней" in text
    assert "Оплата пока не подключена" in text


def test_menu_navigation_edits_text_or_caption_in_place():
    class FakeMessage:
        def __init__(self, photo):
            self.photo = photo
            self.calls = []

        async def edit_text(self, text, **kwargs):
            self.calls.append(("text", {"text": text, **kwargs}))

        async def edit_caption(self, **kwargs):
            self.calls.append(("caption", kwargs))

        async def edit_media(self, **kwargs):
            self.calls.append(("media", kwargs))
            return None

    keyboard = bot_main.build_main_menu_keyboard("https://notka.example/app")
    text_message, photo_message = FakeMessage([]), FakeMessage([object()])
    asyncio.run(bot_main.edit_menu_message(text_message, "home", "menu", keyboard))
    asyncio.run(bot_main.edit_menu_message(photo_message, "profile", "menu", keyboard))

    assert [text_message.calls[0][0], photo_message.calls[0][0]] == ["text", "media"]


def test_every_menu_page_has_its_generated_banner():
    from pathlib import Path

    assert set(bot_main.MENU_BANNERS) == {"home", "profile", "plus"}
    assert all(Path(path).is_file() for path in bot_main.MENU_BANNERS.values())
