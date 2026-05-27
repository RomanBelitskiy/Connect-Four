import { getLastLobbySnapshot } from "../pregame-snapshot.js";

var READY_TOGGLE_COOLDOWN_MS = 1000;
var PENDING_READY_MAX_MS = 2500;
var readyToggleCooldownUntil = 0;
var readyCooldownTimerId = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
/** @type {boolean|null} */
var pendingMyReady = null;
var pendingMyReadyAt = 0;

/** @type {((lobby: object, options?: object) => void)|null} */
var refreshHandler = null;

export function setPregameRefreshHandler(fn) {
  refreshHandler = typeof fn === "function" ? fn : null;
}

function refreshFromSnapshot() {
  var snap = getLastLobbySnapshot();
  if (snap && snap.status === "waiting" && refreshHandler) {
    refreshHandler(snap, {});
  }
}

export function isReadyToggleCoolingDown() {
  return Date.now() < readyToggleCooldownUntil;
}

export function clearPendingMyReady() {
  pendingMyReady = null;
  pendingMyReadyAt = 0;
}

export function setPendingMyReady(value) {
  pendingMyReady = !!value;
  pendingMyReadyAt = Date.now();
}

function myRoleReadyFromLobby(lobby) {
  if (!lobby) return null;
  if (lobby.myRole === "host") return !!lobby.hostReady;
  if (lobby.myRole === "guest") return !!lobby.guestReady;
  return null;
}

/** Не даємо застарілому WS скинути галочку, поки сервер не підтвердив наш toggle. */
export function applyPendingReadyToLobby(lobby) {
  if (pendingMyReady === null || !lobby || lobby.status !== "waiting") return lobby;
  if (Date.now() - pendingMyReadyAt > PENDING_READY_MAX_MS) {
    clearPendingMyReady();
    return lobby;
  }
  var serverVal = myRoleReadyFromLobby(lobby);
  if (serverVal === null) return lobby;
  if (serverVal === pendingMyReady) {
    clearPendingMyReady();
    return lobby;
  }
  var out = Object.assign({}, lobby);
  if (lobby.myRole === "host") out.hostReady = pendingMyReady;
  else if (lobby.myRole === "guest") out.guestReady = pendingMyReady;
  return out;
}

export function clearReadyToggleCooldown() {
  readyToggleCooldownUntil = 0;
  if (readyCooldownTimerId) {
    clearTimeout(readyCooldownTimerId);
    readyCooldownTimerId = null;
  }
}

export function startReadyToggleCooldown() {
  readyToggleCooldownUntil = Date.now() + READY_TOGGLE_COOLDOWN_MS;
  if (readyCooldownTimerId) clearTimeout(readyCooldownTimerId);
  refreshFromSnapshot();
  readyCooldownTimerId = setTimeout(function () {
    readyCooldownTimerId = null;
    readyToggleCooldownUntil = 0;
    var lobby = getLastLobbySnapshot();
    if (lobby && lobby.status === "waiting" && refreshHandler) {
      refreshHandler(applyPendingReadyToLobby(lobby), {});
    }
  }, READY_TOGGLE_COOLDOWN_MS);
}
