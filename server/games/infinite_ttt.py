"""Infinite (vanishing) tic-tac-toe — max 3 marks per player, oldest removed on 4th."""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

GAME_TYPE = "infinite_ttt"
SIZE = 3
CELLS = SIZE * SIZE
MAX_PIECES = 3

_WIN_LINES = (
    (0, 1, 2),
    (3, 4, 5),
    (6, 7, 8),
    (0, 3, 6),
    (1, 4, 7),
    (2, 5, 8),
    (0, 4, 8),
    (2, 4, 6),
)

EMPTY_STATE: dict[str, Any] = {
    "cells": [None] * CELLS,
    "hostOrder": [],
    "guestOrder": [],
}


def empty_state() -> dict[str, Any]:
    return deepcopy(EMPTY_STATE)


def parse_state(raw: Any) -> dict[str, Any]:
    if isinstance(raw, str):
        raw = json.loads(raw)
    if isinstance(raw, list):
        return empty_state()
    if not isinstance(raw, dict):
        return empty_state()
    cells = raw.get("cells")
    if not isinstance(cells, list) or len(cells) != CELLS:
        cells = [None] * CELLS
    else:
        cells = [c if c in ("h", "g") else None for c in cells]
    host_order = raw.get("hostOrder") if isinstance(raw.get("hostOrder"), list) else []
    guest_order = raw.get("guestOrder") if isinstance(raw.get("guestOrder"), list) else []
    return {
        "cells": cells,
        "hostOrder": [int(i) for i in host_order if isinstance(i, int) and 0 <= i < CELLS],
        "guestOrder": [int(i) for i in guest_order if isinstance(i, int) and 0 <= i < CELLS],
    }


def _order_key(piece: str) -> str:
    return "hostOrder" if piece == "h" else "guestOrder"


def validate_move(state: dict[str, Any], move: dict[str, Any]) -> bool:
    cell = move.get("cell")
    if cell is None:
        return False
    try:
        idx = int(cell)
    except (TypeError, ValueError):
        return False
    if idx < 0 or idx >= CELLS:
        return False
    return state["cells"][idx] is None


def apply_move(state: dict[str, Any], move: dict[str, Any], piece: str) -> dict[str, Any]:
    idx = int(move["cell"])
    if idx < 0 or idx >= CELLS:
        raise ValueError("Invalid cell")
    if state["cells"][idx] is not None:
        raise ValueError("Cell occupied")

    order_key = _order_key(piece)
    order: list[int] = state[order_key]
    if len(order) >= MAX_PIECES:
        oldest = order.pop(0)
        state["cells"][oldest] = None

    state["cells"][idx] = piece
    order.append(idx)
    return state


def check_winner(state: dict[str, Any], _move: dict[str, Any]) -> str | None:
    cells = state["cells"]
    for a, b, c in _WIN_LINES:
        piece = cells[a]
        if piece and piece == cells[b] == cells[c]:
            return piece
    return None


def find_win_highlight(state: dict[str, Any]) -> list[dict[str, int]] | None:
    cells = state["cells"]
    for a, b, c in _WIN_LINES:
        piece = cells[a]
        if piece and piece == cells[b] == cells[c]:
            return [{"row": i // SIZE, "col": i % SIZE} for i in (a, b, c)]
    return None


def is_draw(_state: dict[str, Any]) -> bool:
    return False
