# Сайт на GitBook

Содержимое визитки лежит в `site/`. GitBook подключается к репозиторию и сам
подтягивает страницы — копировать текст руками не нужно.

## 1. Залить репозиторий

Сначала проект должен оказаться на GitHub:

```powershell
powershell -ExecutionPolicy Bypass -File tools\publish.ps1 -User <ник> -Repo PFN
```

Файл `.gitbook.yaml` в корне уже указывает GitBook, где искать содержимое:

```yaml
root: ./site/
structure:
  readme: README.md
  summary: SUMMARY.md
```

## 2. Создать пространство в GitBook

1. Войти на [gitbook.com](https://www.gitbook.com) под своим аккаунтом.
2. **New space** → **Import from GitHub** (или **Git Sync** в настройках
   пространства).
3. Выбрать репозиторий `PFN`, ветку `main`.
4. В поле **Project directory** указать `site` (или оставить пустым — GitBook
   прочитает `.gitbook.yaml` и найдёт папку сам).
5. Подтвердить. GitBook импортирует `site/SUMMARY.md` и все страницы.

## 3. Оформление пространства

Чтобы сайт выглядел как приложение:

**Settings → Customization:**

| Что | Значение |
| --- | --- |
| Logo | загрузить `site/assets/icon.png` |
| Accent / primary colour | `#2A72CC` (синий акцент по умолчанию) |
| Theme | **Dark** (интерфейс приложения по умолчанию тёмный) |
| Cover | `site/assets/og.png` |
| Font | системный / Inter — приложение использует системный шрифт |

**Settings → Domain:** бесплатный адрес вида `pfn.gitbook.io`. Свой домен —
на платном тарифе, для визитки не нужен.

## 4. Что правится где

| Файл | Страница сайта |
| --- | --- |
| `site/README.md` | главная (визитка) |
| `site/install.md` | Установка |
| `site/features.md` | Возможности |
| `site/appearance.md` | Оформление |
| `site/data.md` | Данные и бэкап |
| `site/faq.md` | Вопросы и ответы |
| `site/license.md` | Лицензия и происхождение |
| `site/SUMMARY.md` | порядок страниц в меню |

Изображения — `site/assets/`. Пересобрать мокапы после новых скриншотов:

```bash
python tools/make_mockups.py
```

## 5. Обновления

GitBook синхронизирует пространство при пуше в `main`. Правки в `site/*.md`
попадают на сайт после коммита и пуша — отдельно ничего публиковать не нужно.

## Если Git Sync недоступен

На бесплатном тарифе импорт из GitHub доступен, но если интерфейс предложит
другой путь: **New space → Blank** → и вставить страницы вручную, начиная с
`site/README.md`, затем добавить остальные в том же порядке, что в
`site/SUMMARY.md`. Картинки загружаются перетаскиванием в редактор.
