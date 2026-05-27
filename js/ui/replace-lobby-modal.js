import { t } from "../i18n/index.js";

var lastMode = "create";

function getReplaceLobbyModal() {
  return document.getElementById("replaceLobbyModal");
}

function applyReplaceLobbyCopy(mode) {
  lastMode = mode === "join" ? "join" : "create";
  var desc = document.getElementById("replaceLobbyDesc");
  var confirmBtn = document.getElementById("btnReplaceLobbyConfirm");
  if (desc) {
    desc.textContent =
      lastMode === "join" ? t("replace.descJoin") : t("replace.descCreate");
  }
  if (confirmBtn) {
    confirmBtn.textContent =
      lastMode === "join" ? t("replace.confirmJoin") : t("replace.confirmCreate");
  }
}

export function syncReplaceLobbyModalCopy() {
  applyReplaceLobbyCopy(lastMode);
}

/**
 * @param {{ mode?: "create"|"join" }} [options]
 * @returns {Promise<boolean>}
 */
export function confirmReplaceLobby(options) {
  options = options || {};
  var mode = options.mode === "join" ? "join" : "create";

  return new Promise(function (resolve) {
    var modal = getReplaceLobbyModal();
    if (!modal) {
      resolve(true);
      return;
    }

    applyReplaceLobbyCopy(mode);
    modal.removeAttribute("hidden");
    document.documentElement.style.overflow = "hidden";

    function cleanup() {
      modal.setAttribute("hidden", "");
      document.documentElement.style.overflow = "";
      modal.querySelectorAll("[data-replace-close]").forEach(function (el) {
        el.removeEventListener("click", onCancel);
      });
      if (confirmBtn) confirmBtn.removeEventListener("click", onConfirm);
    }

    function onCancel() {
      cleanup();
      resolve(false);
    }

    function onConfirm() {
      cleanup();
      resolve(true);
    }

    var confirmBtn = document.getElementById("btnReplaceLobbyConfirm");
    modal.querySelectorAll("[data-replace-close]").forEach(function (el) {
      el.addEventListener("click", onCancel);
    });
    if (confirmBtn) confirmBtn.addEventListener("click", onConfirm);
    if (confirmBtn && typeof confirmBtn.focus === "function") confirmBtn.focus();
  });
}

export function bindReplaceLobbyModal() {
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    var modal = getReplaceLobbyModal();
    if (!modal || modal.hasAttribute("hidden")) return;
    modal.querySelectorAll("[data-replace-close]").forEach(function (el) {
      el.dispatchEvent(new Event("click"));
    });
    ev.preventDefault();
  });
}
