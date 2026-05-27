import { game } from "./state.js";
import { formatClock } from "../utils/format.js";
import { syncLobby } from "../api/client.js";
import { notifyLobbyState } from "../api/ws.js";
import { t } from "../i18n/index.js";

var ALLOWED_BASE_SECONDS = [15, 30, 60, 120, 180];

export function resetClocksFromSettings(settings) {
  var baseSec =
    settings && settings.secondsPerPlayer != null
      ? parseInt(String(settings.secondsPerPlayer), 10)
      : 60;
  if (Number.isNaN(baseSec) || ALLOWED_BASE_SECONDS.indexOf(baseSec) === -1) baseSec = 60;
  var inc =
    settings && settings.incrementSeconds != null
      ? parseInt(String(settings.incrementSeconds), 10)
      : 1;
  if (Number.isNaN(inc) || inc < 0) inc = 0;
  game.clockYellowSec = baseSec;
  game.clockRedSec = baseSec;
  game.incSec = inc;
  game.baseSec = baseSec;
}

export function stopGameClock() {
  if (game.clockTimerId != null) {
    window.clearInterval(game.clockTimerId);
    game.clockTimerId = null;
  }
}

export function updateClockDisplay() {
  var yVal = document.getElementById("gameClockYellowValue");
  var rVal = document.getElementById("gameClockRedValue");
  var yPanel = document.getElementById("gameClockYellowPanel");
  var rPanel = document.getElementById("gameClockRedPanel");
  if (yVal) yVal.textContent = formatClock(game.clockYellowSec);
  if (rVal) rVal.textContent = formatClock(game.clockRedSec);
  if (yPanel && rPanel) {
    yPanel.classList.toggle(
      "is-active",
      game.matchActive && !game.matchFinished && game.currentPlayer === "y"
    );
    rPanel.classList.toggle(
      "is-active",
      game.matchActive && !game.matchFinished && game.currentPlayer === "r"
    );
  }
}

export function isHumanTurn() {
  if (game.myRole === "spectator") return false;
  return game.currentPlayer === "y";
}

/**
 * Оновлює годинники з лобі; опційно показує анімацію інкременту після свого ходу.
 * @param {object} lobby
 * @param {{ detectMoveBonus?: boolean }} [opts]
 */
export function applyClocksFromLobby(lobby, opts) {
  opts = opts || {};
  var prevMyClock = game.clockYellowSec;

  if (lobby.myRole === "spectator") {
    game.clockYellowSec = lobby.hostClock;
    game.clockRedSec = lobby.guestClock;
  } else if (lobby.myRole === "host") {
    game.clockYellowSec = lobby.hostClock;
    game.clockRedSec = lobby.guestClock;
  } else if (lobby.myRole === "guest") {
    game.clockYellowSec = lobby.guestClock;
    game.clockRedSec = lobby.hostClock;
  }

  if (
    opts.detectMoveBonus &&
    game.myRole !== "spectator" &&
    game.matchActive &&
    !game.matchFinished &&
    game.incSec > 0 &&
    game.clockYellowSec >= prevMyClock + game.incSec
  ) {
    triggerBonusAnim("yellow");
  }
}

function requestServerClockSync() {
  if (!game.lobbyId || game.matchFinished) return;
  syncLobby(game.lobbyId)
    .then(function (lobby) {
      if (lobby) notifyLobbyState(lobby);
    })
    .catch(function () {});
}

function tickGameClock() {
  if (!game.matchActive || game.matchFinished) return;
  if (game.currentPlayer === "y") {
    game.clockYellowSec = Math.max(0, game.clockYellowSec - 1);
    if (game.clockYellowSec <= 0) {
      requestServerClockSync();
      return;
    }
  } else {
    game.clockRedSec = Math.max(0, game.clockRedSec - 1);
    if (game.clockRedSec <= 0) {
      requestServerClockSync();
      return;
    }
  }
  updateClockDisplay();
}

export function startGameClock() {
  stopGameClock();
  game.clockTimerId = window.setInterval(tickGameClock, 1000);
}

function triggerBonusAnim(side) {
  if (game.incSec <= 0) return;
  var id = side === "yellow" ? "gameClockYellowBonus" : "gameClockRedBonus";
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = t("game.bonusSec", { n: game.incSec });
  el.classList.remove("is-pulsing");
  void el.offsetWidth;
  el.classList.add("is-pulsing");
  function onEnd() {
    el.removeEventListener("animationend", onEnd);
    el.classList.remove("is-pulsing");
    el.textContent = "";
  }
  el.addEventListener("animationend", onEnd);
}
