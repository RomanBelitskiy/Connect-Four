"""Connect Four game engine."""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

COLS = 7
ROWS = 6
GAME_TYPE = "connect_four"
EMPTY_GRID: list[list[str]] = [[] for _ in range(COLS)]


def empty_state() -> list[list[str]]:
    return deepcopy(EMPTY_GRID)


def parse_state(raw: Any) -> list[list[str]]:
    if isinstance(raw, str):
        raw = json.loads(raw)
    if not isinstance(raw, list) or len(raw) != COLS:
        return empty_state()
    return [list(col) if isinstance(col, list) else [] for col in raw]


def playable_columns(grid: list[list[str]]) -> list[int]:
    return [i for i in range(COLS) if len(grid[i]) < ROWS]


def validate_move(grid: list[list[str]], move: dict[str, Any]) -> bool:
    column = move.get("column")
    if column is None:
        return False
    try:
        col = int(column)
    except (TypeError, ValueError):
        return False
    return col in playable_columns(grid)


def apply_move(grid: list[list[str]], move: dict[str, Any], piece: str) -> list[list[str]]:
    column = int(move["column"])
    if column < 0 or column >= COLS:
        raise ValueError("Invalid column")
    if len(grid[column]) >= ROWS:
        raise ValueError("Column full")
    grid[column].append(piece)
    return grid


def _read_cell(grid: list[list[str]], col: int, row_from_bottom: int) -> str | None:
    if col < 0 or col >= COLS or row_from_bottom < 0 or row_from_bottom >= ROWS:
        return None
    if len(grid[col]) <= row_from_bottom:
        return None
    return grid[col][row_from_bottom]


_WIN_DIRECTIONS = ((1, 0), (0, 1), (1, 1), (1, -1))


def find_win_highlight(grid: list[list[str]]) -> list[dict[str, int]] | None:
    for col in range(COLS):
        for row in range(ROWS):
            piece = _read_cell(grid, col, row)
            if piece not in ("h", "g"):
                continue
            for dc, dr in _WIN_DIRECTIONS:
                if _read_cell(grid, col - dc, row - dr) == piece:
                    continue
                line: list[tuple[int, int]] = []
                c, r = col, row
                while _read_cell(grid, c, r) == piece:
                    line.append((c, r))
                    c += dc
                    r += dr
                if len(line) >= 4:
                    return [{"col": c, "row": r} for c, r in line[:4]]
    return None


def check_winner(grid: list[list[str]], move: dict[str, Any]) -> str | None:
    column = int(move["column"])
    row_idx = len(grid[column]) - 1
    piece = _read_cell(grid, column, row_idx)
    if piece not in ("h", "g"):
        return None

    def arm(dc: int, dr: int) -> int:
        count = 0
        c, r = column + dc, row_idx + dr
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


def is_draw(grid: list[list[str]]) -> bool:
    return not playable_columns(grid)
