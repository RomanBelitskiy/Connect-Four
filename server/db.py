from __future__ import annotations

from datetime import datetime
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor

from server.config import settings
from server.avatars import public_avatar_url


def get_connection():
    return psycopg2.connect(settings.database_url, cursor_factory=RealDictCursor)


def init_db() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    telegram_id BIGINT PRIMARY KEY,
                    username VARCHAR(255),
                    first_name VARCHAR(255) NOT NULL DEFAULT '',
                    last_name VARCHAR(255),
                    display_name VARCHAR(512) NOT NULL DEFAULT 'Гравець',
                    photo_url TEXT,
                    games_played INT NOT NULL DEFAULT 0,
                    games_won INT NOT NULL DEFAULT 0,
                    rating INT NOT NULL DEFAULT 1500,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_users_rating
                ON users (rating DESC)
                """
            )
        conn.commit()


def upsert_user(user_data: dict[str, Any]) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (
                    telegram_id, username, first_name, last_name,
                    display_name, photo_url, updated_at
                )
                VALUES (%(telegram_id)s, %(username)s, %(first_name)s, %(last_name)s,
                        %(display_name)s, %(photo_url)s, NOW())
                ON CONFLICT (telegram_id) DO UPDATE SET
                    username = EXCLUDED.username,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    display_name = EXCLUDED.display_name,
                    photo_url = COALESCE(EXCLUDED.photo_url, users.photo_url),
                    updated_at = NOW()
                RETURNING *
                """,
                user_data,
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row)


def get_user_by_telegram_id(telegram_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM users WHERE telegram_id = %s",
                (telegram_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def format_user(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None

    games_played = row.get("games_played") or 0
    games_won = row.get("games_won") or 0
    winrate = round((games_won / games_played) * 100) if games_played > 0 else 0

    def iso(value: datetime | None) -> str | None:
        return value.isoformat() if value else None

    telegram_id = str(row["telegram_id"])
    tid = int(row["telegram_id"])
    return {
        "id": telegram_id,
        "telegramId": telegram_id,
        "username": row.get("username"),
        "firstName": row.get("first_name"),
        "lastName": row.get("last_name"),
        "displayName": row.get("display_name"),
        "photoUrl": public_avatar_url(tid),
        "gamesPlayed": games_played,
        "gamesWon": games_won,
        "winrate": winrate,
        "rating": row.get("rating") or 1500,
        "createdAt": iso(row.get("created_at")),
        "updatedAt": iso(row.get("updated_at")),
    }
