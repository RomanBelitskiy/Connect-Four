import { syncLobby } from "../../api/client.js";
import { isLobbySocketOpen } from "../../api/ws.js";
import { prefersReducedMotion } from "../../utils/format.js";
import { game } from "../state.js";
import { bumpSyncEpoch } from "../sync-epoch.js";

var countdownTickId = /** @type {ReturnType<typeof setInterval> | null} */ (null);
var countdownSyncId = /** @type {ReturnType<typeof setInterval> | null} */ (null);
var countdownFinishSyncId = /** @type {ReturnType<typeof setInterval> | null} */ (null);
var countdownWsFallbackId = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
var lastShownCountdown = -1;

function stopCountdownTick() {
  if (countdownTickId) {
    clearInterval(countdownTickId);
    countdownTickId = null;
  }
}

function clearWsFallback() {
  if (countdownWsFallbackId) {
    clearTimeout(countdownWsFallbackId);
    countdownWsFallbackId = null;
  }
}

export function stopCountdownTimers() {
  stopCountdownTick();
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
  bumpSyncEpoch();
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
  stopCountdownTimers();
  if (!lobby.countdownAt) return;

  function tick() {
    if (game.status === "playing" && game.matchActive) {
      stopCountdownTimers();
      hideCountdown();
      return;
    }

    var started = Date.parse(lobby.countdownAt);
    if (Number.isNaN(started)) return;
    var elapsed = (Date.now() - started) / 1000;
    var left = Math.ceil(3 - elapsed);
    if (left > 3) left = 3;
    if (left <= 0) {
      stopCountdownTick();
      hideCountdown();
      if (onTick) onTick(0);
      if (isLobbySocketOpen()) {
        scheduleWsFallbackSync(lobby, onTick);
      } else {
        ensureFinishSync(lobby, onTick);
        requestPlayingSync(lobby.id, onTick);
      }
      return;
    }
    showCountdownNumber(left);
    if (onTick) onTick(left);
  }

  tick();
  var intervalMs = prefersReducedMotion() ? 280 : 120;
  countdownTickId = setInterval(tick, intervalMs);

  if (lobby.id && !isLobbySocketOpen()) {
    countdownSyncId = setInterval(function () {
      requestPlayingSync(lobby.id, onTick);
    }, 1500);
  }
}
