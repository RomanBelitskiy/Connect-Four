import { game } from "./state.js";
import { usesMarkChips } from "../games/index.js";
import { t } from "../i18n/index.js";

function playerDisplayName(user) {
  if (!user) return t("profile.player");
  var name = (user.displayName || user.username || "").trim();
  return name || t("profile.player");
}

function resolveViewerRole(lobby) {
  if (game.myRole) return game.myRole;
  if (lobby && lobby.myRole) return lobby.myRole;
  var host = (lobby && lobby.host) || game.hostUser;
  var guest = (lobby && lobby.guest) || game.guestUser;
  var myId = game.myTelegramId;
  if (!myId) return null;
  if (host && String(host.telegramId) === String(myId)) return "host";
  if (guest && String(guest.telegramId) === String(myId)) return "guest";
  return null;
}

export function normalizeHumanChip(value) {
  return value === "red" ? "red" : "yellow";
}

export function opponentChipColor() {
  return game.humanChipColor === "red" ? "yellow" : "red";
}

/** @param {"red"|"yellow"|string} color */
export function chipColorToTttMark(color) {
  return color === "red" ? "o" : "x";
}

export function hostChipColorFromGame() {
  if (game.myRole === "guest") return opponentChipColor();
  return normalizeHumanChip(game.humanChipColor);
}

export function guestChipColorFromGame() {
  if (game.myRole === "guest") return normalizeHumanChip(game.humanChipColor);
  return opponentChipColor();
}

export function hostTttMark() {
  return chipColorToTttMark(hostChipColorFromGame());
}

export function guestTttMark() {
  return chipColorToTttMark(guestChipColorFromGame());
}

export function humanTttMark() {
  return chipColorToTttMark(normalizeHumanChip(game.humanChipColor));
}

export function opponentTttMark() {
  return chipColorToTttMark(opponentChipColor());
}

/** Марка гравця, чий хід зараз (для банера ходу). @returns {"x"|"o"} */
export function activeTurnTttMark() {
  if (game.myRole === "spectator") {
    if (game.currentPlayer === "y") {
      return chipColorToTttMark(game.humanChipColor);
    }
    return chipColorToTttMark(opponentChipColor());
  }
  if (game.currentPlayer === "y") return humanTttMark();
  return opponentTttMark();
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
  var humanMark;
  var oppMark;
  if (game.myRole === "spectator") {
    humanMark = hostTttMark();
    oppMark = guestTttMark();
  } else {
    humanMark = humanTttMark();
    oppMark = opponentTttMark();
  }

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

export function updateClockPlayerLabels(lobby) {
  var yLabel = document.querySelector("#gameClockYellowPanel .game-clock__label");
  var rLabel = document.querySelector("#gameClockRedPanel .game-clock__label");
  if (!yLabel || !rLabel) return;

  var host = (lobby && lobby.host) || game.hostUser;
  var guest = (lobby && lobby.guest) || game.guestUser;
  var role = resolveViewerRole(lobby);

  yLabel.classList.add("game-clock__label--player-name");
  rLabel.classList.add("game-clock__label--player-name");
  yLabel.removeAttribute("data-i18n");
  rLabel.removeAttribute("data-i18n");

  if (role === "spectator") {
    yLabel.textContent = playerDisplayName(host);
    rLabel.textContent = guest ? playerDisplayName(guest) : t("lobby.slotOpen");
    return;
  }

  if (role === "guest") {
    yLabel.textContent = playerDisplayName(guest);
    rLabel.textContent = playerDisplayName(host);
    return;
  }

  yLabel.textContent = playerDisplayName(host);
  rLabel.textContent = guest ? playerDisplayName(guest) : t("lobby.slotOpen");
}

export function syncChipVisuals() {
  if (usesMarkChips(game.gameType)) {
    syncTttClockVisuals();
    return;
  }
  syncDiscClockVisuals();
}
