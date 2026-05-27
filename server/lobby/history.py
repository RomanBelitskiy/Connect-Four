from __future__ import annotations

from typing import Any

from server.db import get_connection
from server.avatars import public_avatar_url

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

