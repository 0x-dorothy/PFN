from contextlib import asynccontextmanager
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    accounts,
    advice,
    assets,
    backup,
    budgets,
    cash_flow,
    categories,
    crypto,
    dashboard,
    goals,
    insights,
    net_worth,
    recurring,
    reports,
    settings as settings_routes,
    tags,
    transactions,
)
from app.core.config import APP_VERSION, get_settings
from app.db.bootstrap import ensure_schema
from app.db.seed import seed_default_account, seed_default_app_settings, seed_default_categories
from app.db.session import AsyncSessionLocal

settings = get_settings()

# Built by `npm run build` in frontend/. Shipped pre-built, so the user never
# needs Node; when it is missing (a source checkout before the first build) the
# API still runs and the root route explains what to do.
#
# Frozen builds (PyInstaller) unpack into sys._MEIPASS, so the path is resolved
# from there instead of from this file's location.
def _resource_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parents[2]


FRONTEND_DIST = _resource_root() / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # SQLite: create the file and any missing tables. Postgres: Alembic has
    # already done this before the process started.
    await ensure_schema()
    async with AsyncSessionLocal() as session:
        await seed_default_categories(session)
        await seed_default_account(session)
        await seed_default_app_settings(session)
    yield


app = FastAPI(
    title=f"{settings.app_name} API",
    description="Private Finance Tracker — local personal finance tracker.",
    version=APP_VERSION,
    lifespan=lifespan,
    # Docs live under /api/* so they sit behind the same prefix as everything
    # else the API serves. All three go away together when PFN_ENABLE_DOCS is
    # false — leaving openapi.json reachable would keep handing out the full
    # API map with the Swagger UI switched off.
    docs_url="/api/docs" if settings.enable_docs else None,
    redoc_url="/api/redoc" if settings.enable_docs else None,
    openapi_url="/api/openapi.json" if settings.enable_docs else None,
)

# CORS stays off unless someone deliberately opens it, and credentials are only
# granted to a pinned list. Starlette answers a credentialed "*" by echoing back
# whatever Origin asked instead of a literal "*" — so the two together turn any
# page the user happens to have open into an authenticated client of their
# instance, which is exactly what this app's "localhost only by default"
# posture assumes cannot happen.
cors_origins = settings.cors_origins_list
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials="*" not in cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(dashboard.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(net_worth.router, prefix="/api")
app.include_router(backup.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(insights.router, prefix="/api")
app.include_router(settings_routes.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(advice.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(recurring.router, prefix="/api")
app.include_router(cash_flow.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(crypto.router, prefix="/api")


@app.get("/api/health")
async def health() -> dict[str, str]:
    # Status only. This is the one route with no auth in front of it, so
    # anything returned here is world-readable; the running version comes back
    # from GET /api/settings instead.
    return {"status": "ok"}


# --- SPA -------------------------------------------------------------------
# The API and the UI are served by this one process. In the Docker-based
# upstream this was nginx's job; without it there is nobody else to hand
# /transactions (a client-side route) to index.html, so the fallback lives here.
if (FRONTEND_DIST / "index.html").is_file():
    if (FRONTEND_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    _dist_root = FRONTEND_DIST.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            # Unknown API path: answer as the API would, instead of handing back
            # index.html and turning a typo into a JSON parse error client-side.
            raise HTTPException(status_code=404, detail="Not Found")

        if path:
            candidate = (_dist_root / path).resolve()
            # is_relative_to guards against "../" escaping the dist folder.
            if candidate.is_file() and candidate.is_relative_to(_dist_root):
                return FileResponse(candidate)

        return FileResponse(_dist_root / "index.html")

else:

    @app.get("/", include_in_schema=False)
    async def no_build() -> HTMLResponse:
        return HTMLResponse(
            "<h1>" + settings.app_name + " API is running</h1>"
            "<p>The frontend has not been built yet. Run <code>npm install &amp;&amp; npm run build</code> "
            "in <code>frontend/</code>, or start the app with the launcher, which uses a pre-built copy.</p>",
            status_code=200,
        )
