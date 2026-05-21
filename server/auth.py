import hashlib
import hmac
import json
from typing import Any
from urllib.parse import parse_qsl


def validate_init_data(init_data: str, bot_token: str) -> bool:
    """Перевіряє підпис initData від Telegram Web App."""
    if not init_data or not bot_token:
        return False

    params = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = params.pop("hash", None)
    if not received_hash:
        return False

    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(params.items())
    )

    secret_key = hmac.new(
        b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256
    ).digest()
    calculated_hash = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(calculated_hash, received_hash)


def parse_init_data_user(init_data: str) -> dict[str, Any] | None:
    params = dict(parse_qsl(init_data, keep_blank_values=True))
    user_raw = params.get("user")
    if not user_raw:
        return None

    try:
        return json.loads(user_raw)
    except json.JSONDecodeError:
        return None


def build_display_name(user: dict[str, Any] | None) -> str:
    if not user:
        return "Гравець"

    full_name = " ".join(
        part for part in (user.get("first_name"), user.get("last_name")) if part
    )
    return full_name or user.get("username") or "Гравець"
