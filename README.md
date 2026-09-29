# Spire2Codex — Slay the Spire 2 Challenge Portal

## Branding

The header and authentication screens use `public/spire2codex-logo.png` by default.
Set `NEXT_PUBLIC_BRAND_LOGO_SRC` to another local public path or image URL to replace it,
and optionally set `NEXT_PUBLIC_BRAND_LOGO_ALT` to update its accessible label.

Портал игровых челленджей на Next.js и Supabase. Поддерживает настоящие аккаунты с подтверждением email и отдельный demo-режим без регистрации.

## Возможности

- регистрация по email, паролю и неизменяемому username;
- username длиной 3–24 символа (`A–Z`, `a–z`, `0–9`, `_`, `-`), уникальный без учёта регистра;
- обязательное подтверждение email, вход и корректный выход через Supabase Auth;
- ссылка «Забыли пароль?» зарезервирована, восстановление пока не реализовано;
- серверные игровые данные аккаунта защищены RLS и доступны только владельцу;
- username хранится в публичной таблице `profiles` и отображается после входа;
- demo-режим хранит данные только в `localStorage`. Demo-данные никогда автоматически не переносятся в аккаунт.
- экспериментальный соло-челлендж Card Mastery с выбором карт, прогрессом A1–A10, историей попыток и картой освоения; скрыт по умолчанию и доступен после входа при включённом feature flag.

## Локальный запуск

Нужен Node.js 20.9 или новее.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Заполните `.env.local` данными проекта Supabase:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_CARD_MASTERY_ENABLED=false
```

Это публичные клиентские настройки. `service_role` и другие секретные ключи приложению не нужны и не должны попадать в Git или Vercel. `.env.local` исключён из Git.

Без переменных Supabase приложение собирается и позволяет пользоваться demo-режимом, но регистрация и вход в аккаунт недоступны.

Card Mastery скрыт по умолчанию. Чтобы временно включить его в локальном или preview-окружении, задайте `NEXT_PUBLIC_CARD_MASTERY_ENABLED=true` и пересоберите приложение. При выключенном флаге карточка не отображается, запросы Card Mastery не выполняются, сохранённый прогресс в Supabase не изменяется.

## Настройка Supabase

1. Свяжите проект с Supabase CLI и примените миграции. Проектный npm-скрипт использует IPv4-compatible Supavisor session pooler и безопасно запрашивает database password:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   npm run supabase:push
   ```

   Альтернатива для нового проекта: откройте SQL Editor и последовательно целиком выполните все файлы из `supabase/migrations` в порядке их имён. Не вносите отдельные части схемы вручную: миграции являются источником истины.

   Для уже настроенного production-проекта достаточно снова выполнить `supabase db push`: миграция `20260803000000_import_anton_coop.sql` добавит дату последней попытки и один раз импортирует группу «С Антоном». Перед запуском в проекте должны существовать профили `N-drew` и `1000chertey`; при их отсутствии миграция остановится без частичного импорта.

2. В **Authentication → Providers → Email** оставьте включённым провайдер Email и включите **Confirm email**. SQL-миграции не управляют этой настройкой Auth.

3. В **Authentication → URL Configuration** задайте:

   - **Site URL**: адрес production-сайта;
   - **Redirect URLs**: `http://localhost:3000/**`, production-адрес Vercel и при необходимости preview-шаблон Vercel.

После регистрации trigger создаёт `profiles` из username в Auth metadata. Приложение показывает экран «Проверьте почту». Ссылка подтверждения возвращает пользователя на origin приложения; Supabase восстанавливает сессию, приложение загружает профиль и открывает главную.

### Что создаёт миграция

- `public.profiles`: UUID из `auth.users`, публичный username, дата создания;
- CHECK-ограничение формата username и уникальный индекс `lower(username)`;
- trigger, запрещающий изменение username;
- trigger на `auth.users`, атомарно создающий профиль и отклоняющий некорректный/занятый username;
- RPC `is_username_available` для предварительной проверки интерфейсом (окончательную уникальность гарантирует индекс БД);
- `public.user_data`: JSONB-состояние Ladder Challenge, связанное с владельцем по UUID;
- RLS-политики `SELECT`, `INSERT`, `UPDATE`, `DELETE` для `user_data`, разрешающие операции только при `auth.uid() = user_id`.

Профили доступны для чтения публично, поскольку содержат публичные данные игрока. Запись профиля создаётся только серверным trigger; username нельзя изменить. Игровые данные других пользователей не читаются ни анонимно, ни после входа в чужой аккаунт.

Миграция `20260812000000_game_content_catalog.sql` создаёт каталог игрового контента:

- `characters` и `character_translations` для стабильных ID, активности, порядка и локализованных названий;
- `cards` и `card_translations` для карт и их локализованного текста;
- `card_challenge_settings` для независимых правил участия карт в челленджах;
- публичное чтение каталога через RLS без разрешения клиентской записи;
- начальный английский каталог персонажей и динамическую проверку персонажей в co-op RPC.

Миграция `20260813000000_expand_card_catalog.sql` расширяет каталог для полной модели игры:

- поддерживает фактические игровые type/rarity, включая Status, Curse, Quest, Ancient и Token;
- хранит исходный игровой ID и признаки канонического пула/показа в библиотеке;
- хранит игровое multiplayer-ограничение и вычисляемые признаки `coop_only` и `solo_only`;
- добавляет `card_pools` и many-to-many `card_pool_memberships` для character, colorless, status, curse, event, quest и token карт;
- принимает BCP 47 locale с числовым регионом, включая `es-419`.

Миграция `20260815120000_card_mastery.sql` добавляет Card Mastery:

- `card_mastery_state` — сохранённое текущее Вознесение, активная цель и состояние завершения без пересчёта каталога на главной;
- `card_mastery_progress` — одна запись на пару пользователь/стабильный `card_id` с максимальным освоенным Вознесением;
- `card_mastery_attempts` — неизменяемая история результатов для статистики;
- RLS на чтение только собственных данных и атомарные RPC для начала/завершения попытки;
- service-role RPC для явной проверки завершённости после изменения состава каталога.

Удалять строки игрового каталога не следует: для выведенного из игры контента установите `active = false`. Новые и изменённые записи добавляйте отдельной миграцией с `insert ... on conflict ... do update`, чтобы окружения получали одинаковую версию каталога.

## Vercel

Добавьте в Project Settings → Environment Variables для Production, Preview и Development:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `NEXT_PUBLIC_CARD_MASTERY_ENABLED=false` — оставьте выключенным, пока экспериментальный челлендж не готов к публикации.

Добавьте production/preview URL из Vercel в разрешённые Redirect URLs Supabase. Никакие секретные или `service_role` ключи не нужны.

## Проверки качества

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Извлечение игрового каталога

Полная пошаговая инструкция для обновления после выхода новой версии игры: [docs/updating-card-catalog.md](docs/updating-card-catalog.md).

Первый этап импортёра читает `release_info.json` и английскую/русскую локализации непосредственно из Godot PCK:

```bash
npm run content:extract -- \
  --output /tmp/spire2codex-catalog.json
```

На macOS стандартная Steam-установка определяется автоматически. Для другой Steam library передайте полный каталог `SlayTheSpire2.app/Contents/Resources` через `--game-dir`.

Без runtime-export метаданных snapshot намеренно получает `complete: false`, поэтому его нельзя применять с деактивацией отсутствующих карт. После добавления игрового экспортёра передайте его результат через `--runtime-export /path/to/cards.json`.

Для получения runtime-метаданных на macOS нужен .NET 9 SDK. Установите и соберите информационный мод:

```bash
brew install dotnet@9
npm run content:runtime:install
```

Затем запустите игру, разрешите моды и включите **Spire2Codex Catalog Exporter** в **Settings → Mod Settings**. После одного перезапуска игры exporter создаст `spire2codex-runtime-cards.json` в системном временном каталоге. Повторный `npm run content:extract -- --output /tmp/spire2codex-catalog.json` подхватит этот файл автоматически и создаст полный snapshot.

### Импорт в Supabase

Сначала примените миграции и локально проверьте полный snapshot:

```bash
npm run supabase:push
npm run content:import -- --validate-only
```

`supabase:push` спрашивает database password интерактивно и не выводит его. Для CI используйте `SUPABASE_DB_PASSWORD`, не добавляя значение в Git или `NEXT_PUBLIC_*`.

Dry-run читает текущий каталог по публичному ключу из `.env.local` и показывает added/changed/deactivated без записи:

```bash
npm run content:import
```

После проверки diff передайте service-role key только процессу импортёра и явно разрешите запись:

```bash
SUPABASE_SERVICE_ROLE_KEY="..." npm run content:import -- --apply
```

Не сохраняйте service-role key в `NEXT_PUBLIC_*`, клиентском коде, Git или Vercel. Импорт выполняется одной серверной транзакцией; отсутствующие карты помечаются inactive, memberships синхронизируются, а `card_challenge_settings` не изменяется. Если импорт пытается уменьшить число активных карт более чем на 30%, RPC останавливается; осознанный override доступен через `--apply --force`.

После успешного импорта или ручного изменения `active`/Card Mastery eligibility отдельно пересчитайте сохранённое состояние пользователей:

```bash
SUPABASE_SERVICE_ROLE_KEY="..." npm run card-mastery:reconcile
```

Команда снимает актуальный `completed`, если появились новые/вернувшиеся карты, сохраняет исторические даты прохождения и обновляет число дополнительных карт. Service-role key передавайте только процессу команды.

## Архитектура хранения

- `src/domain` — предметная логика и валидация;
- `src/storage/userDataRepository.ts` — единый асинхронный контракт хранилища;
- `LocalStorageUserDataRepository` — только demo-данные под ключом `spire2codex.demo.v1`;
- `SupabaseUserDataRepository` — данные вошедшего пользователя в `public.user_data`;
- `src/storage/supabase/client.ts` — браузерный клиент Supabase на publishable key.
- `src/storage/contentRepository.ts` — чтение активных персонажей и локализаций из Supabase; при отсутствии выбранного перевода используется английский.
- `src/domain/cardMastery.ts` и `src/storage/cardMasteryRepository.ts` — выбор целей, статистика и доступ к нормализованным данным Card Mastery; изменяемый текст карты всегда читается из каталога по стабильному `card_id`.

Выбор аккаунта не читает demo-хранилище, поэтому неявной миграции локальных данных нет.
