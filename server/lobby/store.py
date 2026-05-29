"""Facade — implementation split across server.lobby.* modules."""

from server.lobby.format import format_lobby, format_lobby_card, format_lobby_cards
from server.lobby.helpers import _is_spectator, user_can_view_lobby
from server.lobby.history import get_leaderboard, get_match_history
from server.lobby.lifecycle import (
    abandon_all_active_lobbies_for_user,
    abandon_lobby_for_replace,
    cancel_lobby,
    join_lobby,
    pause_clock_on_reconnect,
)
from server.lobby.playing import apply_lobby_move, forfeit_lobby, sync_playing_lobby
from server.lobby.pregame import kick_lobby_guest, process_pregame_lobby, set_lobby_ready
from server.lobby.repository import (
    ActiveLobbyExistsError,
    create_lobby,
    create_lobby_for_host,
    enter_lobby_spectator,
    get_active_lobby_for_user,
    get_lobby_by_id,
    get_lobby_by_invite_code,
    get_spectating_lobby_for_user,
    leave_lobby_spectator,
    list_open_lobbies,
)
from server.lobby.schema import init_lobby_tables

__all__ = [
    "init_lobby_tables",
    "format_lobby",
    "format_lobby_card",
    "format_lobby_cards",
    "user_can_view_lobby",
    "_is_spectator",
    "create_lobby",
    "create_lobby_for_host",
    "ActiveLobbyExistsError",
    "get_lobby_by_id",
    "get_lobby_by_invite_code",
    "list_open_lobbies",
    "get_spectating_lobby_for_user",
    "enter_lobby_spectator",
    "leave_lobby_spectator",
    "get_active_lobby_for_user",
    "process_pregame_lobby",
    "set_lobby_ready",
    "kick_lobby_guest",
    "cancel_lobby",
    "abandon_lobby_for_replace",
    "abandon_all_active_lobbies_for_user",
    "join_lobby",
    "pause_clock_on_reconnect",
    "apply_lobby_move",
    "sync_playing_lobby",
    "forfeit_lobby",
    "get_match_history",
    "get_leaderboard",
]
