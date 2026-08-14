# Импорт каталога Slay the Spire 2

Исследование выполнено по macOS-дистрибутиву Steam версии `v0.107.1`, commit `59260271` от 2026-06-18.

## Вывод

Предпочтительный источник пригоден для повторяемого импорта. Игра сделана на Godot 4.5.1 и C#. Данные разделены между:

- `Slay the Spire 2.pck` — локализации и ресурсы;
- `data_sts2_<platform>/sts2.dll` — классы карт, тип, редкость и состав пулов;
- `release_info.json` — версия, commit и дата сборки.

Wiki для первичного источника не нужна. Её можно оставить только для ручной сверки.

## Где лежат данные

На macOS Steam:

```text
~/Library/Application Support/Steam/steamapps/common/Slay the Spire 2/
  SlayTheSpire2.app/Contents/Resources/
    Slay the Spire 2.pck
    release_info.json
    data_sts2_macos_arm64/sts2.dll
    data_sts2_macos_arm64/sts2.xml
```

Для других платформ следует искать `release_info.json`, PCK и каталог `data_sts2_*`, а не закреплять платформенный путь. Steam library может находиться не в стандартном каталоге; импортёр должен принимать `--game-dir` и лишь предлагать auto-detection.

PCK не зашифрован. Это Godot PCK format 3 с 12 328 файлами. В нём есть обычные JSON-файлы:

```text
localization/eng/cards.json
localization/rus/cards.json
localization/<language>/cards.json
localization/<language>/characters.json
```

Обнаружены языки: `deu`, `eng`, `esp`, `fra`, `ita`, `jpn`, `kor`, `pol`, `ptb`, `rus`, `spa`, `tha`, `tur`, `zhs`. Внутренние коды отображаются на BCP 47 централизованной таблицей: в частности, `esp -> es-419` (Latin American), `spa -> es-ES` (Castilian), `ptb -> pt-BR`, `zhs -> zh-CN`.

`cards.json` имеет плоский формат:

```json
{
  "BASH.title": "Bash",
  "BASH.description": "Deal {Damage:diff()} damage.\nApply ..."
}
```

Ключ до суффикса — стабильный игровой ID локализации. Описания содержат BBCode и SmartFormat-плейсхолдеры. В каталоге нужно хранить исходный текст без попытки вычислить числа: конкретные значения зависят от состояния и upgrade preview.

## Что извлекается и откуда

| Поле каталога | Источник | Примечание |
|---|---|---|
| Версия | `release_info.json` | Использовать `version+commit`, например `v0.107.1+59260271` |
| Stable ID | `CardModel.Id` / ключ локализации | В Supabase нормализовать в lowercase snake_case; исходный ID сохранить в manifest |
| Название, описание | `localization/*/cards.json` | `.title` и `.description` |
| Type, rarity | экземпляр `CardModel` | Заданы кодом в `sts2.dll`, не JSON-ресурсом |
| Персонаж/цвет | канонический `CardPoolModel` | Ironclad, Silent, Regent, Necrobinder, Defect, Colorless и другие пулы |
| Участие в игре | членство в каноническом пуле + свойства модели | Не выводить только из наличия картинки или перевода |

`sts2.xml`, поставляемый вместе с игрой, подтверждает публичные API `CardPoolModel.AllCards`, `AllCardIds`, `GenerateAllCards`, `GetUnlockedCards`, `IsColorless` и `CardModel.ShouldShowInCardLibrary`. Это делает runtime-export надёжнее декомпиляции IL.

## Рекомендуемая архитектура

Процесс разделяется на три независимых шага:

1. **Game exporter** запускается как небольшой локальный мод/инструмент в контексте игры. Он обходит зарегистрированные канонические card pools и пишет сырые свойства моделей в JSON. Так корректно выполняются конструкторы карт и не приходится разбирать IL.
2. **Catalog builder** читает runtime JSON, извлекает нужные localization JSON из PCK, проверяет ссылки и создаёт детерминированный `catalog.json`.
3. **Supabase importer** валидирует diff, затем выполняет upsert в транзакции/RPC. Отсутствующие в новой полной выгрузке карты получает `active=false`; строки никогда не удаляются.

```text
game installation
  -> raw runtime export + extracted localization
  -> normalized catalog.json
  -> validate/diff report
  -> transactional Supabase upsert
```

Экспортёр и builder не должны обращаться к Supabase. Это позволяет хранить проверяемый snapshot, повторять импорт и менять способ доставки отдельно от извлечения.

## Канонический промежуточный формат

Рекомендуется JSON, а не CSV: у карты несколько переводов и несколько признаков участия. Формат должен быть версионирован JSON Schema.

```json
{
  "schemaVersion": 1,
  "source": {
    "kind": "game-distribution",
    "gameVersion": "v0.107.1",
    "commit": "59260271",
    "builtAt": "2026-06-18T15:43:56-07:00"
  },
  "complete": true,
  "cards": [{
    "id": "bash",
    "sourceId": "BASH",
    "characterId": "ironclad",
    "cardColor": "ironclad",
    "type": "Attack",
    "rarity": "basic",
    "active": true,
    "inCanonicalPool": true,
    "showInCardLibrary": true,
    "poolIds": ["ironclad"],
    "translations": {
      "en": { "name": "Bash", "description": "..." },
      "ru": { "name": "Удар рукоятью", "description": "..." }
    }
  }]
}
```

`complete` — защита от массовой деактивации при неполной/повреждённой выгрузке. Импортёр вправе помечать отсутствующие карты inactive только при `complete=true`, успешной валидации и совпадении ожидаемого набора пулов.

## Политика active и eligibility

Нельзя смешивать «существует в сборке», «доступна в обычной игре» и «подходит для челленджа».

- `active`: модель присутствует в полном runtime-export и относится к поддерживаемому каталогу.
- `in_canonical_pool`: модель реально включена хотя бы в один зарегистрированный игровой пул.
- `show_in_card_library`: значение свойства игры.
- `multiplayer_constraint`: исходное ограничение игры (`None`, `MultiplayerOnly` или `SingleplayerOnly`).
- `coop_only`: вычисляется как `multiplayer_constraint = MultiplayerOnly`; именно его использует приложение для исключения кооперативных карт.
- unlock/epoch: отдельные метаданные доступности, если понадобятся позже.
- `card_challenge_settings.eligible`: только ручное правило конкретного челленджа; импорт контента не должен его перезаписывать.

Расширенная схема позволяет сохранять обычные, colorless, Status, Curse и Quest-карты. Event/Token/Quest при этом остаются также отдельными пулами: тип карты и членство в пуле не смешиваются.

## Необходимое изменение текущей схемы

Исходные CHECK constraints допускали только типы `Attack/Skill/Power` и редкости `common/uncommon/rare`. Полная модель игры шире: она также включает типы `Status/Curse/Quest`, starter/basic карты и специальные пулы.

Перед импортом есть два безопасных варианта:

1. Ограничить v1 только наградными `common/uncommon/rare` картами типов Attack/Skill/Power и явно зафиксировать это в `importPolicy` snapshot-а.
2. Предпочтительно расширить модель: добавить поддерживаемые игровые rarity/type и поля provenance (`source_id`, `source_pool`, `in_canonical_pool`, `show_in_card_library`). Значения enum сначала следует снять runtime-exporter-ом именно с текущей сборки, а не задавать по памяти.

Не следует использовать имя файла изображения как основной ID: картинки содержат beta, event и устаревшие варианты, которых нет в обычном пуле.

## Алгоритм импортёра

1. Найти и проверить `release_info.json`, PCK и подходящий `sts2.dll`.
2. Прочитать версию; отклонить snapshot с уже импортированной версией, если не указан `--force`.
3. Получить runtime export всех канонических пулов.
4. Извлечь только `localization/{eng,rus}/{cards,characters}.json` из PCK и проверить JSON. Остальные поставляемые игрой локали пока не входят в каталог приложения.
5. Нормализовать ID и locale; обнаружить коллизии после нормализации.
6. Проверить обязательный английский title, допустимые type/rarity, владельца, уникальность ID и ссылки на персонажей.
7. Создать отсортированный `catalog.json`, checksum и человекочитаемый diff: added/changed/missing.
8. Запретить apply при аномальном падении числа карт, неизвестных enum, неполных пулах или `complete=false`.
9. В одной серверной транзакции upsert персонажей, карт и переводов; затем деактивировать отсутствующие ID этой source scope.
10. Не изменять и не удалять `card_challenge_settings`.

Для удалённой Supabase лучше серверная RPC/import job с service-role в CI или локальном админском окружении. Service-role нельзя добавлять в Next.js/Vercel client bundle.

## Повторяемость и проверки

В репозитории стоит хранить сам importer, JSON Schema, locale mapping и небольшой manifest/diff, но не копировать весь PCK или DLL. Snapshot с текстами игры следует публиковать только после проверки условий использования контента.

Минимальные автоматические проверки:

- одинаковый дистрибутив создаёт byte-for-byte одинаковый нормализованный JSON;
- каждый runtime ID имеет английский title/description key;
- локализации не создают неизвестные карты, а только дополняют их;
- ID после нормализации уникальны и соответствуют constraint Supabase;
- неизвестный type/rarity останавливает импорт;
- неполная выгрузка не деактивирует существующие строки;
- повторный apply идемпотентен;
- ручные challenge settings сохраняются;
- removed ID меняет только `active`, но не удаляется.

## Следующий практический этап

Сделать минимальный runtime-exporter, который для каждого `CardPoolModel.AllCards` выгружает ID, pool, type, rarity, `ShouldShowInCardLibrary` и связанные признаки. После одного реального snapshot станет известен точный набор enum и можно будет подготовить миграцию Supabase и production importer без догадок.
