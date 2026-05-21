import { maybeForfeitActiveMatch } from "../game/match-board.js";
import { setTelegramBackVisible } from "./telegram.js";

export function switchTab(tab) {
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
}
