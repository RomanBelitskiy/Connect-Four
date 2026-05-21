from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg2
from psycopg2.extras import Json, RealDictCursor

from server.config import settings
from server.db import format_user, get_connection, get_user_by_telegram_id
from server.avatars import public_avatar_url
from server.share_links import build_lobby_share_url
from server.game_logic import (
    EMPTY_GRID,
    apply_move,
    check_winner,
    is_board_full,
    parse_grid,
    piece_for_player,
    playable_columns,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _gen_invite_code() -> str:
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8].upper()


def _time_label(seconds: int, increment: int) -> str:
    if seconds >= 60:
        base = f"{seconds // 60}m"
    else:
        base = f"{seconds}s"
    return f"{base} + {increment}s"


def init_lobby_tables() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS lobbies (
                    id UUID PRIMARY KEY,
                    invite_code VARCHAR(16) UNIQUE NOT NULL,
                    host_id BIGINT NOT NULL REFERENCES users(telegram_id),
                    guest_id BIGINT REFERENCES users(telegram_id),
                    visibility VARCHAR(16) NOT NULL DEFAULT 'open',
                    status VARCHAR(16) NOT NULL DEFAULT 'waiting',
                    host_chip_color VARCHAR(8) NOT NULL DEFAULT 'yellow',
                    seconds_per_player INT NOT NULL DEFAULT 60,
                    increment_seconds INT NOT NULL DEFAULT 1,
                    grid JSONB NOT NULL DEFAULT '[[],[],[],[],[],[],[]]',
                    current_turn_id BIGINT,
                    host_clock INT NOT NULL DEFAULT 60,
                    guest_clock INT NOT NULL DEFAULT 60,
                    last_tick_at TIMESTAMPTZ,
                    winner_id BIGINT,
                    win_reason VARCHAR(32),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_lobbies_status_visibility
                ON lobbies (status, visibility)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_lobbies_invite_code
                ON lobbies (invite_code)
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS match_history (
                    id UUID PRIMARY KEY,
                    lobby_id UUID NOT NULL,
                    host_id BIGINT NOT NULL,
                    guest_id BIGINT NOT NULL,
                    winner_id BIGINT,
                    host_rating_delta INT NOT NULL DEFAULT 0,
                    guest_rating_delta INT NOT NULL DEFAULT 0,
                    time_label VARCHAR(32),
                    played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_match_history_host
                ON match_history (host_id, played_at DESC)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_match_history_guest
                ON match_history (guest_id, played_at DESC)
                """
            )
        conn.commit()


def _format_public_user(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    u = format_user(row)
    tid = int(row["telegram_id"])
    photo = public_avatar_url(tid)
    return {
        "telegramId": u["telegramId"],
        "displayName": u["displayName"],
        "username": u.get("username"),
        "photoUrl": photo,
    }


def format_lobby(row: dict[str, Any], viewer_id: int | None = None) -> dict[str, Any]:
    host = get_user_by_telegram_id(int(row["host_id"]))
    guest = get_user_by_telegram_id(int(row["guest_id"])) if row.get("guest_id") else None
    my_role = None
    if viewer_id is not None:
        if viewer_id == int(row["host_id"]):
            my_role = "host"
        elif row.get("guest_id") and viewer_id == int(row["guest_id"]):
            my_role = "guest"

    return {
        "id": str(row["id"]),
        "inviteCode": row["invite_code"],
        "shareUrl": build_lobby_share_url(row["invite_code"]),
        "visibility": row["visibility"],
        "status": row["status"],
        "hostChipColor": row["host_chip_color"],
        "secondsPerPlayer": row["seconds_per_player"],
        "incrementSeconds": row["increment_seconds"],
        "timeLabel": _time_label(row["seconds_per_player"], row["increment_seconds"]),
        "grid": parse_grid(row["grid"]),
        "currentTurnId": str(row["current_turn_id"]) if row.get("current_turn_id") else None,
        "hostClock": row["host_clock"],
        "guestClock": row["guest_clock"],
        "host": _format_public_user(host),
        "guest": _format_public_user(guest),
        "winnerId": str(row["winner_id"]) if row.get("winner_id") else None,
        "winReason": row.get("win_reason"),
        "myRole": my_role,
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
    }


def format_lobby_card(row: dict[str, Any], viewer_id: int | None = None) -> dict[str, Any]:
    host = get_user_by_telegram_id(int(row["host_id"]))
    host_user = _format_public_user(host)
    host_name = host["display_name"] if host else "Гравець"
    title = f"Кімната @{host['username']}" if host and host.get("username") else f"Кімната {host_name}"
    is_mine = viewer_id is not None and int(row["host_id"]) == viewer_id
    return {
        "id": str(row["id"]),
        "inviteCode": row["invite_code"],
        "title": title,
        "hostName": host_name,
        "hostPhotoUrl": public_avatar_url(int(row["host_id"])),
        "timeLabel": _time_label(row["seconds_per_player"], row["increment_seconds"]),
        "visibility": row["visibility"],
        "isMine": is_mine,
    }


def create_lobby(
    host_id: int,
    visibility: str,
    host_chip_color: str,
    seconds_per_player: int,
    increment_seconds: int,
) -> dict[str, Any]:
    lobby_id = str(uuid.uuid4())
    invite_code = _gen_invite_code()
    visibility = "closed" if visibility == "closed" else "open"
    host_chip_color = "red" if host_chip_color == "red" else "yellow"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO lobbies (
                    id, invite_code, host_id, visibility, status,
                    host_chip_color, seconds_per_player, increment_seconds,
                    host_clock, guest_clock, grid, updated_at
                )
                VALUES (%s, %s, %s, %s, 'waiting', %s, %s, %s, %s, %s, %s, NOW())
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
                    Json(EMPTY_GRID),
                ),
            )
            row = cur.fetchone()
        conn.commit()
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
                WHERE status = 'waiting' AND visibility = 'open'
                ORDER BY created_at DESC
                LIMIT 30
                """
            )
            return [dict(r) for r in cur.fetchall()]


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


def _grid_has_moves(lobby: dict[str, Any]) -> bool:
    grid = parse_grid(lobby["grid"])
    return any(len(col) > 0 for col in grid)


def _is_pregame(lobby: dict[str, Any]) -> bool:
    if lobby["status"] == "waiting":
        return True
    if lobby["status"] == "playing":
        return not _grid_has_moves(lobby)
    return False


def _opponent_chip_color(host_chip_color: str) -> str:
    return "red" if host_chip_color == "yellow" else "yellow"


def _transfer_host(lobby_id: str, lobby: dict[str, Any]) -> dict[str, Any]:
    guest_id = int(lobby["guest_id"])
    base_sec = int(lobby["seconds_per_player"])
    new_host_chip = _opponent_chip_color(str(lobby["host_chip_color"]))
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
                    last_tick_at = NULL,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (
                    guest_id,
                    new_host_chip,
                    Json(EMPTY_GRID),
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
                    last_tick_at = NULL,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (Json(EMPTY_GRID), base_sec, base_sec, lobby_id),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else {}


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

    base_sec = lobby["seconds_per_player"]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE lobbies SET
                    guest_id = %s,
                    status = 'playing',
                    current_turn_id = host_id,
                    host_clock = %s,
                    guest_clock = %s,
                    last_tick_at = NOW(),
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
        return get_lobby_by_id(lobby_id) or {}

    win_delta, loss_delta = 20, -15
    host_delta = guest_delta = 0
    if winner_id == host_id:
        host_delta, guest_delta = win_delta, loss_delta
    elif winner_id == guest_id:
        host_delta, guest_delta = loss_delta, win_delta

    with get_connection() as conn:
        with conn.cursor() as cur:
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
    return get_lobby_by_id(lobby_id) or dict(finished)


def apply_lobby_move(lobby_id: str, player_id: int, column: int) -> dict[str, Any]:
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        raise ValueError("Lobby not found")
    if lobby["status"] != "playing":
        raise ValueError("Game is not active")
    if int(lobby.get("current_turn_id") or 0) != player_id:
        raise ValueError("Not your turn")

    lobby = _tick_clocks(lobby)
    host_clock = lobby["host_clock"]
    guest_clock = lobby["guest_clock"]
    if int(lobby["current_turn_id"]) == int(lobby["host_id"]) and host_clock <= 0:
        return _finish_match(lobby_id, int(lobby["guest_id"]), "timeout", 0, guest_clock)
    if int(lobby["current_turn_id"]) == int(lobby["guest_id"]) and guest_clock <= 0:
        return _finish_match(lobby_id, int(lobby["host_id"]), "timeout", host_clock, 0)

    grid = parse_grid(lobby["grid"])
    if column not in playable_columns(grid):
        raise ValueError("Invalid move")

    is_host = player_id == int(lobby["host_id"])
    piece = piece_for_player(is_host)
    apply_move(grid, column, piece)

    inc = lobby["increment_seconds"]
    if is_host:
        host_clock += inc
        next_turn = int(lobby["guest_id"])
    else:
        guest_clock += inc
        next_turn = int(lobby["host_id"])

    winner_piece = check_winner(grid, column)
    winner_id = None
    win_reason = None

    if winner_piece:
        winner_id = int(lobby["host_id"]) if winner_piece == "h" else int(lobby["guest_id"])
        win_reason = "connect4"
        return _finish_match(lobby_id, winner_id, win_reason, host_clock, guest_clock, grid)

    if is_board_full(grid):
        return _finish_match(lobby_id, None, "draw", host_clock, guest_clock, grid)

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
                WHERE id = %s
                RETURNING *
                """,
                (Json(grid), next_turn, host_clock, guest_clock, lobby_id),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else {}


def sync_playing_lobby(lobby_id: str, *, reset_tick_anchor: bool = False) -> dict[str, Any]:
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        return {}
    if reset_tick_anchor:
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
            return get_lobby_by_id(lobby_id) or {}

        if guest_id and player_id == guest_id:
            return _guest_leave_pregame(lobby_id, lobby)

        raise ValueError("Not in lobby")

    if lobby["status"] != "playing":
        return lobby

    winner_id = guest_id if player_id == host_id else host_id
    return _finish_match(lobby_id, winner_id, "forfeit", lobby["host_clock"], lobby["guest_clock"])


def get_match_history(user_id: int, limit: int = 20) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT mh.*,
                       hu.display_name AS host_name, hu.username AS host_username,
                       gu.display_name AS guest_name, gu.username AS guest_username
                FROM match_history mh
                JOIN users hu ON hu.telegram_id = mh.host_id
                JOIN users gu ON gu.telegram_id = mh.guest_id
                WHERE mh.host_id = %s OR mh.guest_id = %s
                ORDER BY mh.played_at DESC
                LIMIT %s
                """,
                (user_id, user_id, limit),
            )
            rows = cur.fetchall()

    result = []
    for row in rows:
        is_host = int(row["host_id"]) == user_id
        opp_name = row["guest_name"] if is_host else row["host_name"]
        opp_username = row["guest_username"] if is_host else row["host_username"]
        opp_label = f"@{opp_username}" if opp_username else opp_name
        winner_id = row.get("winner_id")
        if winner_id is None:
            result_type = "draw"
            delta = "+0"
        elif int(winner_id) == user_id:
            result_type = "win"
            delta = f"+{row['host_rating_delta'] if is_host else row['guest_rating_delta']}"
        else:
            result_type = "loss"
            delta = str(row["host_rating_delta"] if is_host else row["guest_rating_delta"])

        played = row["played_at"]
        result.append(
            {
                "result": result_type,
                "opponent": f"Проти {opp_label}",
                "meta": played.strftime("%d.%m.%Y") if played else "",
                "timeLabel": row.get("time_label") or "",
                "delta": delta,
            }
        )
    return result


def get_leaderboard(limit: int = 50) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT telegram_id, display_name, username, rating, games_played, games_won
                FROM users
                WHERE games_played > 0
                ORDER BY rating DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()

    result = []
    for i, row in enumerate(rows, start=1):
        tid = int(row["telegram_id"])
        name = row["username"] or row["display_name"]
        result.append(
            {
                "rank": i,
                "telegramId": str(tid),
                "name": name,
                "displayName": row["display_name"],
                "photoUrl": public_avatar_url(tid),
                "score": row["rating"],
                "delta": "+0",
            }
        )
    return result
