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


def _https_fallback(startapp: str | None = None) -> str:
    base = settings.webapp_url.rstrip("/")
    if startapp:
        return f"{base}/?join={startapp}"
    return base


def build_main_mini_app_link(startapp: str | None = None) -> str:
    """
    Main Mini App deep link — той самий режим, що «Відкрити застосунок» у профілі бота.
    Формат: https://t.me/bot?startapp або ?startapp=код
    """
    username = get_bot_username()
    if not username:
        return _https_fallback(startapp)

    base = f"https://t.me/{username}"
    if startapp:
        return f"{base}?startapp={startapp}"
    return f"{base}?startapp"


def build_lobby_share_url(invite_code: str) -> str:
    return build_main_mini_app_link(invite_code)
