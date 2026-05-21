import { switchTab } from "../app/nav.js";
import { game, leaveGate } from "../game/state.js";

function getLeaveGameModal() {
  return document.getElementById("leaveGameModal");
}

export function requiresLeaveGameConfirm() {
  var gameEl = document.getElementById("view-game");
  var gameVisible = gameEl && !gameEl.hasAttribute("hidden");
  return !!(gameVisible && game.matchActive && !game.matchFinished);
}

export function closeLeaveGameConfirmModal(options) {
  options = options || {};
  var modal = getLeaveGameModal();
  if (!modal) return;
  modal.setAttribute("hidden", "");
  document.documentElement.style.overflow = "";
  leaveGate.confirmCallback = null;
  if (options.restoreFocus === false) {
    leaveGate.focusReturnEl = null;
    return;
  }
  var ret = leaveGate.focusReturnEl;
  leaveGate.focusReturnEl = null;
  if (ret && typeof ret.focus === "function") ret.focus();
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
  modal.removeAttribute("hidden");
  var riskBtn = modal.querySelector("#btnLeaveGameConfirm");
  if (riskBtn && typeof riskBtn.focus === "function") riskBtn.focus();
  document.documentElement.style.overflow = "hidden";
}

export function requestSwitchToLobby(focusReturnEl) {
  if (!requiresLeaveGameConfirm()) {
    switchTab("lobby");
    return;
  }
  openLeaveGameConfirmModal(function () {
    switchTab("lobby");
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
