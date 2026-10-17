# Current work — leksik

participant: leksik
agent: Claude
status: active
updated_at_utc: 2026-10-17T15:53:09Z
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

## Stages
1. Дизайн алгоритмов и схемы SQLite — in progress.
2. Хранилище + портрет + скоринг — pending.
3. Экран согласия — pending.
4. Замер Essentia на сервере — pending (отдельный venv, без деплоя в рабочий сервис).

## Validation / Blockers
Тесты tests/ и mix_test.js; деплой только по отдельному поручению.

## Next Action / Resume
Спроектировать схему SQLite и модуль портрета.
