# Current work — leksik

participant: leksik
agent: Claude
status: active
updated_at_utc: 2026-10-17T19:28:34Z
heartbeat_interval_seconds: 60
stale_after_seconds: 180
branch: tg-app

## Objective / Success Criteria
«Мой микс V2»: полноценные алгоритмы микса.
1. SQLite-хранилище событий прослушивания и признаков треков (вместо JSON для новых данных).
2. Вкусовой портрет слушателя из признаков дослушанных/лайкнутых/пропущенных треков.
3. Скоринг кандидатов (близость к портрету, настроение/время суток, новизна, штрафы) и дуга энергии в порядке микса.
4. Экран согласия на сбор данных всем; до согласия события для обучения не собираются.
5. Замер Essentia в отдельном venv на сервере (существующие сервисы не трогаются).

## Scope / Reservation
`music_resolver/services/` (mood_mix, track_profile, energy, mix_quality, новые модули хранилища/портрета), `miniapp/mix.js`, согласие в miniapp. Не пересекается с crxwov (proxy_guard).

## Done
- 2026-10-17: выложено на сервер коммитом 5e78b6c (содержит и правку прокси crxwov f09cc0c): документы legal.html, окно согласия, /consent, mixdb.

## Stages
1. SQLite-хранилище, согласие, документы, журнал прослушивания — выложено (42992c1).
2. Разметка треков (язык, «Без слов», настроение): сигналы — текст песни + lingua, CLAP (PyTorch, отдельное окружение /opt/notka-lab на сервере), ReccoBeats; замер на золотом наборе — in progress.
3. Профиль вкуса и сборка микса 70/30 за флагом MIX_V2 — pending.

## Validation / Blockers
Тесты tests/ и mix_test.js; деплой только по отдельному поручению.

## Next Action / Resume
Спроектировать схему SQLite и модуль портрета.
