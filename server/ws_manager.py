from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

from server.db import get_user_by_telegram_id
from server.lobby.pregame import countdown_seconds_remaining
from server.lobby_store import (
    apply_lobby_move,
    forfeit_lobby,
    format_lobby,
    format_lobby_cards,
    get_lobby_by_id,
    list_open_lobbies,
    process_pregame_lobby,
    set_lobby_ready,
)

logger = logging.getLogger(__name__)

_USER_CACHE_MAX = 512
_FEED_DEBOUNCE_SEC = 0.15


class LobbyConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, dict[int, WebSocket]] = {}
        self._feed: dict[int, WebSocket] = {}
        self._online: set[int] = set()
        self._lock = asyncio.Lock()
        self._countdown_tasks: dict[str, asyncio.Task[None]] = {}
        self._user_cache: dict[int, dict[str, Any]] = {}
        self._feed_pending = False
        self._feed_task: asyncio.Task[None] | None = None

    def _cached_user(self, user_id: int) -> dict[str, Any] | None:
        cached = self._user_cache.get(user_id)
        if cached is not None:
            return cached
        row = get_user_by_telegram_id(user_id)
        if row:
            if len(self._user_cache) >= _USER_CACHE_MAX:
                self._user_cache.pop(next(iter(self._user_cache)))
            self._user_cache[user_id] = row
        return row

    @staticmethod
    def _build_feed_cards(viewer_id: int) -> list[dict[str, Any]]:
        rows = list_open_lobbies()
        return format_lobby_cards(rows, viewer_id=viewer_id)

    @property
    def online_count(self) -> int:
        return len(self._online)

    async def connect(self, lobby_id: str, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._online.add(user_id)
            self._rooms.setdefault(lobby_id, {})[user_id] = websocket

    async def disconnect(self, lobby_id: str, user_id: int) -> None:
        async with self._lock:
            room = self._rooms.get(lobby_id)
            if not room:
                return
            room.pop(user_id, None)
            if not room:
                self._rooms.pop(lobby_id, None)
            if not self._user_has_connection(user_id):
                self._online.discard(user_id)

    def _user_has_connection(self, user_id: int) -> bool:
        if user_id in self._feed:
            return True
        for room in self._rooms.values():
            if user_id in room:
                return True
        return False

    async def connect_feed(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._online.add(user_id)
            self._feed[user_id] = websocket
        await self._send_feed_snapshot(user_id, websocket)

    async def disconnect_feed(self, user_id: int) -> None:
        async with self._lock:
            self._feed.pop(user_id, None)
            if not self._user_has_connection(user_id):
                self._online.discard(user_id)

    async def _send_feed_snapshot(self, user_id: int, ws: WebSocket) -> None:
        try:
            cards = await asyncio.to_thread(self._build_feed_cards, user_id)
            await ws.send_json({"type": "lobbies", "lobbies": cards})
        except Exception as exc:
            logger.warning("Lobby feed snapshot failed for %s: %s", user_id, exc)

    async def broadcast_lobby_feed(self) -> None:
        self._feed_pending = True
        if self._feed_task is None or self._feed_task.done():
            self._feed_task = asyncio.create_task(self._flush_feed_broadcast())

    async def _flush_feed_broadcast(self) -> None:
        try:
            while True:
                self._feed_pending = False
                await asyncio.sleep(_FEED_DEBOUNCE_SEC)
                if self._feed_pending:
                    continue
                break

            async with self._lock:
                subscribers = list(self._feed.items())
            if not subscribers:
                return

            async def _notify(user_id: int, ws: WebSocket) -> None:
                try:
                    cards = await asyncio.to_thread(self._build_feed_cards, user_id)
                    await ws.send_json({"type": "lobbies", "lobbies": cards})
                except Exception as exc:
                    logger.warning("Lobby feed send failed for %s: %s", user_id, exc)

            await asyncio.gather(
                *(_notify(uid, ws) for uid, ws in subscribers),
                return_exceptions=True,
            )
        except Exception as exc:
            logger.warning("Lobby feed broadcast failed: %s", exc)

    def _should_notify_lobby_list(
        self,
        lobby: dict[str, Any],
        prev_status: str | None,
        prev_guest_id: Any,
    ) -> bool:
        if lobby.get("visibility") != "open":
            return False
        status = lobby.get("status")
        if status in ("finished", "cancelled"):
            return True
        if prev_status == "waiting" and status == "playing":
            return True
        if status == "waiting" and not prev_guest_id and lobby.get("guest_id"):
            return True
        if status == "waiting" and prev_guest_id and not lobby.get("guest_id"):
            return True
        return False

    def _cancel_countdown_task(self, lobby_id: str) -> None:
        task = self._countdown_tasks.pop(lobby_id, None)
        if task and not task.done():
            task.cancel()

    async def _complete_countdown_later(self, lobby_id: str, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
            lobby = process_pregame_lobby(lobby_id)
            if lobby:
                await self.broadcast_lobby(lobby_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Countdown completion failed for %s: %s", lobby_id, exc)
        finally:
            self._countdown_tasks.pop(lobby_id, None)

    def _schedule_countdown_completion(self, lobby_id: str, lobby: dict[str, Any]) -> None:
        if lobby.get("status") != "waiting" or not lobby.get("countdown_at"):
            self._cancel_countdown_task(lobby_id)
            return
        remaining = countdown_seconds_remaining(lobby)
        if remaining is None:
            self._cancel_countdown_task(lobby_id)
            return
        if remaining <= 0:
            return
        if lobby_id in self._countdown_tasks:
            return
        self._countdown_tasks[lobby_id] = asyncio.create_task(
            self._complete_countdown_later(lobby_id, remaining + 0.05)
        )

    async def broadcast_lobby(
        self, lobby_id: str, lobby: dict[str, Any] | None = None, *, move_update: bool = False
    ) -> None:
        if lobby is None:
            lobby = get_lobby_by_id(lobby_id)
        if not lobby:
            return
        lobby_id = str(lobby["id"])
        prev_status = lobby.get("status")
        prev_guest_id = lobby.get("guest_id")
        if lobby.get("status") == "waiting":
            refreshed = process_pregame_lobby(lobby_id)
            if refreshed:
                lobby = refreshed
        if lobby.get("status") != "waiting" or not lobby.get("countdown_at"):
            self._cancel_countdown_task(lobby_id)
        else:
            self._schedule_countdown_completion(lobby_id, lobby)
        list_notify = self._should_notify_lobby_list(lobby, prev_status, prev_guest_id)

        host_row = self._cached_user(int(lobby["host_id"]))
        guest_row = (
            self._cached_user(int(lobby["guest_id"]))
            if lobby.get("guest_id")
            else None
        )

        room = self._rooms.get(lobby_id, {})
        if room:

            async def _send_state(user_id: int, ws: WebSocket) -> None:
                payload = {
                    "type": "state",
                    "lobby": format_lobby(
                        lobby,
                        viewer_id=user_id,
                        host_row=host_row,
                        guest_row=guest_row,
                        skip_spectator_count=move_update,
                    ),
                }
                try:
                    await ws.send_json(payload)
                except Exception as exc:
                    logger.warning("WS send failed for %s: %s", user_id, exc)

            await asyncio.gather(*(_send_state(uid, ws) for uid, ws in room.items()))

        if list_notify:
            asyncio.create_task(self.broadcast_lobby_feed())

    async def handle_message(
        self, lobby_id: str, user_id: int, data: dict[str, Any]
    ) -> None:
        msg_type = data.get("type")
        lobby = get_lobby_by_id(lobby_id)
        if not lobby:
            return
        host_id = int(lobby["host_id"])
        guest_id = int(lobby["guest_id"]) if lobby.get("guest_id") else None
        is_player = user_id in (host_id, guest_id) if guest_id else user_id == host_id

        if msg_type in ("move", "ready", "forfeit") and not is_player:
            room = self._rooms.get(lobby_id, {})
            ws = room.get(user_id)
            if ws:
                await ws.send_json({"type": "error", "message": "Spectators cannot perform this action"})
            return

        if msg_type == "move":
            move: dict[str, Any] = {}
            if data.get("cell") is not None:
                move["cell"] = int(data["cell"])
            elif data.get("column") is not None:
                move["column"] = int(data["column"])
            else:
                return
            try:
                updated = apply_lobby_move(lobby_id, user_id, move)
            except ValueError as exc:
                room = self._rooms.get(lobby_id, {})
                ws = room.get(user_id)
                if ws:
                    await ws.send_json({"type": "error", "message": str(exc)})
                return
            await self.broadcast_lobby(lobby_id, lobby=updated, move_update=True)
            return

        if msg_type == "ready":
            ready = data.get("ready", True)
            try:
                set_lobby_ready(lobby_id, user_id, bool(ready))
            except ValueError as exc:
                room = self._rooms.get(lobby_id, {})
                ws = room.get(user_id)
                if ws:
                    await ws.send_json({"type": "error", "message": str(exc)})
                return
            await self.broadcast_lobby(lobby_id)
            await self.broadcast_lobby_feed()
            return

        if msg_type == "forfeit":
            try:
                forfeit_lobby(lobby_id, user_id)
            except ValueError as exc:
                room = self._rooms.get(lobby_id, {})
                ws = room.get(user_id)
                if ws:
                    await ws.send_json({"type": "error", "message": str(exc)})
                return
            await self.broadcast_lobby(lobby_id)
            return

        if msg_type == "ping":
            room = self._rooms.get(lobby_id, {})
            ws = room.get(user_id)
            if ws:
                await ws.send_json({"type": "pong"})


ws_manager = LobbyConnectionManager()
