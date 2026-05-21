from __future__ import annotations

from fastapi import Header, HTTPException

from server.auth import parse_init_data_user, validate_init_data
from server.config import settings
from server.db import get_user_by_telegram_id


def require_user(x_telegram_init_data: str | None = Header(default=None)) -> dict:
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="X-Telegram-Init-Data header required")
    if not settings.is_bot_configured:
        raise HTTPException(status_code=503, detail="Bot token is not configured")
    if not validate_init_data(x_telegram_init_data, settings.bot_token):
        raise HTTPException(status_code=401, detail="Invalid Telegram initData")

    tg_user = parse_init_data_user(x_telegram_init_data)
    if not tg_user or not tg_user.get("id"):
        raise HTTPException(status_code=401, detail="User not found in initData")

    row = get_user_by_telegram_id(int(tg_user["id"]))
    if not row:
        raise HTTPException(status_code=401, detail="User not registered")
    return row
