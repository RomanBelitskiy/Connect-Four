import { telegramInitData } from "./client.js";

/** @type {WebSocket|null} */
var socket = null;
/** @type {(() => void)|null} */
var onChanged = null;
/** @type {((open: boolean) => void)|null} */
var onConnectionChange = null;
var intentionalDisconnect = false;
var reconnectTimer = null;
var reconnectAttempt = 0;

function wsFeedUrl() {
  var proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return (
    proto +
    "//" +
    window.location.host +
    "/api/ws/lobby-feed?initData=" +
    encodeURIComponent(telegramInitData)
  );
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (intentionalDisconnect || !telegramInitData) return;
  if (reconnectAttempt >= 12) return;

  clearReconnectTimer();
  var delay = Math.min(1000 * Math.pow(1.5, reconnectAttempt), 8000);
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(function () {
    if (intentionalDisconnect) return;
    openFeedSocket();
  }, delay);
}

function openFeedSocket() {
  if (!telegramInitData) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(wsFeedUrl());

  socket.addEventListener("open", function () {
    reconnectAttempt = 0;
    if (typeof onConnectionChange === "function") onConnectionChange(true);
    if (typeof onChanged === "function") onChanged();
  });

  socket.addEventListener("message", function (ev) {
    try {
      var data = JSON.parse(ev.data);
      if (data.type === "lobbies_changed" && typeof onChanged === "function") {
        onChanged();
      }
    } catch (_e) {
      /* ignore */
    }
  });

  socket.addEventListener("close", function () {
    socket = null;
    if (typeof onConnectionChange === "function") onConnectionChange(false);
    if (!intentionalDisconnect) {
      scheduleReconnect();
    }
  });
}

export function setLobbyFeedConnectionHandler(handler) {
  onConnectionChange = typeof handler === "function" ? handler : null;
}

export function setLobbyFeedHandler(handler) {
  onChanged = typeof handler === "function" ? handler : null;
}

export function connectLobbyFeed() {
  if (!telegramInitData) return;
  intentionalDisconnect = false;
  reconnectAttempt = 0;
  clearReconnectTimer();
  openFeedSocket();
}

export function disconnectLobbyFeed() {
  intentionalDisconnect = true;
  clearReconnectTimer();
  reconnectAttempt = 0;
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function isLobbyFeedOpen() {
  return !!(socket && socket.readyState === WebSocket.OPEN);
}
