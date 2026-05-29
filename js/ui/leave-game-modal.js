import { switchTab } from "../app/nav.js";
import { game, leaveGate } from "../game/state.js";
import { leaveActiveLobby } from "../game/lobby-session.js";
import { isForfeitLeave, maybeForfeitActiveMatch } from "../game/match-board.js";
import { t } from "../i18n/index.js";
import { closeModal, openModal } from "./modal-utils.js";

function getLeaveGameModal() {
  return document.getElementById("leaveGameModal");
}

export function syncLeaveModalCopy() {
  var modal = getLeaveGameModal();
  if (!modal) return;

  var eyebrow = document.getElementById("leaveGameEyebrow");
  var title = document.getElementById("leaveGameTitle");
  var desc = document.getElementById("leaveGameDesc");
  var stayBtn = document.getElementById("btnLeaveGameStay");
  var confirmBtn = document.getElementById("btnLeaveGameConfirm");
  if (!title || !desc || !confirmBtn) return;

  var forfeit = isForfeitLeave();
  var hasOpponent = !!(game.opponent && (game.opponent.displayName || game.opponent.username));

  if (forfeit) {
    if (eyebrow) eyebrow.textContent = t("leave.eyebrowMatch");
    title.textContent = t("leave.titleMatch");
    desc.textContent = t("leave.descForfeit");
    if (stayBtn) stayBtn.textContent = t("leave.stayInGame");
    confirmBtn.textContent = t("leave.exitForfeit");
    confirmBtn.classList.add("btn--modal-risk");
    confirmBtn.classList.remove("btn--muted");
  } else if (game.waiting || (game.matchActive && !game.matchFinished)) {
    if (eyebrow) eyebrow.textContent = t("leave.eyebrowLobby");
    title.textContent = t("leave.titleLobby");
    if (game.myRole === "spectator") {
      desc.textContent = t("leave.descSpectator");
    } else if (game.myRole === "guest") {
      desc.textContent = t("leave.descGuest");
    } else if (hasOpponent) {
      desc.textContent = t("leave.descHostWithOpponent");
    } else {
      desc.textContent = t("leave.descHostAlone");
    }
    if (stayBtn) stayBtn.textContent = t("leave.stay");
    confirmBtn.textContent = t("leave.exit");
    confirmBtn.classList.remove("btn--modal-risk");
    confirmBtn.classList.add("btn--muted");
  } else {
    if (eyebrow) eyebrow.textContent = t("leave.eyebrowLobby");
    title.textContent = t("leave.titleShort");
    desc.textContent = t("leave.descDefault");
    if (stayBtn) stayBtn.textContent = t("leave.stay");
    confirmBtn.textContent = t("leave.exit");
    confirmBtn.classList.remove("btn--modal-risk");
    confirmBtn.classList.add("btn--muted");
  }
}

export function requiresLeaveGameConfirm() {
  var gameEl = document.getElementById("view-game");
  var gameVisible = gameEl && !gameEl.hasAttribute("hidden");
  return !!(
    gameVisible &&
    game.lobbyId &&
    (game.matchActive || game.waiting) &&
    !game.matchFinished
  );
}

export function closeLeaveGameConfirmModal(options) {
  options = options || {};
  var modal = getLeaveGameModal();
  if (!modal) return;
  leaveGate.confirmCallback = null;
  var ret = options.restoreFocus === false ? null : leaveGate.focusReturnEl;
  leaveGate.focusReturnEl = null;
  closeModal(modal, ret || null);
}

export function openLeaveGameConfirmModal(onConfirm, focusReturnEl) {
  leaveGate.confirmCallback = typeof onConfirm === "function" ? onConfirm : null;
  leaveGate.focusReturnEl = focusReturnEl || null;
  var modal = getLeaveGameModal();
  if (!modal) {
    var cbImmediate = leaveGate.confirmCallback;
    leaveGate.confirmCallback = null;
    leaveGate.focusReturnEl = null;
    if (cbImmediate) cbImmediate();
    return;
  }
  syncLeaveModalCopy();
  openModal(modal, { focusSelector: "#btnLeaveGameConfirm" });
}

export function requestSwitchToLobby(focusReturnEl) {
  if (!requiresLeaveGameConfirm()) {
    switchTab("lobby");
    return;
  }
  openLeaveGameConfirmModal(function () {
    leaveActiveLobby()
      .then(function () {
        maybeForfeitActiveMatch();
        switchTab("lobby");
      })
      .catch(function () {
        maybeForfeitActiveMatch();
        switchTab("lobby");
      });
  }, focusReturnEl);
}

export function bindLeaveGameConfirmModal() {
  var modal = getLeaveGameModal();
  if (!modal) return;
  modal.querySelectorAll("[data-leave-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      closeLeaveGameConfirmModal({});
    });
  });
  var stayBtn = document.getElementById("btnLeaveGameStay");
  if (stayBtn) {
    stayBtn.addEventListener("click", function () {
      closeLeaveGameConfirmModal({});
    });
  }
  var confirmBtn = document.getElementById("btnLeaveGameConfirm");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function () {
      var cb = leaveGate.confirmCallback;
      closeLeaveGameConfirmModal({ restoreFocus: false });
      if (typeof cb === "function") cb();
    });
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    var lg = getLeaveGameModal();
    if (!lg || lg.hasAttribute("hidden")) return;
    closeLeaveGameConfirmModal({});
    ev.preventDefault();
  });
}
