import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from server.bot import build_bot_application, init_bot_username
from server.config import ROOT_DIR, settings
from server.db import init_db, apply_pending_migrations, init_pool, close_pool
from server.lobby import init_lobby_tables
from server.routes.api import router as api_router

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

bot_application = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global bot_application

    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured in .env")

    init_db()
    init_lobby_tables()
    apply_pending_migrations()
    init_pool()
    logger.info("PostgreSQL ready")

    if settings.is_bot_configured:
        bot_application = build_bot_application()
        await bot_application.initialize()
        await bot_application.start()
        await bot_application.updater.start_polling(drop_pending_updates=True)
        try:
            await init_bot_username(bot_application)
        except Exception as exc:
            logger.warning("Bot username init skipped: %s", exc)
        logger.info("Telegram bot started")
    else:
        logger.warning(
            "BOT_TOKEN is not configured. Add your token to .env (see .env.example)"
        )

    yield

    close_pool()

    if bot_application:
        await bot_application.updater.stop()
        await bot_application.stop()
        await bot_application.shutdown()


app = FastAPI(title="Connect Four", lifespan=lifespan)
app.include_router(api_router, prefix="/api")

dist_dir = ROOT_DIR / "dist"
if dist_dir.is_dir() and (dist_dir / "index.html").is_file():
    logger.info("Serving frontend from dist/")
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")
else:
    logger.warning("dist/ not found — run `npm run build`. Serving source files.")
    static_dirs = ("css", "js")
    for name in static_dirs:
        directory = ROOT_DIR / name
        if directory.is_dir():
            app.mount(f"/{name}", StaticFiles(directory=directory), name=name)

    audio_dir = ROOT_DIR / "public" / "audio"
    if audio_dir.is_dir():
        app.mount("/audio", StaticFiles(directory=audio_dir), name="audio")

    images_dir = ROOT_DIR / "public" / "images"
    if images_dir.is_dir():
        app.mount("/images", StaticFiles(directory=images_dir), name="images")

    @app.get("/")
    def serve_index():
        return FileResponse(ROOT_DIR / "index.html")


def run():
    import uvicorn

    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()
