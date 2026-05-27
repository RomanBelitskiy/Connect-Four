import { game } from "./state.js";
import { usesMarkChips } from "../games/index.js";

export function normalizeHumanChip(value) {
  return value === "red" ? "red" : "yellow";
}

export function opponentChipColor() {
  return game.humanChipColor === "red" ? "yellow" : "red";
}

export function pieceModifierForDrop(moverKind) {
  if (moverKind === "y") {
    return game.humanChipColor === "red" ? "game-board__piece--red" : "game-board__piece--yellow";
  }
  return opponentChipColor() === "red" ? "game-board__piece--red" : "game-board__piece--yellow";
}

function syncDiscClockVisuals() {
  game.humanChipColor = normalizeHumanChip(game.humanChipColor);
  var oppHue = opponentChipColor();

  var humanPanel = document.getElementById("gameClockYellowPanel");
  if (humanPanel) {
    humanPanel.classList.remove(
      "game-clock--yellow",
      "game-clock--player",
      "game-clock--chip-yellow",
      "game-clock--chip-red"
    );
    humanPanel.classList.add("game-clock--player");
    humanPanel.classList.add(
      game.humanChipColor === "red" ? "game-clock--chip-red" : "game-clock--chip-yellow"
    );
  }

  var oppPanel = document.getElementById("gameClockRedPanel");
  if (oppPanel) {
    oppPanel.classList.remove("game-clock--opponent", "game-clock--chip-yellow", "game-clock--chip-red");
    oppPanel.classList.add("game-clock--opponent");
    oppPanel.classList.add(oppHue === "red" ? "game-clock--chip-red" : "game-clock--chip-yellow");
  }

  var humanLegend = document.getElementById("gameLegendHumanDisk");
  if (humanLegend) {
    humanLegend.classList.remove("game-board__legend-disk--yellow", "game-board__legend-disk--chip-red");
    humanLegend.classList.add(
      game.humanChipColor === "red"
        ? "game-board__legend-disk--chip-red"
        : "game-board__legend-disk--yellow"
    );
  }

  var oppLegend = document.getElementById("gameLegendOppDisk");
  if (oppLegend) {
    oppLegend.classList.remove("game-board__legend-disk--yellow", "game-board__legend-disk--chip-red");
    oppLegend.classList.add(
      oppHue === "red" ? "game-board__legend-disk--chip-red" : "game-board__legend-disk--yellow"
    );
  }
}

function syncTttClockVisuals() {
  var humanMark = game.myRole === "guest" ? "o" : "x";
  var oppMark = humanMark === "x" ? "o" : "x";

  var humanPanel = document.getElementById("gameClockYellowPanel");
  if (humanPanel) {
    humanPanel.classList.remove(
      "game-clock--yellow",
      "game-clock--player",
      "game-clock--chip-yellow",
      "game-clock--chip-red",
      "game-clock--ttt-x",
      "game-clock--ttt-o"
    );
    humanPanel.classList.add("game-clock--player");
    humanPanel.classList.add(humanMark === "x" ? "game-clock--ttt-x" : "game-clock--ttt-o");
  }

  var oppPanel = document.getElementById("gameClockRedPanel");
  if (oppPanel) {
    oppPanel.classList.remove(
      "game-clock--opponent",
      "game-clock--chip-yellow",
      "game-clock--chip-red",
      "game-clock--ttt-x",
      "game-clock--ttt-o"
    );
    oppPanel.classList.add("game-clock--opponent");
    oppPanel.classList.add(oppMark === "x" ? "game-clock--ttt-x" : "game-clock--ttt-o");
  }
}

export function syncChipVisuals() {
  if (usesMarkChips(game.gameType)) {
    syncTttClockVisuals();
    return;
  }
  syncDiscClockVisuals();
}
