# PFN для Obsidian

Финансы внутри vault: счета, транзакции, бюджеты, цели и капитал. Данные —
**обычный markdown**, поэтому их видит Dataview, их можно править руками, они
синхронизируются вместе с остальными заметками и работают на телефоне.

## Установка

1. Скачать `pfn-finance-0.1.0.zip` и распаковать в
   `<vault>/.obsidian/plugins/pfn-finance/` — должны получиться три файла:
   `main.js`, `manifest.json`, `styles.css`.
2. В Obsidian: **Настройки → Сторонние плагины → Обновить** и включить **PFN — Finance**.
3. Нажать иконку кошелька на левой панели или выполнить команду **PFN: Открыть дашборд**.

Плагин сам создаст папку `Finance/` со счетами, категориями, бюджетами, целями,
активами и пустым журналом операций.

## Как выглядят данные

Всё — списки с inline-полями `[ключ:: значение]`, один формат на все сущности.

`Finance/ledger/2026-11.md`:

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

Счета, категории, бюджеты, цели и активы — такие же списки в отдельных заметках
(`accounts.md`, `categories.md`, `budgets.md`, `goals.md`, `assets.md`).

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

## Что уже работает

- Дашборд: доход, расход, баланс, норма сбережений, расходы по категориям, капитал, последние операции.
- Добавление транзакций: расход, доход, перевод; счета и категории из заметок.
- Переключение месяца, выбор тегов, описания.
- Чтение и запись всех сущностей; правки руками подхватываются автоматически.

## Что дальше

- [ ] Список транзакций с редактированием и удалением
- [ ] Бюджеты и цели на дашборде
- [ ] Графики капитала по истории оценок
- [ ] Импорт CSV из банка
- [ ] Отчёты и правила-подсказки (как в настольном PFN)

## Сборка

```bash
cd obsidian-plugin
npm install
npm run build     # tsc --noEmit && esbuild → main.js
npm test          # vitest: разбор заметок и агрегаты
```

`main.js` — единственный артефакт, который нужен Obsidian. Плагин не использует
Node API и нативные модули, поэтому работает и на мобильном Obsidian.
