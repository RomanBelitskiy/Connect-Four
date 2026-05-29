from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from typing import Any

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

from server.config import settings
from server.avatars import public_avatar_url
from server.rating import DEFAULT_RATING

_pool: pool.ThreadedConnectionPool | None = None


def init_pool(minconn: int = 2, maxconn: int = 20) -> None:
    global _pool
    if _pool is not None:
        return
    _pool = pool.ThreadedConnectionPool(
        minconn,
        maxconn,
        settings.database_url,
        cursor_factory=RealDictCursor,
    )


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None


@contextmanager
def get_connection():
    if _pool is None:
        init_pool()
    assert _pool is not None
    conn = _pool.getconn()
    try:
        yield conn
    finally:
        _pool.putconn(conn)


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
                    rating INT NOT NULL DEFAULT 100,
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
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_migrations (
                    name VARCHAR(255) PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                "SELECT 1 FROM app_migrations WHERE name = %s",
                ("rating_v2_reset",),
            )
            if not cur.fetchone():
                cur.execute("UPDATE users SET rating = %s", (DEFAULT_RATING,))
                cur.execute(
                    "ALTER TABLE users ALTER COLUMN rating SET DEFAULT %s",
                    (DEFAULT_RATING,),
                )
                cur.execute(
                    "INSERT INTO app_migrations (name) VALUES (%s)",
                    ("rating_v2_reset",),
                )
        conn.commit()


def apply_pending_migrations() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS game_type VARCHAR(32) NOT NULL DEFAULT 'connect_four'"
            )
            cur.execute(
                """
                ALTER TABLE lobbies
                ADD COLUMN IF NOT EXISTS first_move VARCHAR(16) NOT NULL DEFAULT 'random'
                """
            )
            cur.execute(
                "SELECT 1 FROM app_migrations WHERE name = %s",
                ("stats_full_reset_v1",),
            )
            if cur.fetchone():
                conn.commit()
                return
            cur.execute(
                "UPDATE users SET rating = %s, games_played = 0, games_won = 0",
                (DEFAULT_RATING,),
            )
            cur.execute("DELETE FROM match_history")
            cur.execute(
                "INSERT INTO app_migrations (name) VALUES (%s)",
                ("stats_full_reset_v1",),
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


def get_users_by_telegram_ids(telegram_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not telegram_ids:
        return {}
    unique = list({int(tid) for tid in telegram_ids})
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM users WHERE telegram_id = ANY(%s)",
                (unique,),
            )
            return {int(row["telegram_id"]): dict(row) for row in cur.fetchall()}


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
        "rating": row.get("rating") if row.get("rating") is not None else DEFAULT_RATING,
        "createdAt": iso(row.get("created_at")),
        "updatedAt": iso(row.get("updated_at")),
    }
