/**
 * Match screen orchestration — re-exports session/UI modules and wires board input.
 */
import { game, GAME_ROWS } from "./state.js";
import { submitMove, syncLobby } from "../api/client.js";
import { notifyLobbyState } from "../api/ws.js";
import { t } from "../i18n/index.js";
import * as connectFour from "../games/connect-four-board.js";
import * as boardRuntime from "../games/board-runtime.js";
import { markOptimisticMove } from "./move-guard.js";
import { syncChipVisuals } from "./match-chips.js";
import { resetClocksFromSettings, updateClockDisplay } from "./match-clock.js";
import {
  setTurnLabelKey,
  updateGamePresentation,
  updateGameTurnUI,
  refreshMatchMeta,
  showForfeitBanner,
} from "./match-ui.js";
import {
  applyServerLobby,
  applyServerLobbyPlaying,
  enterWaitingLobby,
  resetLocalMatch,
} from "./match-session.js";
import { bindPregameLobby, refreshPregameTexts } from "./pregame-lobby.js";

let navigateToTab = function (tab) {
  console.warn("[match] navigate not wired:", tab);
};

export function setNavigateToTab(fn) {
  navigateToTab = typeof fn === "function" ? fn : navigateToTab;
}

export {
  applyServerLobby,
  applyServerLobbyPlaying,
  enterWaitingLobby,
  resetLocalMatch,
};

export function isForfeitLeave() {
  if (game.myRole === "spectator") return false;
  if (!game.matchActive || game.matchFinished || game.waiting) return false;
  return connectFour.hasAnyPieces();
}

export function maybeForfeitActiveMatch() {
  connectFour.removeAllDropOverlays();
  var board = document.getElementById("gameBoard");
  connectFour.updateGhostPreviewColumn(board, null);
  if (isForfeitLeave()) showForfeitBanner();
  resetLocalMatch();
}

function handleConnectFourMove(column) {
  if (game.grid[column].length >= GAME_ROWS || !game.lobbyId) return;
  var prev = connectFour.cloneGrid(game.grid);
  game.grid[column].push("y");
  connectFour.applyPatch(prev);
  markOptimisticMove();

  submitMove(game.lobbyId, column)
    .then(function (result) {
      if (!result) {
        syncLobby(game.lobbyId)
          .then(function (lobby) {
            if (lobby) notifyLobbyState(lobby);
          })
          .catch(function () {});
        return;
      }
      if (result.viaWs) return;
      if (result.lobby) notifyLobbyState(result.lobby);
    })
    .catch(function (err) {
      console.warn("[move]", err.message || err);
      syncLobby(game.lobbyId)
        .then(function (lobby) {
          if (lobby) notifyLobbyState(lobby);
        })
        .catch(function () {});
    });
}

export function bindGameBoardInteractions() {
  boardRuntime.bindBoardInteractions({
    onConnectFourMove: handleConnectFourMove,
  });
}

export function refreshGameTexts() {
  refreshMatchMeta(null);

  var forfeitBanner = document.getElementById("gameForfeitBanner");
  if (forfeitBanner) forfeitBanner.textContent = t("game.forfeitBanner");

  if (game.lastTurnLabelKey) {
    setTurnLabelKey(game.lastTurnLabelKey);
  } else if (game.matchActive && !game.matchFinished) {
    updateGameTurnUI();
  }

  if (game.waiting) refreshPregameTexts();
  updateGamePresentation(game.gameType);
  boardRuntime.renderBoard(game.gameType);
}

export function primeGamePresentation() {
  connectFour.resetGrid();
  resetClocksFromSettings(null);
  boardRuntime.renderBoard(game.gameType);
  updateGameTurnUI();
  updateClockDisplay();
  syncChipVisuals();
  bindGameBoardInteractions();
  bindPregameLobby();
}
