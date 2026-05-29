"""Shared DB / game imports for lobby submodules."""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any

from psycopg2.extras import Json

from server.db import format_user, get_connection, get_user_by_telegram_id
from server.avatars import public_avatar_url
from server.share_links import build_lobby_share_url
from server.rating import DEFAULT_RATING, compute_match_deltas
from server.games.base import piece_for_player
from server.games.registry import (
    empty_state_for,
    get_engine,
    normalize_game_type,
    resolve_game_type,
    win_highlight_key,
    win_reason_for,
)

READY_TOGGLE_AT: dict[tuple[str, int], float] = {}
READY_TOGGLE_COOLDOWN_SEC = 1.0


def prune_ready_toggle_for_lobby(lobby_id: str) -> None:
    keys = [key for key in READY_TOGGLE_AT if key[0] == lobby_id]
    for key in keys:
        READY_TOGGLE_AT.pop(key, None)
