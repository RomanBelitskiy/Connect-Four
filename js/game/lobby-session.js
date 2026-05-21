import { switchTab } from "../app/nav.js";
import { createLobby, fetchLobbyByCode, forfeitLobby, joinLobby, fetchCurrentUser, fetchLobby, syncLobby, fetchActiveLobby } from "../api/client.js";
import {
  connectLobbySocket,
  disconnectLobbySocket,
  sendForfeit,
  setLobbyStateHandler,
  setLobbyReconnectHandler,
  getCurrentLobbyId,
} from "../api/ws.js";
import { currentUser, refreshAllData, setProfileFromUser } from "../app/shell.js";
import { applyServerLobby, enterWaitingLobby, resetLocalMatch } from "./match-board.js";

/** @type {object|null} */
var activeLobby = null;

export function getActiveLobby() {
  return activeLobby;
}

export function getShareUrl() {
  return activeLobby && activeLobby.shareUrl ? activeLobby.shareUrl : window.location.href;
}

function rememberLobby(lobby) {
  activeLobby = lobby;
}

export function handleServerLobby(lobby) {
  if (!lobby) return;

  if (lobby.status === "cancelled") {
    disconnectLobbySocket();
    activeLobby = null;
    resetLocalMatch();
    switchTab("lobby");
    refreshLobbies();
    return;
  }

  var prev = activeLobby;
  var promotedToHost =
    !!(
      prev &&
      String(prev.id) === String(lobby.id) &&
      prev.myRole === "guest" &&
      lobby.myRole === "host" &&
      lobby.status === "waiting"
    );

  rememberLobby(lobby);
  applyServerLobby(lobby, { promotedToHost: promotedToHost });
  if (lobby.status === "playing" || lobby.status === "waiting") {
    switchTab("game");
  }
  if (lobby.status === "finished") {
    refreshAllData();
    if (currentUser) {
      fetchCurrentUser(currentUser.telegramId).then(function (user) {
        if (user) setProfileFromUser(user);
      });
    }
  }
}

export async function reopenOwnLobby(lobbyId) {
  if (
    activeLobby &&
    String(activeLobby.id) === String(lobbyId) &&
    (activeLobby.status === "waiting" || activeLobby.status === "playing")
  ) {
    switchTab("game");
    return activeLobby;
  }

  var lobby = await fetchLobby(lobbyId);
  if (lobby.status !== "waiting") {
    throw new Error("Кімната вже не доступна");
  }
  rememberLobby(lobby);
  connectLobbySocket(lobby.id);
  enterWaitingLobby(lobby);
  switchTab("game");
  return lobby;
}

export async function startLobbyFromSettings(settings, replaceExisting) {
  disconnectLobbySocket();
  activeLobby = null;
  var lobby = await createLobby(settings, replaceExisting);
  rememberLobby(lobby);
  connectLobbySocket(lobby.id);
  enterWaitingLobby(lobby);
  switchTab("game");
  return lobby;
}

export async function joinLobbyById(lobbyId, options) {
  options = options || {};
  if (
    activeLobby &&
    String(activeLobby.id) === String(lobbyId) &&
    (activeLobby.status === "waiting" || activeLobby.status === "playing")
  ) {
    switchTab("game");
    return activeLobby;
  }

  if (!options.skipActiveCheck && !options.replaceExisting) {
    var existing = await fetchActiveLobby();
    if (existing && String(existing.id) !== String(lobbyId)) {
      throw new Error("active_lobby_exists");
    }
  }

  disconnectLobbySocket();
  if (options.replaceExisting) {
    activeLobby = null;
    resetLocalMatch();
  }

  var lobby = await joinLobby(lobbyId, !!options.replaceExisting);
  rememberLobby(lobby);
  if (getCurrentLobbyId() !== lobby.id) {
    connectLobbySocket(lobby.id);
  }
  applyServerLobby(lobby);
  switchTab("game");
  return lobby;
}

export async function joinLobbyByInviteCode(code) {
  var info = await fetchLobbyByCode(code);
  if (info.status !== "waiting") {
    throw new Error("Кімната вже зайнята або завершена");
  }
  if (currentUser && String(info.host && info.host.telegramId) === String(currentUser.telegramId)) {
    connectLobbySocket(info.id);
    enterWaitingLobby(info);
    switchTab("game");
    return info;
  }
  return joinLobbyById(info.id);
}

export async function leaveActiveLobby(lobbyId) {
  var targetId = lobbyId || (activeLobby && activeLobby.id);
  if (!targetId) {
    var remote = await fetchActiveLobby();
    if (remote) targetId = remote.id;
  }
  if (!targetId) return;

  try {
    if (activeLobby && activeLobby.status === "playing" && String(activeLobby.id) === String(targetId)) {
      sendForfeit();
    }
    await forfeitLobby(targetId);
  } catch (_e) {
    /* best effort */
  }
  disconnectLobbySocket();
  activeLobby = null;
  resetLocalMatch();
}

export async function resumeActiveLobbyIfAny() {
  var lobby = await fetchActiveLobby();
  if (!lobby) return null;
  if (lobby.status !== "waiting" && lobby.status !== "playing") return null;

  if (
    activeLobby &&
    String(activeLobby.id) === String(lobby.id) &&
    getCurrentLobbyId() === lobby.id
  ) {
    switchTab("game");
    return activeLobby;
  }

  rememberLobby(lobby);
  connectLobbySocket(lobby.id);
  handleServerLobby(lobby);

  try {
    var synced = await syncLobby(lobby.id);
    if (synced) handleServerLobby(synced);
  } catch (_e) {
    /* стан уже застосовано з REST */
  }

  return lobby;
}

export function initLobbySession() {
  setLobbyStateHandler(handleServerLobby);
  setLobbyReconnectHandler(function () {
    if (!activeLobby || !activeLobby.id) return;
    syncLobby(activeLobby.id)
      .then(function (lobby) {
        if (lobby) handleServerLobby(lobby);
      })
      .catch(function () {
        fetchLobby(activeLobby.id)
          .then(function (lobby) {
            if (lobby) handleServerLobby(lobby);
          })
          .catch(function () {});
      });
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    var gameEl = document.getElementById("view-game");
    if (!gameEl || !gameEl.hasAttribute("hidden")) return;
    resumeActiveLobbyIfAny().catch(function () {});
  });
}

export function parseJoinCodeFromUrl() {
  var params = new URLSearchParams(window.location.search);
  var fromQuery = params.get("join");
  if (fromQuery) return fromQuery;

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
    return String(tg.initDataUnsafe.start_param);
  }

  return null;
}

export function clearJoinParamFromUrl() {
  if (!window.history || !window.history.replaceState) return;
  var url = new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState({}, "", url.pathname + url.search);
}
