# PFN для Obsidian

Финансы внутри vault: счета, операции, бюджеты, цели и капитал. Данные —
**обычный markdown**, поэтому их видит Dataview, их можно править руками, они
синхронизируются вместе с остальными заметками и работают на телефоне.

## Установка

**Скриптом:**

```powershell
cd obsidian-plugin
powershell -ExecutionPolicy Bypass -File install.ps1 -Vault "D:\Notes"
```

**Руками:** распаковать `pfn-finance-0.2.0.zip` в
`<vault>/.obsidian/plugins/pfn-finance/` — три файла: `main.js`,
`manifest.json`, `styles.css`. Затем перезапустить Obsidian и включить плагин в
**Настройки → Сторонние плагины**.

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

Всё — списки с inline-полями `[ключ:: значение]`, один формат на все сущности.
Плагин сам создаёт папку `Finance/` при первом запуске.

```markdown
Finance/
  accounts.md      счета
  categories.md    категории
  budgets.md       лимиты
  goals.md         цели и взносы
  assets.md        активы и оценки
  ledger/2026-11.md  операции месяца
```

Операции в месячной заметке:

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

Правки в этих файлах подхватываются автоматически — можно вести учёт руками
или другим плагином, панель всё пересчитает.

## Dataview

Ничего экспортировать не нужно — запросы читают те же строки:

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

## Бюджеты, цели и активы

Бюджет — строка в `budgets.md`:

```markdown
- [category:: groceries] [limit:: 30000.00]
```

Цель — с вложенными взносами:

```markdown
- [id:: trip] [name:: Отпуск] [target:: 150000.00] [due:: 2027-06-01]
  - [date:: 2026-05-01] [amount:: 20000.00] первый взнос
```

Актив — с историей оценок:

```markdown
- [id:: flat] [name:: Квартира] [class:: real_estate] [role:: neutral] [risk:: low] [value:: 8000000.00] [asof:: 2026-11-01] [currency:: RUB]
  - [date:: 2026-01-01] [value:: 7500000.00]
```

## Что дальше

- [ ] Формы добавления бюджетов, целей и активов (сейчас — правка заметок)
- [ ] График капитала по истории оценок
- [ ] Импорт CSV из банка
- [ ] Отчёты и подсказки, как в настольном PFN
- [ ] Синхронизация с настольным приложением через экспорт

## Сборка

```bash
cd obsidian-plugin
npm install
npm run build     # tsc --noEmit && esbuild → main.js
npm test          # vitest: разбор заметок и агрегаты
```

Плагин не использует Node API и нативные модули, поэтому работает и на
мобильном Obsidian.
