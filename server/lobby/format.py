from __future__ import annotations

from typing import Any

from server.db import get_user_by_telegram_id, get_users_by_telegram_ids
from server.avatars import public_avatar_url
from server.share_links import build_lobby_share_url
from server.games.registry import get_engine, resolve_game_type, win_highlight_key

from server.lobby.helpers import (
    _batch_spectator_counts,
    _batch_viewer_spectating,
    _format_public_user,
    _is_spectator,
    _spectator_count,
    _time_label,
)
from server.lobby.pregame import countdown_seconds_remaining

def format_lobby(
    row: dict[str, Any],
    viewer_id: int | None = None,
    *,
    host_row: dict[str, Any] | None = None,
    guest_row: dict[str, Any] | None = None,
    skip_spectator_count: bool = False,
) -> dict[str, Any]:
    host = (
        host_row
        if host_row is not None
        else get_user_by_telegram_id(int(row["host_id"]))
    )
    guest = None
    if row.get("guest_id"):
        guest = (
            guest_row
            if guest_row is not None
            else get_user_by_telegram_id(int(row["guest_id"]))
        )
    my_role = None
    if viewer_id is not None:
        if viewer_id == int(row["host_id"]):
            my_role = "host"
        elif row.get("guest_id") and viewer_id == int(row["guest_id"]):
            my_role = "guest"
        elif _is_spectator(str(row["id"]), viewer_id):
            my_role = "spectator"

    host_ready = bool(row.get("host_ready"))
    guest_ready = bool(row.get("guest_ready"))
    if not row.get("guest_id"):
        host_ready = False
        guest_ready = False

    game_type = resolve_game_type(row.get("game_type"), row.get("grid"))
    engine = get_engine(game_type, row.get("grid"))
    parsed_grid = engine.parse_state(row["grid"])

    win_line = None
    win_cells = None
    if row.get("status") == "finished" and row.get("win_reason") in ("connect4", "tic_tac_toe"):
        highlight = engine.find_win_highlight(parsed_grid)
        if highlight:
            if win_highlight_key(game_type) == "winLine":
                win_line = highlight
            else:
                win_cells = highlight

    return {
        "id": str(row["id"]),
        "inviteCode": row["invite_code"],
        "shareUrl": build_lobby_share_url(row["invite_code"]),
        "visibility": row["visibility"],
        "status": row["status"],
        "gameType": game_type,
        "hostChipColor": row["host_chip_color"],
        "firstMove": row.get("first_move") or "random",
        "secondsPerPlayer": row["seconds_per_player"],
        "incrementSeconds": row["increment_seconds"],
        "timeLabel": _time_label(row["seconds_per_player"], row["increment_seconds"]),
        "grid": parsed_grid,
        "currentTurnId": str(row["current_turn_id"]) if row.get("current_turn_id") else None,
        "hostClock": row["host_clock"],
        "guestClock": row["guest_clock"],
        "host": _format_public_user(host),
        "guest": _format_public_user(guest),
        "winnerId": str(row["winner_id"]) if row.get("winner_id") else None,
        "winReason": row.get("win_reason"),
        "winLine": win_line,
        "winCells": win_cells,
        "myRole": my_role,
        "hostReady": host_ready,
        "guestReady": guest_ready,
        "countdownAt": row["countdown_at"].isoformat() if row.get("countdown_at") and row.get("guest_id") else None,
        "countdownRemaining": countdown_seconds_remaining(row),
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
        "spectatorCount": 0 if skip_spectator_count else _spectator_count(str(row["id"])),
    }



def _lobby_card_status_key(row: dict[str, Any], is_mine: bool) -> str:
    status = row["status"]
    has_guest = bool(row.get("guest_id"))
    if is_mine:
        if status == "playing":
            return "mine_playing"
        return "mine_waiting"
    if status == "playing":
        return "in_game"
    if has_guest:
        return "pregame"
    return "waiting_player"



def _format_lobby_card_from_context(
    row: dict[str, Any],
    viewer_id: int | None,
    *,
    host: dict[str, Any] | None,
    guest: dict[str, Any] | None,
    spectator_count: int,
    is_spectating: bool,
) -> dict[str, Any]:
    host_name = host["display_name"] if host else "Гравець"
    host_username = host.get("username") if host else None
    guest_name = guest["display_name"] if guest else None
    guest_username = guest.get("username") if guest else None
    is_mine = viewer_id is not None and int(row["host_id"]) == viewer_id
    lobby_id = str(row["id"])
    has_guest = bool(row.get("guest_id"))
    can_join = (
        viewer_id is not None
        and not is_mine
        and row["status"] == "waiting"
        and not has_guest
    )
    game_type = resolve_game_type(row.get("game_type"), row.get("grid"))
    title = host_name
    if has_guest:
        title = f"{host_name} vs {guest_name or 'Гравець'}"
    return {
        "id": lobby_id,
        "inviteCode": row["invite_code"],
        "title": title,
        "gameType": game_type,
        "hostName": host_name,
        "hostUsername": host_username,
        "hostPhotoUrl": public_avatar_url(int(row["host_id"])),
        "guestName": guest_name,
        "guestUsername": guest_username,
        "guestPhotoUrl": public_avatar_url(int(row["guest_id"])) if row.get("guest_id") else None,
        "timeLabel": _time_label(row["seconds_per_player"], row["increment_seconds"]),
        "visibility": row["visibility"],
        "isMine": is_mine,
        "status": row["status"],
        "hasGuest": has_guest,
        "statusKey": _lobby_card_status_key(row, is_mine),
        "spectatorCount": spectator_count,
        "isSpectating": is_spectating,
        "canJoinAsGuest": can_join,
    }



def format_lobby_cards(
    rows: list[dict[str, Any]], viewer_id: int | None = None
) -> list[dict[str, Any]]:
    if not rows:
        return []

    lobby_ids = [str(row["id"]) for row in rows]
    user_ids = [int(row["host_id"]) for row in rows]
    user_ids.extend(int(row["guest_id"]) for row in rows if row.get("guest_id"))
    users = get_users_by_telegram_ids(user_ids)
    spec_counts = _batch_spectator_counts(lobby_ids)
    spectating = _batch_viewer_spectating(lobby_ids, viewer_id) if viewer_id else set()

    return [
        _format_lobby_card_from_context(
            row,
            viewer_id,
            host=users.get(int(row["host_id"])),
            guest=users.get(int(row["guest_id"])) if row.get("guest_id") else None,
            spectator_count=spec_counts.get(str(row["id"]), 0),
            is_spectating=str(row["id"]) in spectating,
        )
        for row in rows
    ]



def format_lobby_card(row: dict[str, Any], viewer_id: int | None = None) -> dict[str, Any]:
    cards = format_lobby_cards([row], viewer_id=viewer_id)
    return cards[0] if cards else {}
