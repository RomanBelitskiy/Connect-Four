"""Shared game engine interface for lobby sessions."""

from __future__ import annotations

from typing import Any, Protocol


class GameEngine(Protocol):
    game_type: str

    def empty_state(self) -> Any: ...

    def parse_state(self, raw: Any) -> Any: ...

    def validate_move(self, state: Any, move: dict[str, Any]) -> bool: ...

    def apply_move(self, state: Any, move: dict[str, Any], piece: str) -> Any: ...

    def check_winner(self, state: Any, move: dict[str, Any]) -> str | None: ...

    def find_win_highlight(self, state: Any) -> list[dict[str, int]] | None: ...

    def is_draw(self, state: Any) -> bool: ...


def opponent_piece(piece: str) -> str:
    return "g" if piece == "h" else "h"


def piece_for_player(is_host: bool) -> str:
    return "h" if is_host else "g"
