import { game } from "./state.js";
import { DEFAULT_GAME_ID, resolveGameType } from "../games/index.js";
import * as boardRuntime from "../games/board-runtime.js";
import * as connectFour from "../games/connect-four-board.js";
import { syncChipVisuals } from "./match-chips.js";
import {
  applyClocksFromLobby,
  resetClocksFromSettings,
  stopGameClock,
  startGameClock,
  updateClockDisplay,
} from "./match-clock.js";
import {
  setInMatchUi,
  setPostMatchLobbyCtaVisible,
  updateGamePresentation,
  updateGameTurnUI,
  updateOutcomeFromServer,
  updateSpectatorBar,
  refreshMatchMeta,
} from "./match-ui.js";
import {
  updatePregameLobby,
  stopPregameUi,
} from "./pregame-lobby.js";
import { bumpSyncEpoch } from "./sync-epoch.js";
import {
  acceptPlayingLobby,
  clearOptimisticMove,
  isStalePlayingLobby,
} from "./move-guard.js";

function applyParticipantRoles(lobby) {
  if (lobby.myRole === "spectator") {
    game.humanChipColor = lobby.hostChipColor === "red" ? "red" : "yellow";
    game.opponent = lobby.guest || null;
    game.myTelegramId = null;
  } else {
    game.myTelegramId =
      lobby.myRole === "host"
        ? String(lobby.host && lobby.host.telegramId)
        : String(lobby.guest && lobby.guest.telegramId);
    game.opponent = lobby.myRole === "host" ? lobby.guest : lobby.host;
    if (lobby.myRole === "host") {
      game.humanChipColor = lobby.hostChipColor === "red" ? "red" : "yellow";
    } else {
      game.humanChipColor = lobby.hostChipColor === "red" ? "yellow" : "red";
    }
  }
}

function applyPlayingStateFromLobby(lobby) {
  game.gameType = resolveGameType(lobby, game.gameType);
  boardRuntime.syncGridFromLobby(lobby);
  applyParticipantRoles(lobby);

  game.incSec = lobby.incrementSeconds || 0;
  game.waiting = false;
  game.matchActive = lobby.status === "playing";
  game.matchFinished = lobby.status === "finished";
  boardRuntime.syncWinFromLobby(lobby);

  if (lobby.currentTurnId) {
    if (lobby.myRole === "spectator") {
      var hostTid = String(lobby.host && lobby.host.telegramId);
      game.currentPlayer = String(lobby.currentTurnId) === hostTid ? "y" : "r";
    } else if (game.myTelegramId) {
      game.currentPlayer = String(lobby.currentTurnId) === String(game.myTelegramId) ? "y" : "r";
    }
  }
}

function applyWaitingLobbyState(lobby, options) {
  options = options || {};
  game.waiting = true;
  game.lobbyId = lobby.id;
  game.myRole = lobby.myRole || game.myRole;
  game.shareUrl = lobby.shareUrl;
  game.status = lobby.status;
  game.gameType = resolveGameType(lobby, game.gameType);
  updateSpectatorBar(lobby);
  boardRuntime.syncGridFromLobby(lobby);
  applyParticipantRoles(lobby);
  applyClocksFromLobby(lobby);

  if (options.resetClocks) {
    resetClocksFromSettings({
      secondsPerPlayer: lobby.secondsPerPlayer,
      incrementSeconds: lobby.incrementSeconds,
    });
  }

  syncChipVisuals();
  updateGamePresentation(game.gameType);
  refreshMatchMeta(lobby);
  setInMatchUi(true);

  updatePregameLobby(lobby, {
    onPlaying: function (synced) {
      if (!synced || synced.status !== "playing") return;
      if (game.matchActive && game.status === "playing") return;
      stopPregameUi();
      applyServerLobby(synced);
    },
  });
  updateClockDisplay();
}

export function applyServerLobbyPlaying(lobby) {
  if (!lobby || lobby.status !== "playing") return;
  if (isStalePlayingLobby(lobby)) return;

  var prevState = game.lobbyId === lobby.id ? boardRuntime.cloneState(game.gameType) : null;

  game.status = lobby.status;
  game.gameType = resolveGameType(lobby, game.gameType);
  updateSpectatorBar(lobby);
  applyPlayingStateFromLobby(lobby);
  syncChipVisuals();
  updateGamePresentation(game.gameType);

  var patched = prevState && boardRuntime.applyPatch(game.gameType, prevState);
  if (!patched) boardRuntime.renderBoard(game.gameType);

  applyClocksFromLobby(lobby, { detectMoveBonus: !!patched });
  updateGameTurnUI();
  updateClockDisplay();
  stopGameClock();
  if (game.matchActive && !game.matchFinished) startGameClock();
  if (game.matchFinished) updateOutcomeFromServer(lobby);
  acceptPlayingLobby(lobby);
}

function resetMatchState() {
  boardRuntime.clearBoardOverlays(game.gameType);
  stopGameClock();
  connectFour.resetGrid();
  game.currentPlayer = "y";
  game.matchActive = false;
  game.matchFinished = false;
  game.waiting = false;
  game.lobbyId = null;
  game.myRole = null;
  game.shareUrl = null;
  game.status = null;
  game.opponent = null;
  game.lastTurnLabelKey = null;
  game.winLine = null;
  game.winCells = null;
  game.gameType = DEFAULT_GAME_ID;
  game.tttState = null;
}

export function resetLocalMatch() {
  clearOptimisticMove();
  resetMatchState();
  setInMatchUi(false);
  setPostMatchLobbyCtaVisible(false);
  stopPregameUi();
  updateSpectatorBar(null);
  boardRuntime.renderBoard(game.gameType);
  updateGameTurnUI();
  updateClockDisplay();
}

export function enterWaitingLobby(lobby, options) {
  options = options || {};
  resetMatchState();
  options.resetClocks = true;
  applyWaitingLobbyState(lobby, options);
}

export function applyServerLobby(lobby, options) {
  options = options || {};
  if (!lobby) return;

  var wasWaiting = game.waiting || game.status === "waiting";

  if (lobby.status === "playing" && wasWaiting) {
    bumpSyncEpoch();
  }

  if (
    lobby.status === "playing" &&
    game.matchActive &&
    game.status === "playing" &&
    !wasWaiting
  ) {
    if (isStalePlayingLobby(lobby)) return;
    applyServerLobbyPlaying(lobby);
    return;
  }

  var prevState =
    game.lobbyId === lobby.id && lobby.status === "playing" && !wasWaiting
      ? boardRuntime.cloneState(game.gameType)
      : null;

  game.lobbyId = lobby.id;
  game.myRole = lobby.myRole;
  game.shareUrl = lobby.shareUrl;
  game.status = lobby.status;
  game.waiting = lobby.status === "waiting";
  game.gameType = resolveGameType(lobby, game.gameType);
  updateSpectatorBar(lobby);

  if (lobby.status === "waiting") {
    if (game.lobbyId && String(game.lobbyId) === String(lobby.id)) {
      applyWaitingLobbyState(lobby, options);
    } else {
      enterWaitingLobby(lobby, options);
    }
    return;
  }

  game.waiting = false;
  stopPregameUi();
  syncChipVisuals();
  updateGamePresentation(game.gameType);
  refreshMatchMeta(lobby);

  applyPlayingStateFromLobby(lobby);
  var patched =
    lobby.status === "playing" &&
    prevState &&
    !wasWaiting &&
    boardRuntime.applyPatch(game.gameType, prevState);
  if (!patched) boardRuntime.renderBoard(game.gameType);
  applyClocksFromLobby(lobby, { detectMoveBonus: !!patched });
  updateGameTurnUI();
  updateClockDisplay();
  stopGameClock();
  if (game.matchActive && !game.matchFinished) startGameClock();
  if (game.matchFinished) updateOutcomeFromServer(lobby);
  if (game.matchActive) setInMatchUi(true);
  acceptPlayingLobby(lobby);
}
