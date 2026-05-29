from __future__ import annotations

import uuid
from datetime import timezone
from typing import Any

from psycopg2.extras import Json

from server.db import get_connection
from server.games.base import piece_for_player
from server.games.registry import get_engine, resolve_game_type, win_reason_for
from server.rating import DEFAULT_RATING, compute_match_deltas

from server.lobby.helpers import _add_spectator, _clear_spectators, _now, _time_label
from server.lobby._common import prune_ready_toggle_for_lobby
from server.lobby.pregame import (
    _guest_leave_pregame,
    _is_pregame,
    _transfer_host,
    process_pregame_lobby,
)
from server.lobby.repository import get_lobby_by_id

def _tick_clocks(row: dict[str, Any]) -> dict[str, Any]:
    if row["status"] != "playing" or not row.get("current_turn_id"):
        return row
    last_tick = row.get("last_tick_at")
    if not last_tick:
        return row

    now = _now()
    if last_tick.tzinfo is None:
        last_tick = last_tick.replace(tzinfo=timezone.utc)
    elapsed = max(0, int((now - last_tick).total_seconds()))
    if elapsed <= 0:
        return row

    host_clock = row["host_clock"]
    guest_clock = row["guest_clock"]
    if int(row["current_turn_id"]) == int(row["host_id"]):
        host_clock = max(0, host_clock - elapsed)
    else:
        guest_clock = max(0, guest_clock - elapsed)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lobbies SET
                    host_clock = %s,
                    guest_clock = %s,
                    last_tick_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (host_clock, guest_clock, str(row["id"])),
            )
            updated = cur.fetchone()
        conn.commit()
    return dict(updated) if updated else row



def _finish_match(
    lobby_id: str,
    winner_id: int | None,
    win_reason: str,
    host_clock: int,
    guest_clock: int,
    grid: list[list[str]] | None = None,
) -> dict[str, Any]:
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        return {}

    if lobby["status"] == "finished":
        return lobby

    host_id = int(lobby["host_id"])
    guest_id = int(lobby["guest_id"]) if lobby.get("guest_id") else None
    if not guest_id:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE lobbies SET status = 'cancelled', updated_at = NOW()
                    WHERE id = %s
                    """,
                    (lobby_id,),
                )
            conn.commit()
        prune_ready_toggle_for_lobby(lobby_id)
        _clear_spectators(lobby_id)
        return get_lobby_by_id(lobby_id) or {}

    host_delta = guest_delta = 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            if winner_id in (host_id, guest_id):
                cur.execute(
                    """
                    SELECT telegram_id, rating FROM users
                    WHERE telegram_id IN (%s, %s)
                    """,
                    (host_id, guest_id),
                )
                ratings = {int(r["telegram_id"]): int(r["rating"]) for r in cur.fetchall()}
                host_rating = ratings.get(host_id, DEFAULT_RATING)
                guest_rating = ratings.get(guest_id, DEFAULT_RATING)
                if winner_id == host_id:
                    host_delta, guest_delta = compute_match_deltas(host_rating, guest_rating)
                else:
                    guest_delta, host_delta = compute_match_deltas(guest_rating, host_rating)
            if grid is not None:
                cur.execute(
                    """
                    UPDATE lobbies SET
                        grid = %s,
                        status = 'finished',
                        winner_id = %s,
                        win_reason = %s,
                        host_clock = %s,
                        guest_clock = %s,
                        current_turn_id = NULL,
                        last_tick_at = NOW(),
                        updated_at = NOW()
                    WHERE id = %s AND status != 'finished'
                    RETURNING *
                    """,
                    (Json(grid), winner_id, win_reason, host_clock, guest_clock, lobby_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE lobbies SET
                        status = 'finished',
                        winner_id = %s,
                        win_reason = %s,
                        host_clock = %s,
                        guest_clock = %s,
                        current_turn_id = NULL,
                        updated_at = NOW()
                    WHERE id = %s AND status != 'finished'
                    RETURNING *
                    """,
                    (winner_id, win_reason, host_clock, guest_clock, lobby_id),
                )
            finished = cur.fetchone()
            if not finished:
                return lobby

            cur.execute(
                "SELECT 1 FROM match_history WHERE lobby_id = %s LIMIT 1",
                (lobby_id,),
            )
            if cur.fetchone():
                return dict(finished)

            cur.execute(
                """
                INSERT INTO match_history (
                    id, lobby_id, host_id, guest_id, winner_id,
                    host_rating_delta, guest_rating_delta, time_label
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(uuid.uuid4()),
                    lobby_id,
                    host_id,
                    guest_id,
                    winner_id,
                    host_delta,
                    guest_delta,
                    _time_label(lobby["seconds_per_player"], lobby["increment_seconds"]),
                ),
            )

            for uid, delta, won in [
                (host_id, host_delta, winner_id == host_id),
                (guest_id, guest_delta, winner_id == guest_id),
            ]:
                cur.execute(
                    """
                    UPDATE users SET
                        games_played = games_played + 1,
                        games_won = games_won + %s,
                        rating = GREATEST(0, rating + %s),
                        updated_at = NOW()
                    WHERE telegram_id = %s
                    """,
                    (1 if won else 0, delta, uid),
                )
        conn.commit()
    prune_ready_toggle_for_lobby(lobby_id)
    _clear_spectators(lobby_id)
    return get_lobby_by_id(lobby_id) or dict(finished)



def apply_lobby_move(lobby_id: str, player_id: int, move: dict[str, Any]) -> dict[str, Any]:
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        raise ValueError("Lobby not found")
    if lobby["status"] != "playing":
        raise ValueError("Game is not active")
    if int(lobby.get("current_turn_id") or 0) != player_id:
        raise ValueError("Not your turn")

    game_type = resolve_game_type(lobby.get("game_type"), lobby.get("grid"))
    engine = get_engine(game_type, lobby.get("grid"))

    lobby = _tick_clocks(lobby)
    host_clock = lobby["host_clock"]
    guest_clock = lobby["guest_clock"]
    if int(lobby["current_turn_id"]) == int(lobby["host_id"]) and host_clock <= 0:
        return _finish_match(lobby_id, int(lobby["guest_id"]), "timeout", 0, guest_clock)
    if int(lobby["current_turn_id"]) == int(lobby["guest_id"]) and guest_clock <= 0:
        return _finish_match(lobby_id, int(lobby["host_id"]), "timeout", host_clock, 0)

    state = engine.parse_state(lobby["grid"])
    if not engine.validate_move(state, move):
        raise ValueError("Invalid move")

    is_host = player_id == int(lobby["host_id"])
    piece = piece_for_player(is_host)
    state = engine.apply_move(state, move, piece)

    inc = lobby["increment_seconds"]
    if is_host:
        host_clock += inc
        next_turn = int(lobby["guest_id"])
    else:
        guest_clock += inc
        next_turn = int(lobby["host_id"])

    winner_piece = engine.check_winner(state, move)
    if winner_piece:
        winner_id = int(lobby["host_id"]) if winner_piece == "h" else int(lobby["guest_id"])
        win_reason = win_reason_for(game_type)
        return _finish_match(lobby_id, winner_id, win_reason, host_clock, guest_clock, state)

    if engine.is_draw(state):
        return _finish_match(lobby_id, None, "draw", host_clock, guest_clock, state)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lobbies SET
                    grid = %s,
                    current_turn_id = %s,
                    host_clock = %s,
                    guest_clock = %s,
                    last_tick_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s AND status = 'playing' AND current_turn_id = %s
                RETURNING *
                """,
                (Json(state), next_turn, host_clock, guest_clock, lobby_id, player_id),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise ValueError("Not your turn")
    return dict(row)



def sync_playing_lobby(lobby_id: str, *, reset_tick_anchor: bool = False) -> dict[str, Any]:
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        return {}
    if lobby["status"] == "waiting":
        return process_pregame_lobby(lobby_id)
    if reset_tick_anchor:
        from server.lobby.lifecycle import pause_clock_on_reconnect

        paused = pause_clock_on_reconnect(lobby_id)
        if paused:
            lobby = paused
    if lobby["status"] != "playing":
        return lobby

    lobby = _tick_clocks(lobby)
    if lobby["status"] != "playing" or not lobby.get("current_turn_id"):
        return lobby

    host_id = int(lobby["host_id"])
    guest_id = int(lobby["guest_id"])
    host_clock = lobby["host_clock"]
    guest_clock = lobby["guest_clock"]

    if int(lobby["current_turn_id"]) == host_id and host_clock <= 0:
        return _finish_match(lobby_id, guest_id, "timeout", 0, guest_clock)
    if int(lobby["current_turn_id"]) == guest_id and guest_clock <= 0:
        return _finish_match(lobby_id, host_id, "timeout", host_clock, 0)
    return lobby



def forfeit_lobby(lobby_id: str, player_id: int) -> dict[str, Any]:
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        raise ValueError("Lobby not found")

    host_id = int(lobby["host_id"])
    guest_id = int(lobby["guest_id"]) if lobby.get("guest_id") else None

    if lobby["status"] == "playing":
        if not guest_id or player_id not in (host_id, guest_id):
            raise ValueError("Not in lobby")
        winner_id = guest_id if player_id == host_id else host_id
        return _finish_match(
            lobby_id,
            winner_id,
            "forfeit",
            lobby["host_clock"],
            lobby["guest_clock"],
        )

    if _is_pregame(lobby):
        if player_id == host_id:
            if guest_id:
                return _transfer_host(lobby_id, lobby)
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE lobbies SET status = 'cancelled', updated_at = NOW() WHERE id = %s",
                        (lobby_id,),
                    )
                conn.commit()
            prune_ready_toggle_for_lobby(lobby_id)
            _clear_spectators(lobby_id)
            return get_lobby_by_id(lobby_id) or {}

        if guest_id and player_id == guest_id:
            row = _guest_leave_pregame(lobby_id, lobby)
            _add_spectator(lobby_id, guest_id)
            return row

        raise ValueError("Not in lobby")

    return lobby


