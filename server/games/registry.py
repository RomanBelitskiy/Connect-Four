"""Registry of pluggable game engines.

To add a mini-game:
1. Create server/games/<module>.py with GAME_TYPE and engine functions.
2. Append the module to _ENGINE_MODULES below.
3. Add a matching entry in js/games/catalog.js and pick-game-render.js.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from server.games import connect_four, infinite_ttt

_ENGINE_MODULES = (connect_four, infinite_ttt)

_ENGINES = {m.GAME_TYPE: m for m in _ENGINE_MODULES}

GAME_TYPES = frozenset(_ENGINES.keys())
DEFAULT_GAME_TYPE = connect_four.GAME_TYPE


@dataclass(frozen=True)
class GameMeta:
    game_type: str
    win_reason: str
    share_label: str
    grid_kind: str  # "columns" | "cells"


_GAME_META: dict[str, GameMeta] = {
    connect_four.GAME_TYPE: GameMeta(
        connect_four.GAME_TYPE,
        "connect4",
        "Connect Four",
        "columns",
    ),
    infinite_ttt.GAME_TYPE: GameMeta(
        infinite_ttt.GAME_TYPE,
        "tic_tac_toe",
        "Нескінченні хрестики-нулики",
        "cells",
    ),
}


def get_meta(game_type: str | None) -> GameMeta:
    resolved = resolve_game_type(game_type)
    return _GAME_META[resolved]


def infer_game_type_from_grid(grid: Any) -> str | None:
    if isinstance(grid, dict) and isinstance(grid.get("cells"), list):
        return infinite_ttt.GAME_TYPE
    if isinstance(grid, list):
        return connect_four.GAME_TYPE
    return None


def resolve_game_type(game_type: str | None, grid: Any = None) -> str:
    if game_type and game_type in _ENGINES:
        return game_type
    inferred = infer_game_type_from_grid(grid)
    if inferred:
        return inferred
    return DEFAULT_GAME_TYPE


def normalize_game_type(game_type: str | None) -> str:
    return resolve_game_type(game_type)


def get_engine(game_type: str | None, grid: Any = None) -> Any:
    return _ENGINES[resolve_game_type(game_type, grid)]


def empty_state_for(game_type: str | None) -> Any:
    return get_engine(game_type).empty_state()


def win_reason_for(game_type: str | None) -> str:
    return get_meta(game_type).win_reason


def game_share_label(game_type: str | None) -> str:
    return get_meta(game_type).share_label


def win_highlight_key(game_type: str | None) -> str:
    """API field for finished match highlight: winLine vs winCells."""
    return "winLine" if get_meta(game_type).grid_kind == "columns" else "winCells"
