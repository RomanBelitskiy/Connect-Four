import { syncLobby } from "../../api/client.js";
import { isLobbySocketOpen } from "../../api/ws.js";
import { prefersReducedMotion } from "../../utils/format.js";
import { game } from "../state.js";
import { bumpSyncEpoch } from "../sync-epoch.js";

var countdownStepId = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
var countdownSyncId = /** @type {ReturnType<typeof setInterval> | null} */ (null);
var countdownFinishSyncId = /** @type {ReturnType<typeof setInterval> | null} */ (null);
var countdownWsFallbackId = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
var lastShownCountdown = -1;

/** @type {string|null} */
var activeCountdownAt = null;
/** @type {string|null} */
var activeLobbyId = null;
/** @type {((left: number, synced?: object) => void)|null} */
var activeOnTick = null;
/** Різниця clientElapsed − serverElapsed (с); знімає постійний зсув годинника. */
var countdownSkewSec = 0;

function stopCountdownStep() {
  if (countdownStepId) {
    clearTimeout(countdownStepId);
    countdownStepId = null;
  }
}

function clearWsFallback() {
  if (countdownWsFallbackId) {
    clearTimeout(countdownWsFallbackId);
    countdownWsFallbackId = null;
  }
}

export function stopCountdownTimers() {
  stopCountdownStep();
  clearWsFallback();
  if (countdownSyncId) {
    clearInterval(countdownSyncId);
    countdownSyncId = null;
  }
  if (countdownFinishSyncId) {
    clearInterval(countdownFinishSyncId);
    countdownFinishSyncId = null;
  }
  lastShownCountdown = -1;
  activeCountdownAt = null;
  activeLobbyId = null;
  activeOnTick = null;
  countdownSkewSec = 0;
  bumpSyncEpoch();
}

export function isCountdownActive() {
  return !!activeCountdownAt && !!activeLobbyId;
}

function syncCountdownSkewFromServer(lobby) {
  if (!lobby || !lobby.countdownAt) return;
  var rem = lobby.countdownRemaining;
  if (typeof rem !== "number" || !Number.isFinite(rem)) return;
  var started = Date.parse(lobby.countdownAt);
  if (Number.isNaN(started)) return;
  var serverElapsed = 3 - Math.max(0, Math.min(3, rem));
  var clientElapsed = (Date.now() - started) / 1000;
  countdownSkewSec = clientElapsed - serverElapsed;
}

/** Залишок секунд (float), узгоджений із сервером через countdownSkewSec. */
function getRemainingSeconds() {
  if (!activeCountdownAt) return 0;
  var started = Date.parse(activeCountdownAt);
  if (Number.isNaN(started)) return 0;
  var clientElapsed = (Date.now() - started) / 1000;
  return Math.max(0, 3 - clientElapsed + countdownSkewSec);
}

function getDisplayLeft(remaining) {
  if (remaining <= 0) return 0;
  return Math.min(3, Math.ceil(remaining));
}

function msUntilNextBoundary(remaining, displayLeft) {
  if (displayLeft <= 0) return 0;
  var nextRemaining = displayLeft - 1;
  var delay = (remaining - nextRemaining) * 1000;
  if (!Number.isFinite(delay) || delay < 0) delay = 0;
  return delay + (prefersReducedMotion() ? 40 : 8);
}

function showCountdownNumber(n) {
  var el = document.getElementById("pregameChipsCountdown");
  if (!el) return;
  if (n === lastShownCountdown) return;
  lastShownCountdown = n;
  el.textContent = String(n);
  el.removeAttribute("hidden");
}

export function hideCountdown() {
  var el = document.getElementById("pregameChipsCountdown");
  if (el) el.setAttribute("hidden", "");
}

function notifyPlaying(onTick, updated) {
  if (!updated || updated.status !== "playing" || !onTick) return false;
  stopCountdownTimers();
  hideCountdown();
  if (game.matchActive && game.status === "playing") return false;
  onTick(0, updated);
  return true;
}

function requestPlayingSync(lobbyId, onTick) {
  return syncLobby(lobbyId)
    .then(function (updated) {
      notifyPlaying(onTick, updated);
      return updated;
    })
    .catch(function () {
      return null;
    });
}

function ensureFinishSync(lobby, onTick) {
  if (!lobby.id || countdownFinishSyncId || isLobbySocketOpen()) return;
  countdownFinishSyncId = setInterval(function () {
    requestPlayingSync(lobby.id, onTick);
  }, 800);
}

function scheduleWsFallbackSync(lobby, onTick) {
  if (!lobby.id || !isLobbySocketOpen()) return;
  clearWsFallback();
  countdownWsFallbackId = window.setTimeout(function () {
    countdownWsFallbackId = null;
    if (game.status === "playing" && game.matchActive) return;
    requestPlayingSync(lobby.id, onTick);
  }, 500);
}

function handleCountdownEnd(lobby, onTick) {
  stopCountdownStep();
  hideCountdown();
  if (onTick) onTick(0);
  if (isLobbySocketOpen()) {
    scheduleWsFallbackSync(lobby, onTick);
  } else {
    ensureFinishSync(lobby, onTick);
    requestPlayingSync(lobby.id, onTick);
  }
}

function runCountdownStep() {
  if (!activeCountdownAt || !activeLobbyId) return;

  if (game.status === "playing" && game.matchActive) {
    stopCountdownTimers();
    hideCountdown();
    return;
  }

  var remaining = getRemainingSeconds();
  var left = getDisplayLeft(remaining);

  if (left <= 0) {
    handleCountdownEnd({ id: activeLobbyId }, activeOnTick);
    return;
  }

  showCountdownNumber(left);
  if (activeOnTick) activeOnTick(left);

  stopCountdownStep();
  countdownStepId = setTimeout(runCountdownStep, msUntilNextBoundary(remaining, left));
}

export function refreshCountdownOnResume() {
  if (!isCountdownActive()) return;
  runCountdownStep();
}

export function wrapCountdownHandler(onPlaying, lobby) {
  return function (left, syncedLobby) {
    if (notifyPlaying(onPlaying, syncedLobby)) return;
    if (left <= 0 && lobby.id) {
      if (isLobbySocketOpen()) {
        scheduleWsFallbackSync(lobby, onPlaying);
      } else {
        ensureFinishSync(lobby, onPlaying);
        requestPlayingSync(lobby.id, onPlaying);
      }
    }
  };
}

export function startCountdownUi(lobby, onTick) {
  if (typeof onTick !== "function") onTick = null;
  if (!lobby || !lobby.countdownAt) {
    stopCountdownTimers();
    return;
  }

  var countdownKey = String(lobby.countdownAt);
  var lobbyId = String(lobby.id || "");
  var sameRun = activeCountdownAt === countdownKey && activeLobbyId === lobbyId;

  if (sameRun) {
    activeOnTick = onTick;
    syncCountdownSkewFromServer(lobby);
    runCountdownStep();
    return;
  }

  stopCountdownTimers();
  activeCountdownAt = countdownKey;
  activeLobbyId = lobbyId;
  activeOnTick = onTick;
  syncCountdownSkewFromServer(lobby);
  lastShownCountdown = -1;

  runCountdownStep();

  if (lobby.id && !isLobbySocketOpen()) {
    countdownSyncId = setInterval(function () {
      requestPlayingSync(lobby.id, onTick);
    }, 1500);
  }
}

/** Оновити серверний anchor без перезапуску таймерів (WS state під час відліку). */
export function updateCountdownFromLobby(lobby) {
  if (!lobby || !lobby.countdownAt || !isCountdownActive()) return;
  if (String(lobby.countdownAt) !== activeCountdownAt) return;
  syncCountdownSkewFromServer(lobby);
  runCountdownStep();
}
