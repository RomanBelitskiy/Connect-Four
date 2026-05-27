from __future__ import annotations

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
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*)::int AS n FROM lobby_spectators WHERE lobby_id = %s",
                (lobby_id,),
            )
            row = cur.fetchone()
            return int(row["n"]) if row else 0



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


