"""Connect Four board logic (server-authoritative)."""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

COLS = 7
ROWS = 6
EMPTY_GRID: list[list[str]] = [[] for _ in range(COLS)]


def empty_grid() -> list[list[str]]:
    return deepcopy(EMPTY_GRID)


def parse_grid(raw: Any) -> list[list[str]]:
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, list) or len(raw) != COLS:
        return empty_grid()
    return [list(col) if isinstance(col, list) else [] for col in raw]


def playable_columns(grid: list[list[str]]) -> list[int]:
    return [i for i in range(COLS) if len(grid[i]) < ROWS]


def apply_move(grid: list[list[str]], column: int, piece: str) -> int:
    if column < 0 or column >= COLS:
        raise ValueError("Invalid column")
    if len(grid[column]) >= ROWS:
        raise ValueError("Column full")
    grid[column].append(piece)
    return len(grid[column]) - 1


def _read_cell(grid: list[list[str]], col: int, row_from_bottom: int) -> str | None:
    if col < 0 or col >= COLS or row_from_bottom < 0 or row_from_bottom >= ROWS:
        return None
    if len(grid[col]) <= row_from_bottom:
        return None
    return grid[col][row_from_bottom]


def check_winner(grid: list[list[str]], move_column: int) -> str | None:
    row_idx = len(grid[move_column]) - 1
    piece = _read_cell(grid, move_column, row_idx)
    if piece not in ("h", "g"):
        return None

    def arm(dc: int, dr: int) -> int:
        count = 0
        c, r = move_column + dc, row_idx + dr
        while _read_cell(grid, c, r) == piece:
            count += 1
            c += dc
            r += dr
        return count

    for dc1, dr1, dc2, dr2 in [
        (-1, 0, 1, 0),
        (0, -1, 0, 1),
        (-1, -1, 1, 1),
        (-1, 1, 1, -1),
    ]:
        total = 1 + arm(dc1, dr1) + arm(dc2, dr2)
        if total >= 4:
            return piece
    return None


def is_board_full(grid: list[list[str]]) -> bool:
    return not playable_columns(grid)


def opponent_piece(piece: str) -> str:
    return "g" if piece == "h" else "h"


def piece_for_player(is_host: bool) -> str:
    return "h" if is_host else "g"
