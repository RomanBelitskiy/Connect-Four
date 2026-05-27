import { t } from "../../i18n/index.js";
import { usesMarkChips } from "../../games/index.js";
import { createTttMarkElement } from "../../games/infinite-ttt-board.js";

function chipAriaLabel(color) {
  return color === "red" ? t("pregame.chipRed") : t("pregame.chipYellow");
}

function markAriaLabel(mark) {
  return mark === "X" ? t("pregame.markX") : t("pregame.markO");
}

function setChipDisc(chipEl, color) {
  if (!chipEl) return;
  chipEl.innerHTML = "";
  chipEl.classList.remove("pregame-chips__slot--empty");
  chipEl.setAttribute("aria-label", chipAriaLabel(color));
  var disc = document.createElement("span");
  disc.className =
    "pregame-chips__disc game-board__legend-disk " +
    (color === "red" ? "game-board__legend-disk--chip-red" : "game-board__legend-disk--yellow");
  disc.setAttribute("aria-hidden", "true");
  chipEl.appendChild(disc);
}

function setChipMark(chipEl, mark) {
  if (!chipEl) return;
  chipEl.innerHTML = "";
  chipEl.classList.remove("pregame-chips__slot--empty");
  chipEl.setAttribute("aria-label", markAriaLabel(mark));
  chipEl.appendChild(createTttMarkElement(mark, { extraClass: "pregame-chips__mark" }));
}

/** Лівий/правий слот = хост/гість (не «я/суперник»). */
export function updatePregameChips(hostColor, guestColor, hasGuest, gameType) {
  var row = document.getElementById("pregameChips");
  var hostSlot = document.getElementById("pregameChipMe");
  var guestSlot = document.getElementById("pregameChipOpp");
  if (!row || !hostSlot || !guestSlot) return;

  var isTtt = usesMarkChips(gameType);
  row.classList.toggle("pregame-chips--ttt", isTtt);
  row.removeAttribute("hidden");

  if (isTtt) {
    var hostMark = hostColor === "red" ? "O" : "X";
    var guestMark = guestColor === "red" ? "O" : "X";
    setChipMark(hostSlot, hostMark);
    setChipMark(guestSlot, guestMark);
  } else {
    setChipDisc(hostSlot, hostColor);
    setChipDisc(guestSlot, guestColor);
  }
  guestSlot.classList.toggle("pregame-chips__slot--ghost", !hasGuest);
}
