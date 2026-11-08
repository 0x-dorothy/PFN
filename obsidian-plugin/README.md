# PFN — Obsidian Plugin

**Форк-плагин к проекту [PFN](https://github.com/0x-dorothy/PFN).** Это не
самостоятельное приложение, а расширение для Obsidian, которое переносит учёт
личных финансов из настольного PFN внутрь vault.

> **Бета.** Версия 0.2.0-beta.1: основные экраны работают, но API и формат
> заметок ещё могут меняться. Перед обновлением делайте бэкап vault — или
> хотя бы не правьте `Finance/` во время миграции.

Финансы живут в обычном markdown: счета, операции, бюджеты, цели и капитал.
Поэтому данные читает Dataview, их можно править руками, они синхронизируются
вместе с остальными заметками и работают на телефоне.

## Установка

**Скриптом** (Windows):

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -Vault "D:\Notes"
```

**Руками:** распаковать `pfn-finance-0.2.0-beta.1.zip` в
`<vault>/.obsidian/plugins/pfn-finance/` — три файла: `main.js`,
`manifest.json`, `styles.css`. Перезапустить Obsidian, включить плагин в
**Настройки → Сторонние плагины**.

Нужен Obsidian 1.5.0 или новее. Плагин не использует Node API, поэтому
работает и на мобильном Obsidian.

## Что внутри

Панель открывается иконкой кошелька и делится на пять вкладок:

| Вкладка | Что показывает |
| --- | --- |
| **Обзор** | доход, расход, баланс, норма сбережений; расходы по категориям; капитал; последние операции |
| **Операции** | все операции месяца; клик по строке — правка и удаление |
| **Бюджеты** | лимиты по категориям, потрачено/осталось, перерасход красным |
| **Цели** | прогресс по целям и сумма взносов |
| **Активы** | капитал, разбивка по классам, список активов с риском и датой оценки |

Стрелки в заголовке листают месяц, «текущий месяц» возвращает к сегодняшнему.

## Как выглядят данные

Один формат на все сущности: markdown-список, где свойства записи — inline-поля
`[ключ:: значение]`. Плагин сам создаёт папку `Finance/` при первом запуске.

```markdown
Finance/
  accounts.md        счета
  categories.md      категории
  budgets.md         лимиты
  goals.md           цели и взносы
  assets.md          активы и оценки
  ledger/2026-11.md  операции месяца
```

```markdown
- [id:: k3f9a] [date:: 2026-11-05] [type:: expense] [amount:: 1250.00] [account:: main] [category:: groceries] [tags:: еда] Пятёрочка
- [id:: m1x7b] [date:: 2026-11-06] [type:: transfer] [amount:: 50000.00] [account:: main] [transferto:: savings] На накопления
```

Разбивка покупки по категориям — вложенные строки:

```markdown
- [id:: q8w2e] [date:: 2026-11-07] [type:: expense] [amount:: 4210.00] [account:: card] Ашан
  - [category:: groceries] [amount:: 2000.00]
  - [category:: dining] [amount:: 2210.00]
```

Правки в файлах подхватываются автоматически: можно вести учёт руками или
другим плагином, панель пересчитает.

## Dataview

Экспорт не нужен — запросы читают те же строки:

````markdown
```dataview
TABLE L.date AS Дата, L.amount AS Сумма, L.category AS Категория
FROM "Finance/ledger"
FLATTEN file.lists AS L
WHERE L.amount AND L.type = "expense"
SORT L.date DESC
```
````

Траты по категориям за месяц:

````markdown
```dataview
TABLE sum(rows.L.amount) AS Сумма, length(rows) AS Операций
FROM "Finance/ledger"
FLATTEN file.lists AS L
WHERE L.amount AND L.type = "expense" AND L.date >= "2026-11-01" AND L.date <= "2026-11-30"
GROUP BY L.category
SORT sum(rows.L.amount) DESC
```
````

## Бюджеты, цели, активы

```markdown
- [category:: groceries] [limit:: 30000.00]
```

```markdown
- [id:: trip] [name:: Отпуск] [target:: 150000.00] [due:: 2027-06-01]
  - [date:: 2026-05-01] [amount:: 20000.00] первый взнос
```

```markdown
- [id:: flat] [name:: Квартира] [class:: real_estate] [role:: neutral] [risk:: low] [value:: 8000000.00] [asof:: 2026-11-01] [currency:: RUB]
  - [date:: 2026-01-01] [value:: 7500000.00]
```

## Что дальше (бета)

- [ ] Формы добавления бюджетов, целей и активов — сейчас правится заметка
- [ ] Графики: капитал по истории оценок, денежный поток
- [ ] Импорт CSV из банка
- [ ] Отчёты и подсказки, как в настольном PFN
- [ ] Экспорт/импорт для переноса данных между плагином и приложением

## Сборка

```bash
npm install
npm run build     # tsc --noEmit && esbuild → main.js
npm test          # vitest: разбор заметок и агрегаты
```

Структура:

```
src/
  model/    типы, деньги
  store/    разбор и запись markdown, файловый слой
  calc/     агрегаты: балансы, дашборд, бюджеты, капитал
  ui/       панель, формы, настройки
tests/      юнит-тесты разбора и расчётов
```

## Лицензия

Плагин — часть проекта **PFN** и распространяется на тех же условиях, что и он:
см. [LICENSE основного проекта](https://github.com/0x-dorothy/PFN/blob/main/LICENSE).
