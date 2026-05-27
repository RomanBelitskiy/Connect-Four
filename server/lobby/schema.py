from __future__ import annotations

from server.db import get_connection

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
            cur.execute(
                "ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS host_ready BOOLEAN NOT NULL DEFAULT FALSE"
            )
            cur.execute(
                "ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS guest_ready BOOLEAN NOT NULL DEFAULT FALSE"
            )
            cur.execute(
                "ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS countdown_at TIMESTAMPTZ"
            )
            cur.execute(
                "ALTER TABLE lobbies ADD COLUMN IF NOT EXISTS game_type VARCHAR(32) NOT NULL DEFAULT 'connect_four'"
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS lobby_spectators (
                    lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
                    user_id BIGINT NOT NULL REFERENCES users(telegram_id),
                    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (lobby_id, user_id)
                )
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_lobby_spectators_lobby
                ON lobby_spectators (lobby_id)
                """
            )
        conn.commit()


