from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import AliasChoices, BaseModel, Field
import asyncio
from server.lobby.helpers import normalize_first_move
from server.games.registry import normalize_game_type, resolve_game_type

from server.auth import build_display_name, parse_init_data_user, validate_init_data
from server.avatars import avatar_file_path, public_avatar_url, sync_user_avatar
from server.bot import fetch_user_chat_profile, fetch_user_photo_url, prepare_lobby_share
from server.config import settings
from server.deps import require_user
from server.db import format_user, get_user_by_telegram_id, upsert_user
from server.lobby_store import (
    ActiveLobbyExistsError,
    abandon_all_active_lobbies_for_user,
    abandon_lobby_for_replace,
    apply_lobby_move,
    create_lobby_for_host,
    format_lobby,
    format_lobby_cards,
    forfeit_lobby,
    get_active_lobby_for_user,
    get_leaderboard,
    get_lobby_by_id,
    get_lobby_by_invite_code,
    get_match_history,
    enter_lobby_spectator,
    join_lobby,
    kick_lobby_guest,
    leave_lobby_spectator,
    list_open_lobbies,
    get_spectating_lobby_for_user,
    user_can_view_lobby,
    _is_spectator,
    pause_clock_on_reconnect,
    process_pregame_lobby,
    set_lobby_ready,
    sync_playing_lobby,
)
from server.ws_manager import ws_manager

router = APIRouter()


class TelegramAuthRequest(BaseModel):
    initData: str
    force: bool = False


class CreateLobbyRequest(BaseModel):
    visibility: str = "open"
    hostChipColor: str = "yellow"
    firstMove: str = "random"
    secondsPerPlayer: int = Field(default=60, ge=15, le=180)
    incrementSeconds: int = Field(default=1, ge=0, le=5)
    gameType: str = Field(
        default="connect_four",
        validation_alias=AliasChoices("gameType", "game_type"),
    )
    replaceExisting: bool = False


class MoveRequest(BaseModel):
    column: int | None = Field(None, ge=0, le=6)
    cell: int | None = Field(None, ge=0, le=8)

    def as_move(self) -> dict:
        if self.cell is not None:
            return {"cell": self.cell}
        if self.column is not None:
            return {"column": self.column}
        raise ValueError("Move required")


class JoinLobbyRequest(BaseModel):
    replaceExisting: bool = False


class ReadyRequest(BaseModel):
    ready: bool = True


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/online")
def online_count(user=Depends(require_user)):
    return {"count": max(1, ws_manager.online_count)}


@router.post("/auth/telegram")
async def auth_telegram(body: TelegramAuthRequest):
    init_data = body.initData
    if not init_data:
        raise HTTPException(status_code=400, detail="initData is required")

    if not settings.is_bot_configured:
        raise HTTPException(status_code=503, detail="Bot token is not configured")

    if not validate_init_data(init_data, settings.bot_token):
        raise HTTPException(status_code=401, detail="Invalid Telegram initData")

    tg_user = parse_init_data_user(init_data)
    if not tg_user or not tg_user.get("id"):
        raise HTTPException(status_code=400, detail="User data not found in initData")

    telegram_id = int(tg_user["id"])
    if body.force:
        fresh = await fetch_user_chat_profile(telegram_id)
        if fresh:
            tg_user = {**tg_user, **fresh}

    photo_url = tg_user.get("photo_url")
    if not photo_url or body.force:
        photo_url = await fetch_user_photo_url(telegram_id)

    cached = await sync_user_avatar(telegram_id, force=body.force)
    if cached:
        photo_url = cached

    row = upsert_user(
        {
            "telegram_id": telegram_id,
            "username": tg_user.get("username"),
            "first_name": tg_user.get("first_name") or "",
            "last_name": tg_user.get("last_name"),
            "display_name": build_display_name(tg_user),
            "photo_url": photo_url,
        }
    )

    return {"user": format_user(row)}


@router.get("/users/me")
def users_me(user=Depends(require_user)):
    return {"user": format_user(user)}


@router.get("/lobbies")
async def api_list_lobbies(user=Depends(require_user)):
    uid = int(user["telegram_id"])
    rows = await asyncio.to_thread(list_open_lobbies)
    cards = await asyncio.to_thread(format_lobby_cards, rows, uid)
    return {"lobbies": cards}


@router.get("/lobbies/mine/active")
def api_my_active_lobby(user=Depends(require_user)):
    uid = int(user["telegram_id"])
    row = get_active_lobby_for_user(uid)
    if not row:
        return {"lobby": None}
    return {"lobby": format_lobby(row, viewer_id=uid)}


@router.get("/lobbies/mine/spectating")
def api_my_spectating_lobby(user=Depends(require_user)):
    uid = int(user["telegram_id"])
    row = get_spectating_lobby_for_user(uid)
    if not row:
        return {"lobby": None}
    return {"lobby": format_lobby(row, viewer_id=uid)}


@router.post("/lobbies")
async def api_create_lobby(body: CreateLobbyRequest, user=Depends(require_user)):
    uid = int(user["telegram_id"])
    closed_ids: list[str] = []
    if body.replaceExisting:
        closed_ids = await asyncio.to_thread(abandon_all_active_lobbies_for_user, uid)
        for old_id in closed_ids:
            await ws_manager.broadcast_lobby(old_id)
        if closed_ids:
            await ws_manager.broadcast_lobby_feed()

    try:
        row = await asyncio.to_thread(
            create_lobby_for_host,
            uid,
            body.visibility,
            body.hostChipColor,
            body.secondsPerPlayer,
            body.incrementSeconds,
            normalize_game_type(body.gameType),
            normalize_first_move(body.firstMove),
            replace_existing=body.replaceExisting,
        )
    except ActiveLobbyExistsError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "active_lobby_exists", "lobbyId": exc.lobby_id},
        ) from exc
    if row.get("visibility") == "open":
        await ws_manager.broadcast_lobby_feed()
    return {"lobby": format_lobby(row, viewer_id=uid)}


@router.get("/lobbies/join/{invite_code}")
def api_get_lobby_by_code(invite_code: str, user=Depends(require_user)):
    row = get_lobby_by_invite_code(invite_code)
    if not row:
        raise HTTPException(status_code=404, detail="Lobby not found")
    return {"lobby": format_lobby(row, viewer_id=int(user["telegram_id"]))}


@router.post("/lobbies/{lobby_id}/spectate")
async def api_spectate_lobby(lobby_id: str, user=Depends(require_user)):
    uid = int(user["telegram_id"])
    try:
        row = enter_lobby_spectator(lobby_id, uid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await ws_manager.broadcast_lobby(lobby_id)
    await ws_manager.broadcast_lobby_feed()
    return {"lobby": format_lobby(row, viewer_id=uid)}


@router.post("/lobbies/{lobby_id}/leave-spectator")
async def api_leave_spectator(lobby_id: str, user=Depends(require_user)):
    uid = int(user["telegram_id"])
    leave_lobby_spectator(lobby_id, uid)
    await ws_manager.broadcast_lobby(lobby_id)
    await ws_manager.broadcast_lobby_feed()
    return {"ok": True}


@router.post("/lobbies/{lobby_id}/join")
async def api_join_lobby(
    lobby_id: str,
    body: JoinLobbyRequest | None = None,
    user=Depends(require_user),
):
    uid = int(user["telegram_id"])
    body = body or JoinLobbyRequest()
    existing = get_active_lobby_for_user(uid)
    if existing and str(existing["id"]) != lobby_id:
        if not body.replaceExisting:
            raise HTTPException(
                status_code=409,
                detail={"code": "active_lobby_exists", "lobbyId": str(existing["id"])},
            )
        closed_ids = abandon_all_active_lobbies_for_user(uid)
        for old_id in closed_ids:
            await ws_manager.broadcast_lobby(old_id)
        if closed_ids:
            await ws_manager.broadcast_lobby_feed()
    try:
        row = join_lobby(lobby_id, uid, skip_active_check=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await ws_manager.broadcast_lobby(lobby_id)
    await ws_manager.broadcast_lobby_feed()
    return {"lobby": format_lobby(row, viewer_id=uid)}


@router.get("/lobbies/{lobby_id}")
def api_get_lobby(lobby_id: str, user=Depends(require_user)):
    row = get_lobby_by_id(lobby_id)
    if not row:
        raise HTTPException(status_code=404, detail="Lobby not found")
    uid = int(user["telegram_id"])
    if not user_can_view_lobby(row, uid):
        raise HTTPException(status_code=403, detail="Access denied")
    return {"lobby": format_lobby(row, viewer_id=uid)}


@router.post("/lobbies/{lobby_id}/prepare-share")
async def api_prepare_share(lobby_id: str, user=Depends(require_user)):
    row = get_lobby_by_id(lobby_id)
    if not row:
        raise HTTPException(status_code=404, detail="Lobby not found")
    uid = int(user["telegram_id"])
    if uid != int(row["host_id"]):
        raise HTTPException(status_code=403, detail="Only host can share")
    if row["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Lobby is not waiting")

    lobby = format_lobby(row, viewer_id=uid)
    game_type = resolve_game_type(row.get("game_type"), row.get("grid"))
    message_id = await prepare_lobby_share(uid, lobby["shareUrl"], row["invite_code"], game_type)
    if not message_id:
        raise HTTPException(status_code=503, detail="Share not available")
    return {"messageId": message_id}


@router.post("/lobbies/{lobby_id}/ready")
async def api_set_ready(lobby_id: str, body: ReadyRequest, user=Depends(require_user)):
    uid = int(user["telegram_id"])
    try:
        row = set_lobby_ready(lobby_id, uid, body.ready)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await ws_manager.broadcast_lobby(lobby_id)
    await ws_manager.broadcast_lobby_feed()
    return {"lobby": format_lobby(row, viewer_id=uid)}


@router.post("/lobbies/{lobby_id}/kick-guest")
async def api_kick_guest(lobby_id: str, user=Depends(require_user)):
    uid = int(user["telegram_id"])
    try:
        row = kick_lobby_guest(lobby_id, uid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await ws_manager.broadcast_lobby(lobby_id)
    await ws_manager.broadcast_lobby_feed()
    return {"lobby": format_lobby(row, viewer_id=uid)}


@router.post("/lobbies/{lobby_id}/move")
async def api_move(lobby_id: str, body: MoveRequest, user=Depends(require_user)):
    try:
        move = body.as_move()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        row = apply_lobby_move(lobby_id, int(user["telegram_id"]), move)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await ws_manager.broadcast_lobby(lobby_id, lobby=row, move_update=True)
    return {"lobby": format_lobby(row, viewer_id=int(user["telegram_id"]))}


@router.post("/lobbies/{lobby_id}/sync")
async def api_sync_lobby(lobby_id: str, user=Depends(require_user)):
    row = get_lobby_by_id(lobby_id)
    if not row:
        raise HTTPException(status_code=404, detail="Lobby not found")
    uid = int(user["telegram_id"])
    if uid not in (int(row["host_id"]), int(row.get("guest_id") or 0)):
        if not user_can_view_lobby(row, uid):
            raise HTTPException(status_code=403, detail="Access denied")
        row = get_lobby_by_id(lobby_id)
        return {"lobby": format_lobby(row, viewer_id=uid)}

    row = sync_playing_lobby(lobby_id, reset_tick_anchor=False)
    if row.get("status") == "waiting":
        row = process_pregame_lobby(lobby_id) or row
    fresh = get_lobby_by_id(lobby_id) or row
    await ws_manager.broadcast_lobby(lobby_id, lobby=fresh)
    return {"lobby": format_lobby(fresh, viewer_id=uid)}


@router.post("/lobbies/{lobby_id}/forfeit")
async def api_forfeit_lobby(lobby_id: str, user=Depends(require_user)):
    try:
        row = forfeit_lobby(lobby_id, int(user["telegram_id"]))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await ws_manager.broadcast_lobby(lobby_id)
    await ws_manager.broadcast_lobby_feed()
    return {"lobby": format_lobby(row, viewer_id=int(user["telegram_id"]))}


@router.get("/history")
def api_history(user=Depends(require_user)):
    return {"history": get_match_history(int(user["telegram_id"]))}


@router.get("/avatars/{telegram_id}.webp")
async def api_avatar(telegram_id: int):
    path = avatar_file_path(telegram_id)
    if not path.is_file():
        await sync_user_avatar(telegram_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(
        path,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


@router.get("/leaderboard")
def api_leaderboard(user=Depends(require_user)):
    rows = get_leaderboard()
    my_id = str(user["telegram_id"])
    for row in rows:
        # mark me if username matches — optional enhancement
        pass
    return {"leaderboard": rows, "myTelegramId": my_id}


@router.websocket("/ws/lobby/{lobby_id}")
async def websocket_lobby(websocket: WebSocket, lobby_id: str, initData: str = Query(...)):
    if not settings.is_bot_configured or not validate_init_data(initData, settings.bot_token):
        await websocket.close(code=4401)
        return

    tg_user = parse_init_data_user(initData)
    if not tg_user or not tg_user.get("id"):
        await websocket.close(code=4401)
        return

    user_id = int(tg_user["id"])
    lobby = get_lobby_by_id(lobby_id)
    if not lobby:
        await websocket.close(code=4404)
        return

    allowed = user_id in (
        int(lobby["host_id"]),
        int(lobby["guest_id"]) if lobby.get("guest_id") else -1,
    ) or _is_spectator(lobby_id, user_id)
    if not allowed:
        await websocket.close(code=4403)
        return

    await ws_manager.connect(lobby_id, user_id, websocket)
    refreshed = pause_clock_on_reconnect(lobby_id)
    if refreshed:
        lobby = refreshed
    await websocket.send_json(
        {"type": "state", "lobby": format_lobby(lobby, viewer_id=user_id)}
    )

    try:
        while True:
            data = await websocket.receive_json()
            await ws_manager.handle_message(lobby_id, user_id, data)
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(lobby_id, user_id)


@router.websocket("/ws/lobby-feed")
async def websocket_lobby_feed(websocket: WebSocket, initData: str = Query(...)):
    if not settings.is_bot_configured or not validate_init_data(initData, settings.bot_token):
        await websocket.close(code=4401)
        return

    tg_user = parse_init_data_user(initData)
    if not tg_user or not tg_user.get("id"):
        await websocket.close(code=4401)
        return

    user_id = int(tg_user["id"])
    await ws_manager.connect_feed(user_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect_feed(user_id)
