import { openCreateLobbyModal } from "./create-lobby-modal.js";
import { t } from "../i18n/index.js";
import { DEFAULT_GAME_ID, gameLabelKey, normalizeGameId } from "../games/index.js";
import { renderPickGameList } from "../games/pick-game-render.js";
import { closeModal, openModal } from "./modal-utils.js";

var pendingGameType = DEFAULT_GAME_ID;

export function getPendingGameType() {
  return pendingGameType;
}

export function setPendingGameType(gameType) {
  pendingGameType = normalizeGameId(gameType);
}

function getPickGameModal() {
  return document.getElementById("pickGameModal");
}

export function openPickGameModal() {
  openModal(getPickGameModal(), { focusSelector: ".pick-game-card" });
}

export function closePickGameModal() {
  closeModal(getPickGameModal());
}

function selectGame(gameType) {
  setPendingGameType(gameType);
  var hidden = document.getElementById("lobbyGameType");
  if (hidden) hidden.value = pendingGameType;
  closeModal(getPickGameModal(), null, {
    onClosed: function () {
      openCreateLobbyModal(pendingGameType);
    },
  });
}

export function bindPickGameModal() {
  var modal = getPickGameModal();
  var list = document.getElementById("pickGameList");
  if (list) renderPickGameList(list);

  var openBtn = document.getElementById("btnOpenCreateLobby");
  if (openBtn) {
    openBtn.addEventListener("click", openPickGameModal);
  }
  if (!modal) return;

  modal.querySelectorAll("[data-pick-game-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      closePickGameModal();
      if (openBtn) openBtn.focus();
    });
  });

  if (list) {
    list.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".pick-game-card");
      if (!btn) return;
      selectGame(btn.getAttribute("data-game-type") || DEFAULT_GAME_ID);
    });
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (modal.hasAttribute("hidden")) return;
    closePickGameModal();
    if (openBtn) openBtn.focus();
  });
}

export function gameTitleForType(gameType) {
  return t(gameLabelKey(gameType));
}
