# Current work — leksik

participant: leksik
agent: Claude
status: active
updated_at_utc: 2026-10-18T13:01:33Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
Микс V2: (1) события страницы исполнителя (заход, что делает) и сигнал популярности трека среди людей в профиле вкуса/выборе кандидатов; (2) автоматическое ежедневное пополнение каталога (Deezer-обход по профилям людей, разметка, перенос), приоритет узким режимам. Каталог в боевой базе уже перенесён (3564 разметки, 1610 в каталоге).

## Scope / Reservation
music_resolver/services (mixdb, taste, mix_v2, mix_config), tools/tagger, tools/eval, deploy (таймер каталога), небольшой патч miniapp/app.js (события страницы исполнителя). Баннеры бота/Profile>Info — зона crxwov, не трогаю.

## Next Action / Resume
Завтра (2026-10-19): дождаться фоновой разметки на сервере (/opt/notka-lab), перенести каталог в боевую базу (worker.py merge), проверить «Мой микс» V2 у владельца, затем A/B и обучение на обратной связи. Подробно: память notka-handoff-2026-10-18-mix-v2. Последний выложенный коммит 0adb4e1.