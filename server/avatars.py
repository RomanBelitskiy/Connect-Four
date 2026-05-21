from __future__ import annotations

import logging
import time
from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image

from server.bot import fetch_user_photo_url
from server.config import ROOT_DIR

logger = logging.getLogger(__name__)

AVATAR_DIR = ROOT_DIR / "data" / "avatars"
AVATAR_SIZE = 96
AVATAR_QUALITY = 78
AVATAR_MAX_AGE_SEC = 7 * 86400


def avatar_file_path(telegram_id: int) -> Path:
    return AVATAR_DIR / f"{int(telegram_id)}.webp"


def public_avatar_url(telegram_id: int) -> str:
    return f"/api/avatars/{int(telegram_id)}.webp"


def _save_avatar_webp(raw: bytes, dest: Path) -> bool:
    try:
        with Image.open(BytesIO(raw)) as img:
            img = img.convert("RGB")
            img.thumbnail((AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS)
            dest.parent.mkdir(parents=True, exist_ok=True)
            img.save(dest, format="WEBP", quality=AVATAR_QUALITY, method=6)
        return True
    except Exception as exc:
        logger.warning("Avatar encode failed: %s", exc)
        return False


async def sync_user_avatar(telegram_id: int, *, force: bool = False) -> str | None:
    """Завантажує аватар з Telegram, зберігає стиснутий WebP (~2–5 KB)."""
    dest = avatar_file_path(telegram_id)
    if dest.is_file() and not force:
        age = time.time() - dest.stat().st_mtime
        if age < AVATAR_MAX_AGE_SEC:
            return public_avatar_url(telegram_id)

    source_url = await fetch_user_photo_url(telegram_id)
    if not source_url:
        return public_avatar_url(telegram_id) if dest.is_file() else None

    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            resp = await client.get(source_url)
            resp.raise_for_status()
            raw = resp.content
    except Exception as exc:
        logger.warning("Avatar download failed for %s: %s", telegram_id, exc)
        return public_avatar_url(telegram_id) if dest.is_file() else None

    if not _save_avatar_webp(raw, dest):
        return public_avatar_url(telegram_id) if dest.is_file() else None

    return public_avatar_url(telegram_id)
