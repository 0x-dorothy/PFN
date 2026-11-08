"""Собирает статический сайт-визитку из site/*.md в оформлении приложения.

    python tools/build_site.py --out _site

Один источник контента: те же markdown-файлы читает GitBook, если пространство
подключат к репозиторию. Здесь они превращаются в обычные HTML-страницы, чтобы
сайт открывался на GitHub Pages без внешних сервисов.

Зависимость: `pip install markdown`.
"""
from __future__ import annotations

import argparse
import html
import re
import shutil
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "site"
APP_NAME = "PFN"
APP_TAGLINE = "Private Finance Tracker"
REPO_URL = "https://github.com/0x-dorothy/PFN"

# Совпадает с токенами frontend/src/index.css, чтобы сайт и приложение
# выглядели как одно целое.
CSS = """
:root {
  color-scheme: dark;
  --surface-0: #0d0d0d;
  --surface-1: #1a1a19;
  --surface-2: #232322;
  --text-primary: #ffffff;
  --text-secondary: #c3c2b7;
  --text-muted: #898781;
  --border: rgba(255, 255, 255, 0.1);
  --accent: #2a72cc;
  --accent-soft: rgba(42, 114, 204, 0.18);
  --accent-contrast: #ffffff;
  --radius: 14px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--surface-0);
  color: var(--text-primary);
  font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: #6aa9f0; text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { display: flex; min-height: 100vh; }

/* --- сайдбар ---------------------------------------------------------- */
.side {
  width: 272px; flex: 0 0 272px; border-right: 1px solid var(--border);
  background: var(--surface-1); padding: 22px 16px 32px; position: sticky; top: 0;
  height: 100vh; overflow-y: auto;
}
.brand { display: flex; align-items: center; gap: 9px; padding: 0 6px 18px; }
.brand img { width: 26px; height: 26px; border-radius: 7px; }
.brand b { font-size: 15px; letter-spacing: -0.01em; }
.side nav a {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 9px; color: var(--text-secondary);
  font-size: 14px; margin-bottom: 2px;
}
.side nav a:hover { background: var(--surface-2); color: var(--text-primary); text-decoration: none; }
.side nav a.active { background: var(--accent-soft); color: #cfe2fb; }
.side .cta {
  display: block; text-align: center; margin: 18px 6px 0; padding: 10px 12px;
  background: var(--accent); color: var(--accent-contrast); border-radius: 10px;
  font-size: 14px; font-weight: 600;
}
.side .cta:hover { background: #2f7fe0; text-decoration: none; }
.side .meta { margin: 18px 6px 0; font-size: 12px; color: var(--text-muted); }

/* --- контент ---------------------------------------------------------- */
main { flex: 1; min-width: 0; padding: 44px 32px 96px; }
article { max-width: 780px; margin: 0 auto; }
article h1 { font-size: 34px; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 10px; }
article h2 {
  font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-muted); margin: 40px 0 14px; font-weight: 600;
}
article h3 { font-size: 19px; margin: 28px 0 10px; letter-spacing: -0.01em; }
article p { color: var(--text-secondary); margin: 0 0 14px; }
article strong { color: var(--text-primary); }
article ul, article ol { color: var(--text-secondary); padding-left: 22px; margin: 0 0 16px; }
article li { margin: 6px 0; }
article img { max-width: 100%; border-radius: var(--radius); border: 1px solid var(--border); display: block; margin: 18px 0; }
article hr { border: 0; border-top: 1px solid var(--border); margin: 32px 0; }
article code {
  background: var(--surface-2); padding: 2px 6px; border-radius: 6px;
  font-size: 0.88em; font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
}
article pre {
  background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px;
  padding: 14px 16px; overflow-x: auto;
}
article pre code { background: none; padding: 0; font-size: 13px; }
article table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; }
article th {
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--text-muted); font-weight: 600; padding: 8px 12px; border-bottom: 1px solid var(--border);
}
article td { padding: 10px 12px; border-bottom: 1px solid var(--border); color: var(--text-secondary); vertical-align: top; }
article tr:last-child td { border-bottom: 0; }
article blockquote {
  margin: 18px 0; padding: 14px 16px; border-left: 3px solid var(--accent);
  background: var(--accent-soft); border-radius: 0 10px 10px 0; color: var(--text-secondary);
}
.hint { margin: 18px 0; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-1); }
.hint p:last-child { margin-bottom: 0; }
.hint-warning { border-color: rgba(225, 130, 60, 0.4); background: rgba(225, 130, 60, 0.08); }
.hint-info { border-color: rgba(42, 114, 204, 0.45); background: var(--accent-soft); }
.pager { display: flex; justify-content: space-between; gap: 16px; margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 14px; }
.pager span { color: var(--text-muted); }

/* --- мобильная версия -------------------------------------------------- */
.menu-toggle { display: none; }
@media (max-width: 900px) {
  .wrap { display: block; }
  .side {
    position: fixed; inset: 0 auto 0 0; z-index: 20; transform: translateX(-100%);
    transition: transform 0.18s ease; width: 280px;
  }
  .side.open { transform: none; }
  main { padding: 20px 18px 72px; }
  article h1 { font-size: 27px; }
  .menu-toggle {
    display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 10;
    background: rgba(13, 13, 13, 0.92); backdrop-filter: blur(8px);
    padding: 12px 18px; border-bottom: 1px solid var(--border); margin: -20px -18px 18px;
    color: var(--text-primary); font-size: 15px; font-weight: 600;
  }
  .menu-toggle button {
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-primary);
    border-radius: 8px; padding: 4px 10px; font-size: 16px; cursor: pointer;
  }
}
"""

SCRIPT = """
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-menu]');
  const side = document.querySelector('.side');
  if (btn) { side.classList.toggle('open'); }
  else if (!e.target.closest('.side')) { side.classList.remove('open'); }
});
"""


def plain(text: str) -> str:
    """Markdown → простой текст для <title> и описания."""
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_`#>]", "", text)
    return " ".join(text.split())


def convert(md_text: str) -> str:
    """Markdown → HTML плюс поддержка блоков {% hint %} из GitBook."""
    # {% hint style="..." %} ... {% endhint %} → div перед разбором markdown.
    def hint(match: re.Match) -> str:
        style = re.search(r'style="(\w+)"', match.group(0))
        kind = style.group(1) if style else "info"
        return f'<div class="hint hint-{kind}" markdown="1">\n{match.group(1)}</div>'

    md_text = re.sub(r"\{%\s*hint[^%]*%\}(.*?)\{%\s*endhint\s*%\}", hint, md_text, flags=re.S)

    return markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "md_in_html", "sane_lists", "attr_list"],
    )


def read_summary() -> list[tuple[str, str]]:
    """[(файл, заголовок)] в порядке из SUMMARY.md."""
    pages = []
    for line in (SRC / "SUMMARY.md").read_text(encoding="utf-8").splitlines():
        match = re.match(r"\*\s+\[([^\]]+)\]\(([^)]+)\)", line.strip())
        if match:
            pages.append((match.group(2), match.group(1)))
    return pages


def strip_front_matter(text: str) -> tuple[str, str]:
    """Отрезает YAML-заголовок, возвращает (текст, description)."""
    description = ""
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            head = text[3:end]
            found = re.search(r"^description:\s*(.+)$", head, re.M)
            if found:
                description = found.group(1).strip()
            text = text[end + 4 :]
    return text.lstrip("\n"), description


def page_shell(title: str, description: str, body: str, pages, current: str) -> str:
    nav = []
    for filename, label in pages:
        active = " class=\"active\"" if filename == current else ""
        href = filename.replace(".md", ".html")
        nav.append(f'<a href="{href}"{active}>{html.escape(label)}</a>')

    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description)}">
<meta name="theme-color" content="#0d0d0d">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:image" content="assets/og.png">
<meta property="og:type" content="website">
<link rel="icon" href="assets/icon.png">
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="wrap">
  <aside class="side">
    <a class="brand" href="index.html"><img src="assets/icon.png" alt=""><b>{APP_NAME}</b></a>
    <nav>{''.join(nav)}</nav>
    <a class="cta" href="{REPO_URL}/releases">Скачать для Windows</a>
    <p class="meta">{APP_TAGLINE}<br>v1.2.0</p>
  </aside>
  <main>
    <div class="menu-toggle"><button data-menu aria-label="Меню">☰</button> {APP_NAME}</div>
    <article>
{body}
    </article>
  </main>
</div>
<script>{SCRIPT}</script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="build/site")
    args = parser.parse_args()
    out = Path(args.out)
    if not out.is_absolute():
        out = ROOT / out

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    pages = read_summary()
    shutil.copytree(SRC / "assets", out / "assets")
    (out / "style.css").write_text(CSS, encoding="utf-8")

    for filename, label in pages:
        source = SRC / filename
        text, description = strip_front_matter(source.read_text(encoding="utf-8"))
        body = convert(text)
        # Внутренние ссылки между страницами сайта.
        body = re.sub(r'href="([^"]+)\.md"', r'href="\1.html"', body)

        title = f"{label} — {APP_NAME}" if filename != "README.md" else f"{APP_NAME} — {APP_TAGLINE}"
        target = "index.html" if filename == "README.md" else filename.replace(".md", ".html")
        (out / target).write_text(
            page_shell(title, description or plain(text)[:160], body, pages, filename),
            encoding="utf-8",
        )
        print(f"  {target}")

    print(f"готово: {out}")


if __name__ == "__main__":
    main()
