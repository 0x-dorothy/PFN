# Публикация на GitHub

Что коммитить, что прикреплять к релизу и как настроить репозиторий.

## 1. Что попадает в репозиторий

Исходники — да. Собранное и служебное — нет.

| Коммитим | Не коммитим (уже в `.gitignore`) |
| --- | --- |
| `backend/`, `frontend/src`, конфиги (`package.json`, `tsconfig*`, `vite.config.ts`) | `node_modules/` |
| `launcher.py`, `start.bat`, `start.sh`, `start.command`, `stop.bat` | `frontend/dist/` (собирается `npm run build`) |
| `pfn.spec`, `installer/`, `tools/`, `assets/icon.*` | `dist/`, `build/`, `release/` (артефакты — в Releases) |
| `README.md`, `CHANGELOG.md`, `NOTICE.md`, `LICENSE`, `.env.example` | `upstream/`, `probe/` (локальный черновик) |
| `docs/`, `.github/workflows/build.yml`, `.gitignore`, `.gitattributes` | `*.db`, `.env`, `*.zip` |

Итого около 300 файлов и 1,2 МБ — репозиторий лёгкий, без мусора.

Проверить перед первым коммитом:

```bash
git status --short          # не должно быть node_modules, dist, release
git ls-files | wc -l        # ≈ 300
```

## 2. Как выложить

### Вариант 0 — одной командой (публикует всё сам)

```powershell
powershell -ExecutionPolicy Bypass -File tools\publish.ps1 -User <ник> -Repo PFN
```

Скрипт создаёт репозиторий, заливает код, ставит описание и topics, создаёт
релиз `v<версия>` и прикрепляет к нему `Setup.exe`, ZIP и `SHA256SUMS.txt`.
Токен берёт из `.gh-token` или переменной `GH_TOKEN` (права: `repo` + `workflow`).

Проверить без отправки: добавьте `-DryRun`.

### Вариант 1 — git вручную

### Вариант А — git (если он установлен)

```bash
git init
git add .
git commit -m "PFN 1.2.0: форк Aurum на SQLite с установщиком Windows"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### Вариант Б — GitHub Desktop (без терминала)

1. File → Add local repository → выбрать папку проекта.
2. Он предложит создать репозиторий — согласиться.
3. Commit to main → Publish repository (снять галочку «Keep this code private», если нужен публичный).

### Вариант В — загрузка через сайт

Работает, но неудобно: GitHub принимает папки перетаскиванием, а `.gitignore`
при этом не действует — `node_modules` уедет в репозиторий. Если другого пути
нет, соберите отдельную папку только с файлами из таблицы выше и загружайте её.

## 3. Настройки репозитория

**Description** (поле About, до 350 символов):

```
Локальный трекер личных финансов: денежный поток, капитал, бюджеты, цели и активы. Один файл данных, установщик для Windows, без Docker и облака. Форк Aurum (PolyForm NC 1.0.0).
```

**Topics** (теги, через запятую):

```
personal-finance, finance-tracker, budgeting, sqlite, fastapi, react, self-hosted, desktop-app, windows, python, typescript, fork
```

**Про лицензию.** PolyForm Noncommercial 1.0.0 нет в списке распознаваемых
лицензий GitHub, поэтому в шапке репозитория будет «Unknown license» или
«View license». Это нормально: файл `LICENSE` лежит в корне, GitHub его
показывает по ссылке. В описании и README прямо сказано, что это
source-available, а не OSI-лицензия.

## 4. Первый релиз

1. Убедиться, что версия в `backend/app/core/config.py` совпадает с тегом.
2. Собрать артефакты: `powershell -ExecutionPolicy Bypass -File tools\build_windows.ps1`.
3. На GitHub: **Releases → Draft a new release**, тег `v1.2.0` (создать новый).
4. Заголовок: `PFN 1.2.0 — первый релиз`.
5. Описание: взять из [GITHUB-RELEASE-1.2.0.md](GITHUB-RELEASE-1.2.0.md).
6. Прикрепить файлы из `release/`:
   - `PFN-1.2.0-Setup.exe`
   - `PFN-1.2.0-win64.zip`
   - `SHA256SUMS.txt`
7. Publish release.

Тег `v*` заодно запустит CI: он пересоберёт Windows-артефакты и приложит их к
этому же релизу автоматически. Поэтому прикреплять руками не обязательно —
достаточно запушить тег:

```bash
git tag v1.2.0
git push origin v1.2.0
```

## 5. Проверка после публикации

- README отображается с картинками и таблицами.
- В Releases лежат три файла, скачиваются.
- `SHA256SUMS.txt` совпадает с файлами (см. `docs/RELEASE.md`, раздел про суммы).
- Actions → последний запуск зелёный (macOS-job может быть пропущен — это норма).

## 6. Чего не делать

- Не коммитить `release/` и `dist/` — бинарники живут в Releases, иначе
  репозиторий распухнет и каждый клон будет тянуть 40 МБ.
- Не переименовывать `LICENSE` и не убирать строку `Required Notice:` —
  это условие лицензии, без него распространение форка неправомерно.
- Не публиковать личную базу (`pfn.db`) и `.env` — они в `.gitignore`, но
  проверить `git status` перед первым коммитом стоит.
