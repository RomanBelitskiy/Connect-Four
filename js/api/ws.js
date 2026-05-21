import { telegramInitData } from "./client.js";

/** @type {WebSocket|null} */
var socket = null;
/** @type {((lobby: object) => void)|null} */
var onState = null;
/** @type {(() => void)|null} */
var onReconnect = null;
/** @type {string|null} */
var currentLobbyId = null;
var intentionalDisconnect = false;
var reconnectTimer = null;
var reconnectAttempt = 0;

function wsUrl(lobbyId) {
  var proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return (
    proto +
    "//" +
    window.location.host +
    "/api/ws/lobby/" +
    encodeURIComponent(lobbyId) +
    "?initData=" +
    encodeURIComponent(telegramInitData)
  );
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(lobbyId) {
  if (intentionalDisconnect || currentLobbyId !== lobbyId) return;
  if (reconnectAttempt >= 12) return;

  clearReconnectTimer();
  var delay = Math.min(1000 * Math.pow(1.5, reconnectAttempt), 8000);
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(function () {
    if (intentionalDisconnect || currentLobbyId !== lobbyId) return;
    openSocket(lobbyId);
  }, delay);
}

function openSocket(lobbyId) {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(wsUrl(lobbyId));

  socket.addEventListener("open", function () {
    reconnectAttempt = 0;
    if (typeof onReconnect === "function") {
      onReconnect();
    }
  });

  socket.addEventListener("message", function (ev) {
    try {
      var data = JSON.parse(ev.data);
      if (data.type === "state" && data.lobby && onState) {
        onState(data.lobby);
      }
    } catch (_e) {
      /* ignore */
    }
  });

  socket.addEventListener("close", function () {
    if (currentLobbyId === lobbyId) {
      socket = null;
      if (!intentionalDisconnect) {
        scheduleReconnect(lobbyId);
      }
    }
  });
}

export function setLobbyStateHandler(handler) {
  onState = typeof handler === "function" ? handler : null;
}

export function setLobbyReconnectHandler(handler) {
  onReconnect = typeof handler === "function" ? handler : null;
}

export function notifyLobbyState(lobby) {
  if (onState && lobby) onState(lobby);
}

export function connectLobbySocket(lobbyId) {
  intentionalDisconnect = false;
  reconnectAttempt = 0;
  clearReconnectTimer();
  currentLobbyId = lobbyId;
  openSocket(lobbyId);
}

export function disconnectLobbySocket() {
  intentionalDisconnect = true;
  clearReconnectTimer();
  currentLobbyId = null;
  reconnectAttempt = 0;
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function isLobbySocketOpen() {
  return !!(socket && socket.readyState === WebSocket.OPEN);
}

export function sendMove(column) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type: "move", column: column }));
  return true;
}

export function sendForfeit() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type: "forfeit" }));
  return true;
}

export function getCurrentLobbyId() {
  return currentLobbyId;
}
