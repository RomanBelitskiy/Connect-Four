import { game, GAME_COLS } from "../game/state.js";
import { t } from "../i18n/index.js";
import { getGameDef, usesMarkChips, resolveGameType } from "./index.js";
import * as connectFour from "./connect-four-board.js";
import * as infiniteTtt from "./infinite-ttt-board.js";

export function syncGridFromLobby(lobby) {
  var gameType = resolveGameType(lobby, game.gameType);
  if (usesMarkChips(gameType)) {
    game.tttState = infiniteTtt.serverStateToLocal(lobby.grid, {
      myRole: lobby.myRole,
      hostChipColor: lobby.hostChipColor,
    });
    game.grid = [];
    for (var i = 0; i < GAME_COLS; i++) game.grid.push([]);
    return;
  }
  connectFour.syncGridFromLobby(lobby);
}

export function syncWinFromLobby(lobby) {
  if (usesMarkChips(resolveGameType(lobby, game.gameType))) {
    infiniteTtt.syncWinFromLobby(lobby);
    return;
  }
  connectFour.syncWinFromLobby(lobby);
}

export function renderBoard(gameType) {
  if (usesMarkChips(gameType)) {
    infiniteTtt.renderBoard();
    return;
  }
  connectFour.renderBoard();
}

export function applyPatch(gameType, prevState) {
  if (usesMarkChips(gameType)) {
    return infiniteTtt.applyPatch(prevState);
  }
  return connectFour.applyPatch(prevState);
}

export function cloneState(gameType) {
  if (usesMarkChips(gameType)) {
    return infiniteTtt.cloneState(game.tttState);
  }
  return connectFour.cloneState();
}

export function clearBoardOverlays(gameType) {
  if (usesMarkChips(gameType)) return;
  connectFour.removeAllDropOverlays();
  connectFour.clearWinLineOverlay();
}

export function bindBoardInteractions(handlers) {
  infiniteTtt.bindBoardInteractions();
  if (handlers && typeof handlers.onConnectFourMove === "function") {
    connectFour.bindColumnInteractions(handlers.onConnectFourMove);
  }
}

export function updatePresentation(gameType) {
  var def = getGameDef(gameType);
  var isTtt = def.chipMode === "marks";

  var title = document.getElementById("game-heading");
  if (title) title.textContent = t(def.titleKey);

  var shell = document.querySelector(".game-board-shell");
  if (shell) shell.classList.toggle("game-board-shell--ttt", isTtt);

  var legend = document.querySelector(".game-board__legend");
  if (legend) {
    legend.classList.toggle("game-board__legend--ttt", isTtt);
    if (isTtt) legend.setAttribute("hidden", "");
    else legend.removeAttribute("hidden");
  }

  var humanDisk = document.getElementById("gameLegendHumanDisk");
  var oppDisk = document.getElementById("gameLegendOppDisk");
  if (humanDisk) {
    humanDisk.classList.remove("game-board__legend-mark--x", "game-board__legend-mark--o");
    if (isTtt) {
      humanDisk.classList.add("game-board__legend-mark--x");
      humanDisk.textContent = game.myRole === "guest" ? "O" : "X";
    } else {
      humanDisk.textContent = "";
    }
  }
  if (oppDisk) {
    oppDisk.classList.remove("game-board__legend-mark--x", "game-board__legend-mark--o");
    if (isTtt) {
      oppDisk.classList.add("game-board__legend-mark--o");
      oppDisk.textContent = game.myRole === "guest" ? "X" : "O";
    } else {
      oppDisk.textContent = "";
    }
  }

  var hint = document.querySelector(".game-screen__hint");
  if (hint) hint.textContent = t(def.hintKey);
}
