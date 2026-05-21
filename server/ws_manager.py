from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

from server.lobby_store import (
    apply_lobby_move,
    forfeit_lobby,
    format_lobby,
    get_lobby_by_id,
    join_lobby,
)

logger = logging.getLogger(__name__)


class LobbyConnectionManager:
    def __init__(self) -> None:
        self._rooms: dict[str, dict[int, WebSocket]] = {}
        self._online: set[int] = set()
        self._lock = asyncio.Lock()

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
            self._online.discard(user_id)
            room = self._rooms.get(lobby_id)
            if not room:
                return
            room.pop(user_id, None)
            if not room:
                self._rooms.pop(lobby_id, None)

    async def broadcast_lobby(self, lobby_id: str) -> None:
        lobby = get_lobby_by_id(lobby_id)
        if not lobby:
            return
        room = self._rooms.get(lobby_id, {})
        for user_id, ws in list(room.items()):
            payload = {
                "type": "state",
                "lobby": format_lobby(lobby, viewer_id=user_id),
            }
            try:
                await ws.send_json(payload)
            except Exception as exc:
                logger.warning("WS send failed for %s: %s", user_id, exc)

    async def handle_message(
        self, lobby_id: str, user_id: int, data: dict[str, Any]
    ) -> None:
        msg_type = data.get("type")

        if msg_type == "move":
            column = data.get("column")
            if column is None:
                return
            try:
                apply_lobby_move(lobby_id, user_id, int(column))
            except ValueError as exc:
                room = self._rooms.get(lobby_id, {})
                ws = room.get(user_id)
                if ws:
                    await ws.send_json({"type": "error", "message": str(exc)})
                return
            await self.broadcast_lobby(lobby_id)
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
