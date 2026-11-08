"""PFN launcher — start the app, open it in its own window, stop it again.

This is the whole "download and run" story: no Docker, no Postgres, no nginx,
no Node. The launcher

  1. makes sure the Python dependencies are installed (once),
  2. starts the API + UI in-process on a free local port,
  3. opens a chromeless application window pointed at it,
  4. keeps running until it is stopped with ``--stop`` (or Ctrl+C).

Everything it creates lives in the user's data directory, never next to the
code, so replacing the program folder with a newer build never touches the
user's financial history.

Usage:
    python launcher.py [--port 8765] [--host 127.0.0.1] [--data-dir DIR]
    python launcher.py --stop
    python launcher.py --no-window
"""
from __future__ import annotations

import argparse
import logging
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

# Windowed builds (.exe without a console) leave sys.stdout/stderr as None, and
# any print() would then raise instead of quietly going nowhere. Redirect them
# to NUL once, at import time, so the rest of this file can just print.
if sys.stdout is None or sys.stderr is None:
    _devnull = open(os.devnull, "w", encoding="utf-8")
    sys.stdout = sys.stdout or _devnull
    sys.stderr = sys.stderr or _devnull

APP_NAME = "PFN"
APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR / "backend"
REQUIREMENTS = BACKEND_DIR / "requirements.txt"
# PyInstaller build: the backend modules and frontend/dist live inside the
# bundle, and there is no source tree (and no pip) to fall back on.
FROZEN = bool(getattr(sys, "frozen", False))

DEFAULT_PORT = 8765
WINDOW_SIZE = "1280,860"

log = logging.getLogger("pfn.launcher")


# --- data directory ---------------------------------------------------------
def default_data_dir() -> Path:
    """Mirrors app/core/config.py:default_data_dir.

    Duplicated on purpose: this function runs before the dependencies (and
    therefore the config module) are guaranteed to be importable.
    """
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / APP_NAME


# --- dependencies -----------------------------------------------------------
def missing_dependencies() -> list[str]:
    if FROZEN:
        return []
    missing = []
    for module in ("fastapi", "uvicorn", "sqlalchemy", "aiosqlite", "pydantic_settings"):
        try:
            __import__(module)
        except ImportError:
            missing.append(module)
    return missing


def install_dependencies() -> None:
    """Install once, into the current interpreter.

    Falls back to --user when the interpreter's site-packages isn't writable
    (the common case for a system-wide Python on macOS/Linux).
    """
    base = [sys.executable, "-m", "pip", "install", "-r", str(REQUIREMENTS), "--disable-pip-version-check"]
    print("Первый запуск: устанавливаю зависимости (это займёт минуту)...", flush=True)
    for extra in ([], ["--user"]):
        try:
            subprocess.run(base + extra, check=True)
            return
        except subprocess.CalledProcessError:
            log.warning("pip install failed with args %s, retrying", extra)
    raise SystemExit(
        "Не удалось установить зависимости. Проверьте интернет и запустите вручную:\n  "
        + " ".join(base)
    )


# --- server -----------------------------------------------------------------
def health_url(host: str, port: int) -> str:
    return f"http://{host}:{port}/api/health"


def is_running(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(health_url(host, port), timeout=timeout) as response:
            return response.status == 200
    except (urllib.error.URLError, OSError):
        return False


def wait_until_ready(host: str, port: int, timeout: float = 60.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if is_running(host, port):
            return True
        time.sleep(0.25)
    return False


def run_server(host: str, port: int) -> None:
    """Blocking uvicorn run, meant for a background thread."""
    import uvicorn

    from app.main import app

    uvicorn.run(app, host=host, port=port, log_level="warning")


# --- window -----------------------------------------------------------------
_WINDOWS_BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]

_MACOS_BROWSERS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def open_window(url: str, mode: str = "auto") -> str:
    """Open `url` as a standalone window. Returns what was used.

    Two ways, both dependency-free for the user:
      app     — Edge/Chrome `--app=`: chromeless window, own taskbar entry.
                Edge ships with every Windows 10/11, so this always works.
      webview — pywebview (WebView2 on Windows, WKWebView on macOS): a truly
                native window with our own icon, and the process exits when
                the window is closed. Optional dependency.

    Windows prefers `app` because it cannot fail; macOS prefers `webview`
    because there is no guaranteed Chrome.
    """
    if mode == "none":
        return "none"

    order = ["webview", "app"] if sys.platform == "darwin" else ["app", "webview"]
    if mode != "auto":
        order = [mode]

    for kind in order:
        if kind == "webview" and _open_webview(url):
            return "webview"
        if kind == "app" and _open_browser_window(url):
            return "app"

    _open_default_browser(url)
    return "browser"


def _open_webview(url: str) -> bool:
    """Blocking: returns False only if pywebview is missing or refused to start."""
    try:
        import webview
    except ImportError:
        return False
    try:
        webview.create_window(APP_NAME, url, width=1280, height=860, min_size=(900, 600))
        webview.start()
    except Exception:
        log.warning("pywebview failed, falling back to an app window", exc_info=True)
        return False
    return True


def _open_browser_window(url: str) -> bool:
    candidates = _WINDOWS_BROWSERS if sys.platform == "win32" else _MACOS_BROWSERS if sys.platform == "darwin" else []
    for path in candidates:
        if Path(path).is_file():
            try:
                subprocess.Popen(
                    [path, f"--app={url}", f"--window-size={WINDOW_SIZE}"],
                    close_fds=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                return True
            except OSError:
                log.warning("could not launch %s", path, exc_info=True)
    return False


def _open_default_browser(url: str) -> None:
    if sys.platform == "darwin":
        subprocess.Popen(["open", url])
    elif sys.platform.startswith("linux"):
        subprocess.Popen(["xdg-open", url])
    else:
        webbrowser.open(url)


# --- process bookkeeping ----------------------------------------------------
def pid_file(data_dir: Path) -> Path:
    return data_dir / "launcher.pid"


def write_pid(data_dir: Path) -> None:
    pid_file(data_dir).write_text(str(os.getpid()), encoding="utf-8")


def clear_pid(data_dir: Path) -> None:
    try:
        pid_file(data_dir).unlink()
    except FileNotFoundError:
        pass


def stop_running(data_dir: Path) -> int:
    path = pid_file(data_dir)
    if not path.is_file():
        print("PFN не запущен (файл с PID не найден).")
        return 0
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
    except ValueError:
        path.unlink(missing_ok=True)
        print("Файл с PID повреждён и удалён.")
        return 1

    if sys.platform == "win32":
        result = subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, text=True)
        if result.returncode != 0:
            # Already gone — that's a success from the user's point of view.
            print("Процесс уже не запущен.")
    else:
        try:
            os.kill(pid, 15)
        except ProcessLookupError:
            print("Процесс уже не запущен.")
        except PermissionError:
            print(f"Нет прав на остановку процесса {pid}.")
            return 1
    clear_pid(data_dir)
    print("PFN остановлен.")
    return 0


# --- main -------------------------------------------------------------------
def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=f"{APP_NAME} launcher")
    parser.add_argument("--host", default=os.environ.get("PFN_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PFN_PORT", DEFAULT_PORT)))
    parser.add_argument("--data-dir", default=os.environ.get("PFN_DATA_DIR", ""))
    parser.add_argument(
        "--window",
        choices=["auto", "app", "webview", "none"],
        default=os.environ.get("PFN_WINDOW", "auto"),
        help="how to show the app: auto (default), app window, native webview, or none",
    )
    parser.add_argument("--no-window", action="store_true", help="same as --window none")
    parser.add_argument("--stop", action="store_true", help="stop a running instance")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    data_dir = Path(args.data_dir).expanduser() if args.data_dir else default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(data_dir / "launcher.log", encoding="utf-8")],
    )

    if args.stop:
        return stop_running(data_dir)

    url = f"http://{args.host}:{args.port}/"
    mode = "none" if args.no_window else args.window

    # A second double-click should focus the running app, not start a rival
    # instance on a rival port with a rival database.
    if is_running(args.host, args.port):
        print(f"PFN уже запущен: {url}")
        open_window(url, mode)
        return 0

    if missing_dependencies():
        install_dependencies()

    os.environ.setdefault("PFN_DATA_DIR", str(data_dir))
    if not FROZEN:
        sys.path.insert(0, str(BACKEND_DIR))

    dist = (Path(getattr(sys, "_MEIPASS", APP_DIR)) if FROZEN else APP_DIR) / "frontend" / "dist"
    if not (dist / "index.html").is_file():
        print("Внимание: интерфейс не собран (frontend/dist). Будет доступен только API.")

    def announce_when_ready() -> None:
        if not wait_until_ready(args.host, args.port):
            print("Сервер не ответил за минуту. Смотрите launcher.log в", data_dir)
            return
        write_pid(data_dir)
        print(f"PFN запущен: {url}\nДанные: {data_dir / 'pfn.db'}\nОстановить: python launcher.py --stop")
        if mode != "none":
            open_window(url, mode)

    # A native window owns the main thread, so the server moves to a background
    # thread and the process lives exactly as long as the window does. This is
    # the path macOS takes by default.
    if mode == "webview":
        threading.Thread(target=run_server, args=(args.host, args.port), daemon=True).start()
        if not wait_until_ready(args.host, args.port):
            print("Сервер не ответил за минуту. Смотрите launcher.log в", data_dir)
            return 1
        announce_when_ready()
        clear_pid(data_dir)
        return 0

    threading.Thread(target=announce_when_ready, daemon=True).start()

    # Otherwise uvicorn owns the main thread: it installs signal handlers there,
    # and Ctrl+C behaves the way anyone would expect.
    try:
        run_server(args.host, args.port)
    except KeyboardInterrupt:
        print("\nОстанавливаюсь...")
    finally:
        clear_pid(data_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
