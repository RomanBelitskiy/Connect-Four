/**
 * Pre-game lobby UI — thin entry point.
 * Implementation split under ./pregame/
 */
import { formatLobbyMeta } from "../utils/format.js";
import { notifyLobbyState } from "../api/ws.js";
import { gameLabelKey, resolveGameType } from "../games/index.js";
import { t } from "../i18n/index.js";
import { getLastLobbySnapshot, setLastLobbySnapshot } from "./pregame-snapshot.js";
import {
  applyPendingReadyToLobby,
  clearPendingMyReady,
  clearReadyToggleCooldown,
  setPregameRefreshHandler,
} from "./pregame/ready-pending.js";
import {
  startCountdownUi,
  stopCountdownTimers,
  hideCountdown,
  wrapCountdownHandler,
} from "./pregame/countdown.js";
import { patchPregameFromLobby, renderHostGuestPregame, updatePregameStatusText } from "./pregame/render.js";
import { resetReadyButtonsDisabled } from "./pregame/ready-ui.js";
import {
  getPregameReadyState,
  isPregameLobbyDelta,
  lobbyPlayersUnchanged,
  normalizeWaitingLobby,
} from "./pregame/roles.js";
import {
  toggleMyReady,
  joinAsGuestFromPregame,
  kickOpponent,
  leaveGuestSeat,
} from "./pregame/actions.js";

export { isPregameLobbyDelta } from "./pregame/roles.js";

setPregameRefreshHandler(patchPregameFromLobby);

export function setPregameScreenMode(on) {
  var screen = document.querySelector(".game-screen");
  if (screen) screen.classList.toggle("game-screen--pregame", !!on);
}

function updatePregameGameName(lobby) {
  var el = document.getElementById("pregameGameName");
  if (!el || !lobby) return;
  el.textContent = t(gameLabelKey(resolveGameType(lobby)));
}

export function stopPregameUi() {
  stopCountdownTimers();
  hideCountdown();
  clearReadyToggleCooldown();
  clearPendingMyReady();
  setLastLobbySnapshot(null);
  resetReadyButtonsDisabled();
  document.querySelectorAll(".pregame-player[data-player-id]").forEach(function (el) {
    delete el.dataset.playerId;
  });
  setPregameScreenMode(false);
  var overlay = document.getElementById("gamePregame");
  if (overlay) overlay.setAttribute("hidden", "");
}

export function updatePregameLobby(lobby, options) {
  options = options || {};
  if (!lobby || lobby.status !== "waiting") {
    stopPregameUi();
    return;
  }

  lobby = normalizeWaitingLobby(lobby);
  lobby = applyPendingReadyToLobby(lobby);
  var prev = getLastLobbySnapshot();
  if (prev) prev = normalizeWaitingLobby(prev);
  var onPlaying =
    options.onPlaying ||
    function (synced) {
      if (synced) notifyLobbyState(synced);
    };

  if (prev && lobbyPlayersUnchanged(prev, lobby)) {
    setLastLobbySnapshot(lobby);
    patchPregameFromLobby(lobby, { onPlaying: onPlaying });
    return;
  }

  setLastLobbySnapshot(lobby);
  var overlay = document.getElementById("gamePregame");
  if (!overlay) return;

  var ready = getPregameReadyState(lobby);

  setPregameScreenMode(true);
  overlay.removeAttribute("hidden");

  var meta = document.getElementById("pregameMatchMeta");
  if (meta) meta.textContent = formatLobbyMeta(lobby);
  updatePregameGameName(lobby);

  renderHostGuestPregame(lobby, ready);
  updatePregameStatusText(lobby, ready.hasGuest, ready.countdownLocked, ready.myReady, ready.oppReady);

  if (ready.countdownLocked) {
    startCountdownUi(lobby, wrapCountdownHandler(onPlaying, lobby));
  } else {
    stopCountdownTimers();
    hideCountdown();
  }
}

export function refreshPregameTexts() {
  var snap = getLastLobbySnapshot();
  if (snap) updatePregameLobby(snap);
}

export function bindPregameLobby() {
  ["pregameHostReadyBtn", "pregameGuestReadyBtn"].forEach(function (id) {
    var btn = document.getElementById(id);
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", function () {
      toggleMyReady();
    });
  });

  var hostKickBtn = document.getElementById("pregameHostKickBtn");
  if (hostKickBtn && hostKickBtn.dataset.bound !== "1") {
    hostKickBtn.dataset.bound = "1";
    hostKickBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      kickOpponent();
    });
  }

  var joinGuestBtn = document.getElementById("btnPregameJoinAsGuest");
  if (joinGuestBtn && joinGuestBtn.dataset.bound !== "1") {
    joinGuestBtn.dataset.bound = "1";
    joinGuestBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      joinAsGuestFromPregame();
    });
  }

  var leaveGuestBtn = document.getElementById("pregameGuestLeaveBtn");
  if (leaveGuestBtn && leaveGuestBtn.dataset.bound !== "1") {
    leaveGuestBtn.dataset.bound = "1";
    leaveGuestBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      leaveGuestSeat();
    });
  }
}
