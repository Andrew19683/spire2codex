# Spire2Codex — Slay the Spire 2 Challenge Portal

Портал игровых челленджей на Next.js и Supabase. Поддерживает настоящие аккаунты с подтверждением email и отдельный demo-режим без регистрации.

## Возможности

- регистрация по email, паролю и неизменяемому username;
- username длиной 3–24 символа (`A–Z`, `a–z`, `0–9`, `_`, `-`), уникальный без учёта регистра;
- обязательное подтверждение email, вход и корректный выход через Supabase Auth;
- ссылка «Забыли пароль?» зарезервирована, восстановление пока не реализовано;
- серверные игровые данные аккаунта защищены RLS и доступны только владельцу;
- username хранится в публичной таблице `profiles` и отображается после входа;
- demo-режим хранит данные только в `localStorage`. Demo-данные никогда автоматически не переносятся в аккаунт.

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
```

Это публичные клиентские настройки. `service_role` и другие секретные ключи приложению не нужны и не должны попадать в Git или Vercel. `.env.local` исключён из Git.

Без переменных Supabase приложение собирается и позволяет пользоваться demo-режимом, но регистрация и вход в аккаунт недоступны.

## Настройка Supabase

1. Свяжите проект с Supabase CLI и примените миграции:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   Альтернатива: откройте SQL Editor и целиком выполните `supabase/migrations/20260802000000_auth_profiles_user_data.sql`. Не вносите отдельные части схемы вручную: миграция является источником истины.

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

## Vercel

Добавьте в Project Settings → Environment Variables для Production, Preview и Development:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Добавьте production/preview URL из Vercel в разрешённые Redirect URLs Supabase. Никакие секретные или `service_role` ключи не нужны.

## Проверки качества

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Архитектура хранения

- `src/domain` — предметная логика и валидация;
- `src/storage/userDataRepository.ts` — единый асинхронный контракт хранилища;
- `LocalStorageUserDataRepository` — только demo-данные под ключом `spire2codex.demo.v1`;
- `SupabaseUserDataRepository` — данные вошедшего пользователя в `public.user_data`;
- `src/storage/supabase/client.ts` — браузерный клиент Supabase на publishable key.

Выбор аккаунта не читает demo-хранилище, поэтому неявной миграции локальных данных нет.
