import { startLobbyFromSettings, leaveActiveLobby } from "../game/lobby-session.js";
import { refreshLobbies } from "../app/shell.js";
import { fetchActiveLobby } from "../api/client.js";
import { confirmReplaceLobby } from "./replace-lobby-modal.js";
import { userErrorMessage } from "../utils/errors.js";
import { t, formatTimeOption, formatIncrementOption } from "../i18n/index.js";
import { openPickGameModal, gameTitleForType, getPendingGameType } from "./pick-game-modal.js";
import { DEFAULT_GAME_ID, getGameDef, normalizeGameId } from "../games/index.js";
import { createTttMarkElement } from "../games/infinite-ttt-board.js";
import {
  bindFakeSelectsInModal,
  closeAllFakeSelects,
  closeOpenFakeSelectOnEscape,
} from "./fake-select.js";
import { closeModal, openModal } from "./modal-utils.js";

async function createLobbyFlow(settings) {
  var existing = await fetchActiveLobby();
  if (existing) {
    var ok = await confirmReplaceLobby({ mode: "create" });
    if (!ok) return;
    await leaveActiveLobby(existing.id);
    await startLobbyFromSettings(settings, true);
    await refreshLobbies();
    return;
  }

  try {
    await startLobbyFromSettings(settings, false);
  } catch (err) {
    if (err && (err.code === "active_lobby_exists" || err.message === "active_lobby_exists")) {
      var retryOk = await confirmReplaceLobby({ mode: "create" });
      if (!retryOk) return;
      await leaveActiveLobby();
      await startLobbyFromSettings(settings, true);
    } else {
      throw err;
    }
  }
  await refreshLobbies();
}

function getCreateLobbyModal() {
  return document.getElementById("createLobbyModal");
}

function renderChipSegmentButton(btn, useMarks, colorValue) {
  if (!btn) return;
  btn.setAttribute("data-value", colorValue);
  btn.innerHTML = "";

  if (useMarks) {
    var mark = colorValue === "yellow" ? "X" : "O";
    btn.setAttribute("aria-label", t(mark === "X" ? "create.chipX" : "create.chipO"));
    btn.appendChild(createTttMarkElement(mark, { extraClass: "create-lobby-chip__mark" }));
    return;
  }

  btn.setAttribute("aria-label", t(colorValue === "red" ? "create.chipRed" : "create.chipYellow"));
  var disc = document.createElement("span");
  disc.className =
    "create-lobby-chip__disc create-lobby-chip__disc--" + (colorValue === "red" ? "red" : "yellow");
  disc.setAttribute("aria-hidden", "true");
  btn.appendChild(disc);
}

export function syncCreateLobbyChipPicker(gameType) {
  var modal = getCreateLobbyModal();
  if (!modal) return;

  var def = getGameDef(gameType);
  var useMarks = def.chipMode === "marks";
  var row = document.getElementById("createLobbyChipRow");
  var seg = document.getElementById("createLobbyChipSegmented");
  var title = document.getElementById("createLobbyChipTitle");
  var subtitle = document.getElementById("createLobbyChipSubtitle");
  var yellowBtn = document.getElementById("lobbyPlayerChipYellow");
  var redBtn = document.getElementById("lobbyPlayerChipRed");

  if (row) row.classList.toggle("modal-row--ttt-chip", useMarks);
  if (seg) {
    seg.classList.toggle("segmented--ttt-marks", useMarks);
    seg.setAttribute("data-i18n-aria", useMarks ? "create.chipAriaTtt" : "create.chipAria");
    seg.setAttribute("aria-label", t(useMarks ? "create.chipAriaTtt" : "create.chipAria"));
  }
  if (title) title.textContent = t(useMarks ? "create.chipTitleTtt" : "create.chipTitle");
  if (subtitle) subtitle.textContent = t(useMarks ? "create.chipSubTtt" : "create.chipSub");

  renderChipSegmentButton(yellowBtn, useMarks, "yellow");
  renderChipSegmentButton(redBtn, useMarks, "red");
}

function openCreateLobbyModal(gameType) {
  syncCreateLobbySelectLabels();
  var modal = getCreateLobbyModal();
  if (!modal) return;

  var resolvedType = normalizeGameId(gameType || getPendingGameType());
  var hidden = document.getElementById("lobbyGameType");
  if (hidden) hidden.value = resolvedType;

  var gameLabel = document.getElementById("createLobbyGameLabel");
  if (gameLabel) gameLabel.textContent = gameTitleForType(resolvedType);

  syncCreateLobbyChipPicker(resolvedType);
  resetVisibilityToggle();

  openModal(modal);
}

export { openCreateLobbyModal };

function closeCreateLobbyModal() {
  var modal = getCreateLobbyModal();
  if (!modal) return;
  closeAllFakeSelects(modal);
  var opener = document.getElementById("btnOpenCreateLobby");
  closeModal(modal, opener);
}

function labelForTimeValue(value) {
  return formatTimeOption(value);
}

function labelForIncValue(value) {
  var n = parseInt(String(value), 10);
  if (Number.isNaN(n) || n <= 0) return formatIncrementOption(0).replace("+", "");
  return formatIncrementOption(n);
}

export function syncCreateLobbySelectLabels() {
  var modal = getCreateLobbyModal();
  if (!modal) return;

  modal.querySelectorAll("[data-time-value]").forEach(function (el) {
    var value = el.getAttribute("data-time-value");
    if (value != null) el.textContent = labelForTimeValue(value);
  });

  modal.querySelectorAll("[data-inc-value]").forEach(function (el) {
    var value = el.getAttribute("data-inc-value");
    if (value != null) el.textContent = labelForIncValue(value);
  });

  var gameTypeEl = document.getElementById("lobbyGameType");
  var gameType = (gameTypeEl && gameTypeEl.value) || getPendingGameType() || DEFAULT_GAME_ID;
  syncCreateLobbyChipPicker(gameType);
  syncVisibilityToggleUi();
}

function syncVisibilityToggleUi(btn) {
  if (!btn) btn = document.getElementById("lobbyVisibilityToggle");
  if (!btn) return;

  var closed = btn.getAttribute("data-visibility") === "closed";
  btn.classList.toggle("lobby-visibility-toggle--closed", closed);
  btn.setAttribute("aria-pressed", closed ? "true" : "false");
  btn.setAttribute("aria-label", t(closed ? "create.visibilityClosed" : "create.visibilityOpen"));
}

function resetVisibilityToggle() {
  var btn = document.getElementById("lobbyVisibilityToggle");
  if (!btn) return;
  btn.setAttribute("data-visibility", "open");
  syncVisibilityToggleUi(btn);
}

function getLobbyModalSettings() {
  var visBtn = document.getElementById("lobbyVisibilityToggle");
  var visibility =
    visBtn && visBtn.getAttribute("data-visibility") === "closed" ? "closed" : "open";
  var timeEl = document.getElementById("lobbyTimeSeconds");
  var incEl = document.getElementById("lobbyIncrementSeconds");
  var activePlayerChipBtn = document.querySelector('.segmented__btn[data-segment="player-chip"].is-active');
  var playerChipChoice =
    activePlayerChipBtn && activePlayerChipBtn.getAttribute("data-value")
      ? activePlayerChipBtn.getAttribute("data-value")
      : "yellow";
  var gameTypeEl = document.getElementById("lobbyGameType");
  var resolvedGameType =
    normalizeGameId((gameTypeEl && gameTypeEl.value) || getPendingGameType() || DEFAULT_GAME_ID);
  return {
    visibility: visibility,
    secondsPerPlayer: timeEl ? timeEl.value : "60",
    incrementSeconds: incEl ? incEl.value : "1",
    playerChipColor: playerChipChoice,
    gameType: resolvedGameType,
  };
}

export function bindCreateLobbyModal() {
  var modal = getCreateLobbyModal();
  if (!modal) return;

  var backBtn = document.getElementById("btnCreateLobbyBack");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      closeCreateLobbyModal();
      openPickGameModal();
    });
  }

  modal.querySelectorAll("[data-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeCreateLobbyModal);
  });

  var visToggle = document.getElementById("lobbyVisibilityToggle");
  if (visToggle && visToggle.dataset.bound !== "1") {
    visToggle.dataset.bound = "1";
    visToggle.addEventListener("click", function () {
      var closed = visToggle.getAttribute("data-visibility") === "closed";
      visToggle.setAttribute("data-visibility", closed ? "open" : "closed");
      syncVisibilityToggleUi(visToggle);
    });
  }

  modal.querySelectorAll('.segmented__btn[data-segment="player-chip"]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      modal.querySelectorAll('.segmented__btn[data-segment="player-chip"]').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      var seg = btn.closest(".segmented--thumb");
      if (seg) seg.setAttribute("data-active", btn.getAttribute("data-value"));
    });
  });

  var confirmBtn = document.getElementById("btnCreateLobbyConfirm");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function () {
      var settings = getLobbyModalSettings();
      closeCreateLobbyModal();
      createLobbyFlow(settings).catch(function (err) {
        window.alert(userErrorMessage(err) || t("create.error"));
      });
    });
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (modal.hasAttribute("hidden")) return;
    if (closeOpenFakeSelectOnEscape(modal)) {
      ev.preventDefault();
      return;
    }
    closeCreateLobbyModal();
  });

  bindFakeSelectsInModal(modal, {
    labelForTimeValue: labelForTimeValue,
    labelForIncValue: labelForIncValue,
  });
  syncCreateLobbySelectLabels();
}
