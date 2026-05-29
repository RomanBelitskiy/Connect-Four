from __future__ import annotations

import uuid
from typing import Any

from psycopg2.extras import Json
from psycopg2 import IntegrityError

from server.db import get_connection
from server.games.registry import empty_state_for, normalize_game_type

from server.lobby.helpers import (
    _add_spectator,
    _gen_invite_code,
    _remove_spectator,
    normalize_first_move,
)

class ActiveLobbyExistsError(Exception):
    def __init__(self, lobby_id: str) -> None:
        self.lobby_id = lobby_id
        super().__init__("active_lobby_exists")


def _close_active_lobbies_for_user_cur(cur, user_id: int) -> None:
    """Закриває всі активні лобі користувача в поточній транзакції."""
    cur.execute(
        """
        UPDATE lobbies SET
            guest_id = NULL,
            guest_ready = FALSE,
            guest_clock = seconds_per_player,
            countdown_at = NULL,
            updated_at = NOW()
        WHERE status = 'waiting' AND guest_id = %s
        """,
        (user_id,),
    )
    cur.execute(
        """
        UPDATE lobbies SET status = 'cancelled', updated_at = NOW()
        WHERE status = 'waiting' AND host_id = %s
        """,
        (user_id,),
    )
    cur.execute(
        """
        UPDATE lobbies SET
            status = 'forfeited',
            winner_id = CASE WHEN host_id = %s THEN guest_id ELSE host_id END,
            win_reason = 'forfeit',
            updated_at = NOW()
        WHERE status = 'playing'
          AND (host_id = %s OR guest_id = %s)
          AND guest_id IS NOT NULL
        """,
        (user_id, user_id, user_id),
    )


def create_lobby(
    host_id: int,
    visibility: str,
    host_chip_color: str,
    seconds_per_player: int,
    increment_seconds: int,
    game_type: str = "connect_four",
    first_move: str = "random",
) -> dict[str, Any]:
    lobby_id = str(uuid.uuid4())
    invite_code = _gen_invite_code()
    visibility = "closed" if visibility == "closed" else "open"
    host_chip_color = "red" if host_chip_color == "red" else "yellow"
    game_type = normalize_game_type(game_type)
    first_move = normalize_first_move(first_move)
    initial_grid = empty_state_for(game_type)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO lobbies (
                    id, invite_code, host_id, visibility, status,
                    host_chip_color, seconds_per_player, increment_seconds,
                    host_clock, guest_clock, grid, game_type, first_move,
                    host_ready, guest_ready, countdown_at, updated_at
                )
                VALUES (%s, %s, %s, %s, 'waiting', %s, %s, %s, %s, %s, %s, %s, %s, FALSE, FALSE, NULL, NOW())
                RETURNING *
                """,
                (
                    lobby_id,
                    invite_code,
                    host_id,
                    visibility,
                    host_chip_color,
                    seconds_per_player,
                    increment_seconds,
                    seconds_per_player,
                    seconds_per_player,
                    Json(initial_grid),
                    game_type,
                    first_move,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row)



def create_lobby_for_host(
    host_id: int,
    visibility: str,
    host_chip_color: str,
    seconds_per_player: int,
    increment_seconds: int,
    game_type: str = "connect_four",
    first_move: str = "random",
    *,
    replace_existing: bool = False,
) -> dict[str, Any]:
    """Створює лобі під advisory-lock — без гонок подвійного create."""
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_xact_lock(%s)", (host_id,))

                cur.execute(
                    """
                    SELECT id FROM lobbies
                    WHERE status IN ('waiting', 'playing')
                      AND (host_id = %s OR guest_id = %s)
                    LIMIT 1
                    """,
                    (host_id, host_id),
                )
                blocking = cur.fetchone()
                if blocking:
                    if not replace_existing:
                        raise ActiveLobbyExistsError(str(blocking["id"]))
                    _close_active_lobbies_for_user_cur(cur, host_id)

                lobby_id = str(uuid.uuid4())
                invite_code = _gen_invite_code()
                visibility = "closed" if visibility == "closed" else "open"
                host_chip_color = "red" if host_chip_color == "red" else "yellow"
                game_type = normalize_game_type(game_type)
                first_move = normalize_first_move(first_move)
                initial_grid = empty_state_for(game_type)

                cur.execute(
                    """
                    INSERT INTO lobbies (
                        id, invite_code, host_id, visibility, status,
                        host_chip_color, seconds_per_player, increment_seconds,
                        host_clock, guest_clock, grid, game_type, first_move,
                        host_ready, guest_ready, countdown_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, 'waiting', %s, %s, %s, %s, %s, %s, %s, %s, FALSE, FALSE, NULL, NOW())
                    RETURNING *
                    """,
                    (
                        lobby_id,
                        invite_code,
                        host_id,
                        visibility,
                        host_chip_color,
                        seconds_per_player,
                        increment_seconds,
                        seconds_per_player,
                        seconds_per_player,
                        Json(initial_grid),
                        game_type,
                        first_move,
                    ),
                )
                row = cur.fetchone()
            conn.commit()
    except IntegrityError as exc:
        existing = get_active_lobby_for_user(host_id)
        if existing and int(existing["host_id"]) == host_id:
            raise ActiveLobbyExistsError(str(existing["id"])) from exc
        raise
    return dict(row)


def get_lobby_by_id(lobby_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM lobbies WHERE id = %s", (lobby_id,))
            row = cur.fetchone()
            return dict(row) if row else None



def get_lobby_by_invite_code(code: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM lobbies WHERE invite_code = %s",
                (code.strip().upper(),),
            )
            row = cur.fetchone()
            return dict(row) if row else None



def list_open_lobbies() -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM lobbies
                WHERE visibility = 'open' AND status IN ('waiting', 'playing')
                ORDER BY created_at DESC
                LIMIT 30
                """
            )
            return [dict(r) for r in cur.fetchall()]



def get_spectating_lobby_for_user(user_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT l.* FROM lobbies l
                INNER JOIN lobby_spectators s ON s.lobby_id = l.id
                WHERE s.user_id = %s
                  AND l.status IN ('waiting', 'playing')
                ORDER BY s.joined_at DESC
                LIMIT 1
                """,
                (user_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None



def enter_lobby_spectator(lobby_id: str, user_id: int) -> dict[str, Any]:
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        raise ValueError("Lobby not found")
    if lobby["status"] not in ("waiting", "playing"):
        raise ValueError("Lobby is not available")
    if int(lobby["host_id"]) == user_id:
        raise ValueError("Host cannot spectate own lobby")
    if lobby.get("guest_id") and int(lobby["guest_id"]) == user_id:
        return lobby
    _add_spectator(lobby_id, user_id)
    return get_lobby_by_id(lobby_id) or lobby



def leave_lobby_spectator(lobby_id: str, user_id: int) -> None:
    _remove_spectator(lobby_id, user_id)



def get_active_lobby_for_user(user_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM lobbies
                WHERE status IN ('waiting', 'playing')
                  AND (host_id = %s OR guest_id = %s)
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (user_id, user_id),
            )
            row = cur.fetchone()
            return dict(row) if row else None


