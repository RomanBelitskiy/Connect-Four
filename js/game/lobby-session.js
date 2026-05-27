import { ensureGameTab, ensureLobbyTab } from "../app/nav.js";
import { rememberGameTabForLobby } from "../app/game-tab-hint.js";
import { runWithAppLoading } from "../app/boot-gate.js";
import {
  createLobby,
  fetchLobbyByCode,
  forfeitLobby,
  joinLobby,
  fetchCurrentUser,
  fetchLobby,
  syncLobby,
  fetchActiveLobby,
  fetchSpectatingLobby,
  spectateLobby,
  leaveSpectatorLobby,
} from "../api/client.js";
import {
  connectLobbySocket,
  disconnectLobbySocket,
  setLobbyStateHandler,
  setLobbyReconnectHandler,
  getCurrentLobbyId,
} from "../api/ws.js";
import { currentUser, refreshAllData, refreshLobbies, setProfileFromUser } from "../app/shell.js";
import { confirmReplaceLobby } from "../ui/replace-lobby-modal.js";
import {
  applyServerLobby,
  applyServerLobbyPlaying,
  enterWaitingLobby,
  resetLocalMatch,
} from "./match-board.js";
import { isPregameLobbyDelta, updatePregameLobby, stopPregameUi } from "./pregame-lobby.js";
import { resetPregameLobbySnapshot } from "./pregame-snapshot.js";
import { game } from "./state.js";
import { isStalePlayingLobby } from "./move-guard.js";

/** @type {object|null} */
var activeLobby = null;
var seatExitInFlight = false;

export function setSeatExitInFlight(value) {
  seatExitInFlight = !!value;
}

export function getActiveLobby() {
  return activeLobby;
}

export function getShareUrl() {
  return activeLobby && activeLobby.shareUrl ? activeLobby.shareUrl : window.location.href;
}

function goToGameTab(lobby) {
  rememberGameTabForLobby(lobby || activeLobby);
  ensureGameTab();
}

function rememberLobby(lobby) {
  activeLobby = lobby;
}

function isGuestRemovedFromSeat(prev, lobby) {
  if (!prev || !lobby) return false;
  if (String(prev.id) !== String(lobby.id)) return false;
  if (prev.myRole !== "guest" || lobby.status !== "waiting") return false;
  return !lobby.guest;
}

function wasEjectedFromLobby(prev, lobby) {
  if (!prev || !lobby) return false;
  if (seatExitInFlight) return false;
  if (String(prev.id) !== String(lobby.id)) return false;
  if (prev.myRole === "spectator") return false;
  if (isGuestRemovedFromSeat(prev, lobby)) return false;
  if (!prev.myRole || lobby.myRole) return false;
  /* Тимчасовий myRole=null у активній кімнаті (leave/kick) — не список лобі. */
  if (lobby.status === "waiting" || lobby.status === "playing") return false;
  return true;
}

function wasDemotedToSpectator(prev, lobby) {
  return isGuestRemovedFromSeat(prev, lobby);
}

/**
 * Запізнілий WS після kick/leave (не навмисний Join).
 * Join йде через joinLobbyById → applyServerLobby, без цього фільтра.
 */
function shouldIgnoreStaleLobbyUpdate(prev, lobby) {
  if (!prev || !lobby) return false;
  if (String(prev.id) !== String(lobby.id)) return false;
  if (prev.myRole !== "spectator" || lobby.myRole !== "guest") return false;
  if (!currentUser || !lobby.guest) return false;
  return String(lobby.guest.telegramId) === String(currentUser.telegramId);
}

export function handleServerLobby(lobby) {
  if (!lobby) return;

  if (lobby.status === "playing") {
    stopPregameUi();
  }

  var prev = activeLobby;
  if (shouldIgnoreStaleLobbyUpdate(prev, lobby)) {
    if (prev && prev.myRole === "spectator" && lobby.id) {
      syncLobby(lobby.id)
        .then(function (synced) {
          if (synced) handleServerLobby(synced);
        })
        .catch(function () {});
    }
    return;
  }
  if (wasDemotedToSpectator(prev, lobby) || isGuestRemovedFromSeat(prev, lobby)) {
    resetPregameLobbySnapshot();
    rememberLobby(lobby);
    if (lobby.myRole === "spectator") {
      applyServerLobby(lobby);
      goToGameTab(lobby);
      return;
    }
    spectateLobby(lobby.id)
      .then(function (synced) {
        if (synced) handleServerLobby(synced);
      })
      .catch(function () {
        syncLobby(lobby.id)
          .then(function (synced) {
            if (synced) handleServerLobby(synced);
          })
          .catch(function () {
            applyServerLobby(lobby);
            goToGameTab(lobby);
          });
      });
    return;
  }

  if (wasEjectedFromLobby(prev, lobby)) {
    disconnectLobbySocket();
    activeLobby = null;
    resetLocalMatch();
    ensureLobbyTab();
    refreshAllData();
    return;
  }

  if (lobby.status === "cancelled") {
    disconnectLobbySocket();
    activeLobby = null;
    resetLocalMatch();
    ensureLobbyTab();
    refreshAllData();
    return;
  }

  var promotedToHost =
    !!(
      prev &&
      String(prev.id) === String(lobby.id) &&
      prev.myRole === "guest" &&
      lobby.myRole === "host" &&
      lobby.status === "waiting"
    );

  if (
    prev &&
    String(prev.id) === String(lobby.id) &&
    prev.status === "playing" &&
    lobby.status === "waiting"
  ) {
    return;
  }

  if (
    lobby.status === "playing" &&
    prev &&
    String(prev.id) === String(lobby.id) &&
    isStalePlayingLobby(lobby)
  ) {
    return;
  }

  if (
    lobby.status === "waiting" &&
    prev &&
    String(prev.id) === String(lobby.id) &&
    isPregameLobbyDelta(prev, lobby)
  ) {
    rememberLobby(lobby);
    updatePregameLobby(lobby);
    goToGameTab(lobby);
    return;
  }

  if (
    lobby.status === "playing" &&
    prev &&
    String(prev.id) === String(lobby.id) &&
    prev.status === "playing"
  ) {
    rememberLobby(lobby);
    applyServerLobbyPlaying(lobby);
    goToGameTab(lobby);
    return;
  }

  if (
    prev &&
    String(prev.id) === String(lobby.id) &&
    prev.status === "playing" &&
    lobby.status === "finished"
  ) {
    rememberLobby(lobby);
    applyServerLobby(lobby);
    goToGameTab(lobby);
    refreshAllData();
    if (currentUser) {
      fetchCurrentUser(currentUser.telegramId).then(function (user) {
        if (user) setProfileFromUser(user);
      });
    }
    return;
  }

  rememberLobby(lobby);
  applyServerLobby(lobby, { promotedToHost: promotedToHost });
  if (lobby.status === "playing" || lobby.status === "waiting") {
    goToGameTab(lobby);
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
    goToGameTab(activeLobby);
    return activeLobby;
  }

  return runWithAppLoading(async function () {
    var lobby = await fetchLobby(lobbyId);
    if (lobby.status !== "waiting" && lobby.status !== "playing") {
      throw new Error("Lobby is not available");
    }
    rememberLobby(lobby);
    connectLobbySocket(lobby.id);
    goToGameTab(lobby);
    if (lobby.status === "waiting") {
      enterWaitingLobby(lobby);
    } else {
      applyServerLobby(lobby);
    }
    return lobby;
  }, { waitForReady: true });
}

export async function startLobbyFromSettings(settings, replaceExisting) {
  return runWithAppLoading(async function () {
    disconnectLobbySocket();
    activeLobby = null;
    var lobby = await createLobby(settings, replaceExisting);
    rememberLobby(lobby);
    connectLobbySocket(lobby.id);
    goToGameTab(lobby);
    enterWaitingLobby(lobby);
    return lobby;
  }, { waitForReady: true });
}

export async function spectateLobbyById(lobbyId, options) {
  options = options || {};
  if (
    activeLobby &&
    String(activeLobby.id) === String(lobbyId) &&
    activeLobby.myRole === "spectator" &&
    (activeLobby.status === "waiting" || activeLobby.status === "playing")
  ) {
    goToGameTab(activeLobby);
    return activeLobby;
  }

  if (!options.skipActiveCheck && !options.replaceExisting) {
    var existing = await fetchActiveLobby();
    if (existing && String(existing.id) !== String(lobbyId)) {
      throw new Error("active_lobby_exists");
    }
  }

  return runWithAppLoading(async function () {
    disconnectLobbySocket();
    if (options.replaceExisting) {
      activeLobby = null;
      resetLocalMatch();
    }

    var lobby = await spectateLobby(lobbyId);
    rememberLobby(lobby);
    connectLobbySocket(lobby.id);
    goToGameTab(lobby);
    applyServerLobby(lobby);
    return lobby;
  }, { waitForReady: true });
}

export async function joinLobbyById(lobbyId, options) {
  options = options || {};
  if (
    activeLobby &&
    String(activeLobby.id) === String(lobbyId) &&
    (activeLobby.myRole === "host" || activeLobby.myRole === "guest") &&
    (activeLobby.status === "waiting" || activeLobby.status === "playing")
  ) {
    goToGameTab(activeLobby);
    return activeLobby;
  }

  if (!options.skipActiveCheck && !options.replaceExisting) {
    var existing = await fetchActiveLobby();
    if (existing && String(existing.id) !== String(lobbyId)) {
      throw new Error("active_lobby_exists");
    }
  }

  return runWithAppLoading(async function () {
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
    goToGameTab(lobby);
    applyServerLobby(lobby);
    return lobby;
  }, { waitForReady: true });
}

export async function leaveSpectatorById(lobbyId) {
  var targetId = lobbyId || (activeLobby && activeLobby.id);
  if (!targetId) return;

  try {
    await leaveSpectatorLobby(targetId);
  } catch (_e) {
    /* best effort */
  }

  if (activeLobby && String(activeLobby.id) === String(targetId) && activeLobby.myRole === "spectator") {
    disconnectLobbySocket();
    activeLobby = null;
    resetLocalMatch();
    ensureLobbyTab();
  }
  refreshLobbies();
}

export async function joinLobbyByInviteCode(code) {
  var info = await fetchLobbyByCode(code);
  if (info.status !== "waiting" && info.status !== "playing") {
    throw new Error("Lobby is not available");
  }
  if (currentUser && String(info.host && info.host.telegramId) === String(currentUser.telegramId)) {
    connectLobbySocket(info.id);
    goToGameTab(info);
    if (info.status === "waiting") {
      enterWaitingLobby(info);
    } else {
      applyServerLobby(info);
    }
    return info;
  }

  var hasGuest = !!(info.guest && info.guest.telegramId);
  if (info.status === "waiting" && !hasGuest) {
    var existing = await fetchActiveLobby();
    if (existing && String(existing.id) !== String(info.id)) {
      var ok = await confirmReplaceLobby({ mode: "join" });
      if (!ok) return info;
      await leaveActiveLobby(existing.id);
    }
    return joinLobbyById(info.id, { skipActiveCheck: true, replaceExisting: true });
  }

  return spectateLobbyById(info.id);
}

export async function leaveActiveLobby(lobbyId) {
  var targetId = lobbyId || (activeLobby && activeLobby.id);
  if (!targetId) {
    var remote = await fetchActiveLobby();
    if (remote) targetId = remote.id;
  }
  if (!targetId) return;

  if (activeLobby && activeLobby.myRole === "spectator") {
    return leaveSpectatorById(targetId);
  }

  try {
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
  if (!lobby) {
    lobby = await fetchSpectatingLobby();
  }
  if (!lobby) return null;
  if (lobby.status !== "waiting" && lobby.status !== "playing") return null;

  if (
    activeLobby &&
    String(activeLobby.id) === String(lobby.id) &&
    getCurrentLobbyId() === lobby.id
  ) {
    goToGameTab(lobby);
    return activeLobby;
  }

  rememberLobby(lobby);
  connectLobbySocket(lobby.id);
  goToGameTab(lobby);
  handleServerLobby(lobby);

  if (lobby.myRole === "host" || lobby.myRole === "guest") {
    syncLobby(lobby.id)
      .then(function (synced) {
        if (synced) handleServerLobby(synced);
      })
      .catch(function () {});
  }

  return lobby;
}

export function initLobbySession() {
  setLobbyStateHandler(handleServerLobby);
  setLobbyReconnectHandler(function () {
    if (!activeLobby || !activeLobby.id) return;
    if (activeLobby.myRole === "spectator") {
      fetchLobby(activeLobby.id)
        .then(function (lobby) {
          if (lobby) handleServerLobby(lobby);
        })
        .catch(function () {});
      return;
    }
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
    if (!gameEl || gameEl.hasAttribute("hidden")) return;
    if (game.lobbyId && game.matchActive && !game.matchFinished) {
      fetchLobby(game.lobbyId)
        .then(function (lobby) {
          if (lobby) handleServerLobby(lobby);
        })
        .catch(function () {});
      return;
    }
    resumeActiveLobbyIfAny().catch(function () {});
  });
}

export function parseJoinCodeFromUrl() {
  var params = new URLSearchParams(window.location.search);
  var fromQuery = params.get("join");
  if (fromQuery) return normalizeJoinCode(fromQuery);

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) {
    return normalizeJoinCode(String(tg.initDataUnsafe.start_param));
  }

  return null;
}

function normalizeJoinCode(raw) {
  if (!raw) return null;
  var code = String(raw).trim();
  if (!code) return null;
  if (code.indexOf("join") === 0) {
    code = code.slice(4).replace(/^_/, "");
  }
  return code || null;
}

export { finishAppLoading as clearBootJoinState } from "../app/boot-gate.js";

export function clearJoinParamFromUrl() {
  if (!window.history || !window.history.replaceState) return;
  var url = new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState({}, "", url.pathname + url.search);
}
