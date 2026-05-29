from __future__ import annotations

import time
from datetime import timezone
from typing import Any

from psycopg2.extras import Json

from server.db import get_connection
from server.lobby._common import READY_TOGGLE_AT, READY_TOGGLE_COOLDOWN_SEC
from server.lobby.helpers import (
    _add_spectator,
    _now,
    _opponent_chip_color,
    _reset_grid_for_lobby,
    resolve_first_turn_id,
)
from server.lobby.repository import get_lobby_by_id

def _is_pregame(lobby: dict[str, Any]) -> bool:
    return lobby["status"] == "waiting"



def _transfer_host(lobby_id: str, lobby: dict[str, Any]) -> dict[str, Any]:
    guest_id = int(lobby["guest_id"])
    base_sec = int(lobby["seconds_per_player"])
    new_host_chip = _opponent_chip_color(str(lobby["host_chip_color"]))
    reset_grid = _reset_grid_for_lobby(lobby)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lobbies SET
                    host_id = %s,
                    guest_id = NULL,
                    host_chip_color = %s,
                    status = 'waiting',
                    current_turn_id = NULL,
                    grid = %s,
                    host_clock = %s,
                    guest_clock = %s,
                    host_ready = FALSE,
                    guest_ready = FALSE,
                    countdown_at = NULL,
                    last_tick_at = NULL,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (
                    guest_id,
                    new_host_chip,
                    Json(reset_grid),
                    base_sec,
                    base_sec,
                    lobby_id,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else {}



def _guest_leave_pregame(lobby_id: str, lobby: dict[str, Any]) -> dict[str, Any]:
    base_sec = int(lobby["seconds_per_player"])
    reset_grid = _reset_grid_for_lobby(lobby)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lobbies SET
                    guest_id = NULL,
                    status = 'waiting',
                    current_turn_id = NULL,
                    grid = %s,
                    host_clock = %s,
                    guest_clock = %s,
                    host_ready = FALSE,
                    guest_ready = FALSE,
                    countdown_at = NULL,
                    last_tick_at = NULL,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (Json(reset_grid), base_sec, base_sec, lobby_id),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else {}



def _both_ready(lobby: dict[str, Any]) -> bool:
    return bool(lobby.get("guest_id")) and bool(lobby.get("host_ready")) and bool(
        lobby.get("guest_ready")
    )



def _countdown_elapsed(lobby: dict[str, Any]) -> float:
    started = lobby.get("countdown_at")
    if not started:
        return 0.0
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return max(0.0, (_now() - started).total_seconds())



def countdown_seconds_remaining(lobby: dict[str, Any]) -> float | None:
    if not lobby.get("countdown_at"):
        return None
    return max(0.0, 3.0 - _countdown_elapsed(lobby))



def _start_match_from_pregame(lobby_id: str, lobby: dict[str, Any]) -> dict[str, Any]:
    fresh = get_lobby_by_id(lobby_id) or lobby
    base_sec = int(fresh["seconds_per_player"])
    first_turn_id = resolve_first_turn_id(fresh)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lobbies SET
                    status = 'playing',
                    current_turn_id = %s,
                    host_clock = %s,
                    guest_clock = %s,
                    countdown_at = NULL,
                    last_tick_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s AND status = 'waiting' AND guest_id IS NOT NULL
                RETURNING *
                """,
                (first_turn_id, base_sec, base_sec, lobby_id),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else lobby



def _begin_countdown(lobby_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lobbies SET countdown_at = NOW(), updated_at = NOW()
                WHERE id = %s AND status = 'waiting' AND countdown_at IS NULL
                  AND guest_id IS NOT NULL AND host_ready = TRUE AND guest_ready = TRUE
                RETURNING *
                """,
                (lobby_id,),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else get_lobby_by_id(lobby_id) or {}



def process_pregame_lobby(lobby_id: str) -> dict[str, Any]:
    """Запускає відлік 3 с або переводить лобі в гру після відліку."""
    lobby = get_lobby_by_id(lobby_id)
    if not lobby or lobby["status"] != "waiting":
        return lobby or {}

    if lobby.get("countdown_at"):
        if _countdown_elapsed(lobby) >= 3:
            return _start_match_from_pregame(lobby_id, lobby)
        return lobby

    if _both_ready(lobby):
        return _begin_countdown(lobby_id)
    return lobby



def set_lobby_ready(lobby_id: str, player_id: int, ready: bool) -> dict[str, Any]:
    key = (str(lobby_id), int(player_id))
    now = time.monotonic()
    last = READY_TOGGLE_AT.get(key)
    if last is not None and now - last < READY_TOGGLE_COOLDOWN_SEC:
        raise ValueError("Ready toggle too fast")
    READY_TOGGLE_AT[key] = now

    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        raise ValueError("Lobby not found")
    if lobby["status"] != "waiting":
        raise ValueError("Lobby is not in pregame")
    if not lobby.get("guest_id"):
        raise ValueError("Waiting for opponent")
    if lobby.get("countdown_at"):
        raise ValueError("Countdown already started")

    host_id = int(lobby["host_id"])
    guest_id = int(lobby["guest_id"])
    if player_id == host_id:
        field = "host_ready"
    elif player_id == guest_id:
        field = "guest_ready"
    else:
        raise ValueError("Not in lobby")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE lobbies SET {field} = %s, updated_at = NOW()
                WHERE id = %s AND status = 'waiting' AND countdown_at IS NULL
                RETURNING *
                """,
                (ready, lobby_id),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise ValueError("Could not update ready state")
    updated = dict(row)
    return process_pregame_lobby(lobby_id) or updated



def kick_lobby_guest(lobby_id: str, host_id: int) -> dict[str, Any]:
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        raise ValueError("Lobby not found")
    if int(lobby["host_id"]) != host_id:
        raise ValueError("Only host can remove guest")
    if lobby["status"] != "waiting":
        raise ValueError("Lobby is not in pregame")
    if not lobby.get("guest_id"):
        raise ValueError("No guest to remove")
    if lobby.get("countdown_at"):
        raise ValueError("Cannot remove guest during countdown")
    guest_id = int(lobby["guest_id"])
    row = _guest_leave_pregame(lobby_id, lobby)
    _add_spectator(lobby_id, guest_id)
    return row


