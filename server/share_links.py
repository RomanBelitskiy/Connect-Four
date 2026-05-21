from __future__ import annotations

from server.config import settings

_cached_username: str | None = None


def set_bot_username(username: str | None) -> None:
    global _cached_username
    cleaned = (username or "").strip().lstrip("@")
    _cached_username = cleaned or None


def get_bot_username() -> str | None:
    env = (settings.bot_username or "").strip().lstrip("@")
    return _cached_username or env or None


def build_lobby_share_url(invite_code: str) -> str:
    username = get_bot_username()
    if username:
        short = (settings.bot_app_short_name or "").strip().strip("/")
        if short:
            return f"https://t.me/{username}/{short}?startapp={invite_code}"
        return f"https://t.me/{username}?startapp={invite_code}"
    return f"{settings.webapp_url}/?join={invite_code}"


def build_lobby_webapp_url(invite_code: str) -> str:
    """Пряме посилання на Web App (кнопки бота, не для шерингу)."""
    return f"{settings.webapp_url}/?join={invite_code}"
