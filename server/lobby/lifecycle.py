from __future__ import annotations

from typing import Any

from psycopg2.extras import Json

from server.db import get_connection

from server.lobby.helpers import _remove_spectator
from server.lobby.pregame import _is_pregame, _transfer_host
from server.lobby.playing import forfeit_lobby
from server.lobby.repository import (
    get_active_lobby_for_user,
    get_lobby_by_id,
)

def cancel_lobby(lobby_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE lobbies SET status = 'cancelled', updated_at = NOW() WHERE id = %s RETURNING *",
                (lobby_id,),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else {}



def abandon_lobby_for_replace(user_id: int) -> str | None:
    """Закриває активне лобі користувача перед створенням нового."""
    lobby = get_active_lobby_for_user(user_id)
    if not lobby:
        return None
    lobby_id = str(lobby["id"])
    host_id = int(lobby["host_id"])
    if _is_pregame(lobby) and host_id == user_id:
        cancel_lobby(lobby_id)
    else:
        forfeit_lobby(lobby_id, user_id)
    return lobby_id



def join_lobby(lobby_id: str, guest_id: int, *, skip_active_check: bool = False) -> dict[str, Any]:
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        raise ValueError("Lobby not found")
    if lobby["status"] != "waiting":
        raise ValueError("Lobby is not available")
    if int(lobby["host_id"]) == guest_id:
        raise ValueError("Cannot join your own lobby")
    if lobby.get("guest_id"):
        raise ValueError("Lobby is full")

    if not skip_active_check:
        existing = get_active_lobby_for_user(guest_id)
        if existing and str(existing["id"]) != lobby_id:
            raise ValueError("active_lobby_exists")

    _remove_spectator(lobby_id, guest_id)

    base_sec = lobby["seconds_per_player"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lobbies SET
                    guest_id = %s,
                    host_ready = FALSE,
                    guest_ready = FALSE,
                    countdown_at = NULL,
                    host_clock = %s,
                    guest_clock = %s,
                    updated_at = NOW()
                WHERE id = %s AND status = 'waiting' AND guest_id IS NULL
                RETURNING *
                """,
                (guest_id, base_sec, base_sec, lobby_id),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("Lobby is full")
        conn.commit()
    return dict(row)



def pause_clock_on_reconnect(lobby_id: str) -> dict[str, Any] | None:
    """Не знімає час під час розриву з'єднання або рестарту сервера."""
    lobby = get_lobby_by_id(lobby_id)
    if not lobby or lobby["status"] != "playing":
        return lobby
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lobbies SET last_tick_at = NOW(), updated_at = NOW()
                WHERE id = %s AND status = 'playing'
                RETURNING *
                """,
                (lobby_id,),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else lobby


