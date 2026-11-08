# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build definition.

Build:  python -m PyInstaller pfn.spec --noconfirm
Output: dist/PFN/PFN.exe  (onedir, not onefile: starts in ~1s instead of
        unpacking 40 MB to a temp folder on every launch)

The frontend is shipped pre-built inside the bundle, so the machine that runs
PFN needs neither Node nor Python.
"""
import os
import re
import site
import sys
from pathlib import Path

ROOT = Path(SPECPATH).resolve()

# Version lives in exactly one place: backend/app/core/config.py.
VERSION = re.search(
    r'APP_VERSION = "([^"]+)"',
    (ROOT / "backend" / "app" / "core" / "config.py").read_text(encoding="utf-8"),
).group(1)

# This build environment keeps the runtime dependencies in the user site (and,
# on some machines, in the interpreter's own site-packages). PyInstaller's
# analysis does not always pick those up, so they are passed explicitly —
# without this the bundle fails at startup with "No module named 'uvicorn'".
EXTRA_PATHS = [
    p
    for p in [site.getusersitepackages(), *site.getsitepackages()]
    if isinstance(p, str) and Path(p).is_dir()
]

# PFN_CONSOLE=1 builds a console-enabled binary, which is the only way to read a
# startup traceback from a windowed build.
CONSOLE = os.environ.get("PFN_CONSOLE") == "1"

# uvicorn resolves its protocol/loop implementations by string at runtime, so
# PyInstaller's static analysis misses them and the app dies on startup with
# "No module named uvicorn.protocols.http.auto" without this list.
HIDDEN = [
    "app.main",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "aiosqlite",
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.dialects.sqlite.aiosqlite",
]

# Nothing here is used by the local build; dropping them keeps the bundle small.
EXCLUDED = [
    "alembic",
    "asyncpg",
    "pytest",
    "numpy",
    "tkinter",
    "unittest",
    "pydoc_data",
]

icon = str(ROOT / "assets" / "icon.ico") if sys.platform == "win32" else str(ROOT / "assets" / "icon.png")

a = Analysis(
    [str(ROOT / "launcher.py")],
    pathex=[str(ROOT / "backend"), *EXTRA_PATHS],
    binaries=[],
    datas=[(str(ROOT / "frontend" / "dist"), "frontend/dist")],
    hiddenimports=HIDDEN,
    hookspath=[],
    runtime_hooks=[],
    excludes=EXCLUDED,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="PFN",
    debug=False,
    strip=False,
    upx=False,
    console=CONSOLE,          # no console window: this is an app, not a script
    disable_windowed_traceback=False,
    icon=icon,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="PFN",
)

# macOS needs a real .app bundle, not a bare executable: that is what makes the
# Dock icon, the menu bar name and "⌘Q quits the app" behave.
if sys.platform == "darwin":
    icns = ROOT / "assets" / "icon.icns"
    app = BUNDLE(
        coll,
        name="PFN.app",
        icon=str(icns) if icns.is_file() else None,
        bundle_identifier="app.pfn.desktop",
        info_plist={
            "CFBundleName": "PFN",
            "CFBundleDisplayName": "PFN",
            "CFBundleShortVersionString": VERSION,
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
        },
    )
