from __future__ import annotations

import random
import secrets
from datetime import datetime, timezone
from typing import Any

from psycopg2.extras import Json

from server.db import format_user, get_connection
from server.avatars import public_avatar_url
from server.games.registry import empty_state_for

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



def _spectator_count(lobby_id: str) -> int:
    return _batch_spectator_counts([lobby_id]).get(lobby_id, 0)



def _batch_spectator_counts(lobby_ids: list[str]) -> dict[str, int]:
    if not lobby_ids:
        return {}
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT lobby_id::text AS lobby_id, COUNT(*)::int AS n
                FROM lobby_spectators
                WHERE lobby_id = ANY(%s::uuid[])
                GROUP BY lobby_id
                """,
                (lobby_ids,),
            )
            return {str(row["lobby_id"]): int(row["n"]) for row in cur.fetchall()}



def _batch_viewer_spectating(lobby_ids: list[str], viewer_id: int) -> set[str]:
    if not lobby_ids or viewer_id <= 0:
        return set()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT lobby_id::text AS lobby_id
                FROM lobby_spectators
                WHERE user_id = %s AND lobby_id = ANY(%s::uuid[])
                """,
                (viewer_id, lobby_ids),
            )
            return {str(row["lobby_id"]) for row in cur.fetchall()}



def _is_spectator(lobby_id: str, user_id: int) -> bool:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM lobby_spectators
                WHERE lobby_id = %s AND user_id = %s
                """,
                (lobby_id, user_id),
            )
            return cur.fetchone() is not None



def _add_spectator(lobby_id: str, user_id: int) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO lobby_spectators (lobby_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (lobby_id, user_id) DO NOTHING
                """,
                (lobby_id, user_id),
            )
        conn.commit()



def _remove_spectator(lobby_id: str, user_id: int) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM lobby_spectators WHERE lobby_id = %s AND user_id = %s",
                (lobby_id, user_id),
            )
        conn.commit()



def _clear_spectators(lobby_id: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM lobby_spectators WHERE lobby_id = %s", (lobby_id,))
        conn.commit()



def user_can_view_lobby(row: dict[str, Any], viewer_id: int) -> bool:
    if viewer_id == int(row["host_id"]):
        return True
    if row.get("guest_id") and viewer_id == int(row["guest_id"]):
        return True
    if _is_spectator(str(row["id"]), viewer_id):
        return True
    if row["visibility"] == "open" and row["status"] in ("waiting", "playing"):
        return True
    return False



def _opponent_chip_color(host_chip_color: str) -> str:
    return "red" if host_chip_color == "yellow" else "yellow"



def _reset_grid_for_lobby(lobby: dict[str, Any]) -> Any:
    return empty_state_for(lobby.get("game_type"))



def normalize_first_move(value: str | None) -> str:
    if value in ("host", "guest", "random"):
        return value
    if value in ("me", "self"):
        return "host"
    if value in ("opponent", "guest_first"):
        return "guest"
    return "random"



def resolve_first_turn_id(lobby: dict[str, Any]) -> int:
    policy = normalize_first_move(lobby.get("first_move"))
    host_id = int(lobby["host_id"])
    guest_id = int(lobby["guest_id"])
    if policy == "host":
        return host_id
    if policy == "guest":
        return guest_id
    return random.choice([host_id, guest_id])

