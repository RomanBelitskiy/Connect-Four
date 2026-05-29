import { maybeForfeitActiveMatch } from "../game/match-board.js";
import { clearActiveGameTab } from "./game-tab-hint.js";
import { showLobbyList } from "./shell.js";
import { setTelegramBackVisible } from "./telegram.js";
import { clearLobbyJoinHoverSuppress } from "./join-hover-suppress.js";

export function getActiveTab() {
  var active = document.querySelector(".view.view--active[data-view]");
  return active ? active.getAttribute("data-view") : null;
}

export function ensureGameTab() {
  switchTab("game");
}

export function ensureLobbyTab() {
  clearActiveGameTab();
  switchTab("lobby");
}

export function switchTab(tab) {
  var current = getActiveTab();
  if (current === tab) {
    if (tab === "lobby") {
      clearLobbyJoinHoverSuppress();
      showLobbyList();
    }
    setTelegramBackVisible(tab === "game");
    return;
  }

  var gameEl = document.getElementById("view-game");
  var gameVisible = gameEl && !gameEl.hasAttribute("hidden");

  if (gameVisible && tab !== "game") {
    maybeForfeitActiveMatch();
  }

  var views = document.querySelectorAll(".view");
  var buttons = document.querySelectorAll(".tab-bar__btn");

  views.forEach(function (v) {
    var match = v.getAttribute("data-view") === tab;
    if (match) {
      v.removeAttribute("hidden");
      v.classList.add("view--active");
    } else {
      v.setAttribute("hidden", "");
      v.classList.remove("view--active");
    }
  });

  buttons.forEach(function (btn) {
    var is = btn.getAttribute("data-tab") === tab;
    var seg = btn.closest(".tab-bar__segment");
    if (seg) seg.classList.toggle("is-active", is);
    if (is) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  setTelegramBackVisible(tab === "game");

  if (tab === "lobby") {
    clearLobbyJoinHoverSuppress();
    showLobbyList();
  }
}
