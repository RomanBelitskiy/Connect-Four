import { game } from "./state.js";
import { usesMarkChips, resolveGameType } from "../games/index.js";

var pendingPieceCount = 0;

function countLocalPieces() {
  if (game.tttState && game.tttState.cells) {
    var n = 0;
    for (var i = 0; i < game.tttState.cells.length; i++) {
      if (game.tttState.cells[i]) n += 1;
    }
    return n;
  }
  var total = 0;
  for (var c = 0; c < game.grid.length; c++) {
    total += (game.grid[c] && game.grid[c].length) || 0;
  }
  return total;
}

function countLobbyPieces(lobby) {
  if (!lobby || !lobby.grid) return 0;
  var gameType = resolveGameType(lobby, game.gameType);
  if (usesMarkChips(gameType)) {
    var cells = lobby.grid.cells;
    if (!Array.isArray(cells)) return 0;
    var n = 0;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i]) n += 1;
    }
    return n;
  }
  if (!Array.isArray(lobby.grid)) return 0;
  var total = 0;
  for (var col = 0; col < lobby.grid.length; col++) {
    total += (lobby.grid[col] && lobby.grid[col].length) || 0;
  }
  return total;
}

/** Після оптимістичного ходу — запамʼятати очікувану кількість фішок. */
export function markOptimisticMove() {
  pendingPieceCount = countLocalPieces();
}

export function clearOptimisticMove() {
  pendingPieceCount = 0;
}

/** Запізнілий sync/WS — не відкочувати дошку назад (обидва гравці). */
export function isStalePlayingLobby(lobby) {
  if (!lobby || lobby.status !== "playing") return false;
  if (!game.matchActive || game.status !== "playing") return false;
  return countLobbyPieces(lobby) < countLocalPieces();
}

export function acceptPlayingLobby(lobby) {
  if (!lobby || lobby.status !== "playing") return;
  if (countLobbyPieces(lobby) >= countLocalPieces()) {
    clearOptimisticMove();
  }
}
