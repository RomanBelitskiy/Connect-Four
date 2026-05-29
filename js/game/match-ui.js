import { game } from "./state.js";
import { formatLobbyMeta, prefersReducedMotion } from "../utils/format.js";
import { t } from "../i18n/index.js";
import { usesMarkChips } from "../games/index.js";
import { updatePresentation } from "../games/board-runtime.js";
import { activeTurnTttMark, opponentChipColor } from "./match-chips.js";
import { createTttMarkElement } from "../games/infinite-ttt-board.js";
import { isHumanTurn, stopGameClock } from "./match-clock.js";
import { setTurnLabelKey } from "./match-labels.js";
import * as boardRuntime from "../games/board-runtime.js";

export { setTurnLabelKey } from "./match-labels.js";

export function updateGamePresentation(lobbyOrType) {
  var gameType =
    typeof lobbyOrType === "string"
      ? lobbyOrType
      : lobbyOrType && lobbyOrType.gameType
        ? lobbyOrType.gameType
        : game.gameType;
  updatePresentation(gameType);
}

export function setInMatchUi(on) {
  var root = document.getElementById("app");
  if (root) root.classList.toggle("app--in-match", !!on);

  var meta = document.getElementById("gameMatchMeta");
  if (meta) {
    if (on) meta.removeAttribute("hidden");
    else meta.setAttribute("hidden", "");
  }
}

export function setPostMatchLobbyCtaVisible(visible) {
  var btn = document.getElementById("btnGameReturnLobby");
  var foot = document.querySelector(".game-screen__footer");
  if (btn) {
    if (visible) btn.removeAttribute("hidden");
    else btn.setAttribute("hidden", "");
  }
  if (foot) foot.classList.toggle("game-screen__footer--post-match", !!visible);
}

export function updateSpectatorBar(lobby) {
  var bar = document.getElementById("gameSpectatorBar");
  var countEl = document.getElementById("gameSpectatorCount");
  var n = lobby && lobby.spectatorCount != null ? lobby.spectatorCount : 0;
  if (bar) {
    if (n > 0) bar.removeAttribute("hidden");
    else bar.setAttribute("hidden", "");
  }
  if (countEl) countEl.textContent = String(n);
}

function scheduleForfeitBannerDismiss(wrap, bannerEl) {
  if (!wrap || !wrap.parentNode || wrap.getAttribute("data-forfeit-exiting") === "1") return;
  wrap.setAttribute("data-forfeit-exiting", "1");

  if (prefersReducedMotion()) {
    wrap.remove();
    return;
  }

  wrap.style.maxHeight = wrap.scrollHeight + "px";
  void wrap.offsetHeight;

  window.requestAnimationFrame(function () {
    bannerEl.classList.add("lobby-forfeit-banner--exit");
    wrap.classList.add("lobby-forfeit-banner-wrap--exit");
  });

  var finished = false;
  function teardown() {
    if (finished) return;
    finished = true;
    wrap.removeEventListener("transitionend", onTe);
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
  }

  function onTe(ev) {
    if (ev.target !== wrap || ev.propertyName !== "max-height") return;
    teardown();
  }

  wrap.addEventListener("transitionend", onTe);
  window.setTimeout(teardown, 1100);
}

export function showForfeitBanner() {
  var intro = document.querySelector(".lobby-intro");
  if (!intro) return;

  var oldWrap = document.getElementById("gameForfeitBannerWrap");
  if (oldWrap) {
    var tid = oldWrap.getAttribute("data-dismiss-timer-id");
    if (tid) window.clearTimeout(Number(tid));
    oldWrap.remove();
  }

  var wrap = document.createElement("div");
  wrap.className = "lobby-forfeit-banner-wrap";
  wrap.id = "gameForfeitBannerWrap";

  var p = document.createElement("p");
  p.className = "lobby-forfeit-banner";
  p.id = "gameForfeitBanner";
  p.setAttribute("role", "status");
  p.textContent = t("game.forfeitBanner");
  wrap.appendChild(p);

  var pulse = intro.querySelector(".lobby-intro__pulse");
  if (pulse && pulse.nextSibling) intro.insertBefore(wrap, pulse.nextSibling);
  else intro.appendChild(wrap);

  var timerId = window.setTimeout(function () {
    scheduleForfeitBannerDismiss(wrap, p);
  }, 7000);
  wrap.setAttribute("data-dismiss-timer-id", String(timerId));
}

function syncTurnBannerMark(banner, mark) {
  var disk = banner.querySelector(".game-turn__disk");
  if (!disk) return;
  disk.innerHTML = "";
  if (!mark) return;
  disk.appendChild(
    createTttMarkElement(mark === "x" ? "X" : "O", { extraClass: "game-turn__mark" })
  );
}

export function updateGameTurnUI() {
  var banner = document.getElementById("gameTurnBanner");
  var label = document.getElementById("gameTurnLabel");
  if (!banner || !label) return;
  if (!game.matchActive && game.matchFinished) return;

  banner.classList.remove(
    "game-turn--compact",
    "game-turn--outcome-loss",
    "game-turn--outcome-win",
    "game-turn--outcome-draw",
    "game-turn--disk-yellow",
    "game-turn--disk-red",
    "game-turn--ttt-x",
    "game-turn--ttt-o"
  );

  if (game.myRole === "spectator") {
    if (usesMarkChips(game.gameType)) {
      var spectatorMark = activeTurnTttMark();
      banner.classList.add(
        spectatorMark === "x" ? "game-turn--ttt-x" : "game-turn--ttt-o"
      );
      syncTurnBannerMark(banner, spectatorMark);
      setTurnLabelKey(game.currentPlayer === "y" ? "game.spectatorTurnHost" : "game.spectatorTurnGuest");
      return;
    }
    if (game.currentPlayer === "y") {
      banner.classList.add(
        game.humanChipColor === "red" ? "game-turn--disk-red" : "game-turn--disk-yellow"
      );
      setTurnLabelKey("game.spectatorTurnHost");
    } else {
      banner.classList.add(
        opponentChipColor() === "red" ? "game-turn--disk-red" : "game-turn--disk-yellow"
      );
      setTurnLabelKey("game.spectatorTurnGuest");
    }
    syncTurnBannerMark(banner, null);
    return;
  }

  if (usesMarkChips(game.gameType)) {
    var turnMark = activeTurnTttMark();
    banner.classList.add(turnMark === "x" ? "game-turn--ttt-x" : "game-turn--ttt-o");
    syncTurnBannerMark(banner, turnMark);
    setTurnLabelKey(game.currentPlayer === "y" ? "game.turnTtt" : "game.opponentTurnTtt");
    return;
  }

  syncTurnBannerMark(banner, null);

  if (game.currentPlayer === "y") {
    if (game.humanChipColor === "red") {
      banner.classList.add("game-turn--disk-red");
      setTurnLabelKey("game.turnRed");
    } else {
      banner.classList.add("game-turn--disk-yellow");
      setTurnLabelKey("game.turnYellow");
    }
  } else if (opponentChipColor() === "red") {
    banner.classList.add("game-turn--disk-red");
    setTurnLabelKey("game.opponentTurnRed");
  } else {
    banner.classList.add("game-turn--disk-yellow");
    setTurnLabelKey("game.opponentTurnYellow");
  }
}

export function updateOutcomeFromServer(lobby) {
  if (lobby.status !== "finished") return;
  stopGameClock();
  game.matchFinished = true;
  game.matchActive = false;
  boardRuntime.syncWinFromLobby(lobby);
  setInMatchUi(false);

  var banner = document.getElementById("gameTurnBanner");
  var myId = game.myTelegramId;
  var iWon = lobby.winnerId && String(lobby.winnerId) === String(myId);
  var isDraw = lobby.winReason === "draw";

  if (banner) {
    banner.classList.remove(
      "game-turn--compact",
      "game-turn--outcome-loss",
      "game-turn--outcome-win",
      "game-turn--outcome-draw",
      "game-turn--disk-yellow",
      "game-turn--disk-red",
      "game-turn--ttt-x",
      "game-turn--ttt-o"
    );
    syncTurnBannerMark(banner, null);
    banner.classList.add("game-turn--compact");
    if (isDraw) banner.classList.add("game-turn--outcome-draw");
    else banner.classList.add(iWon ? "game-turn--outcome-win" : "game-turn--outcome-loss");
  }

  if (isDraw) setTurnLabelKey("game.draw");
  else if (lobby.winReason === "forfeit") {
    setTurnLabelKey(iWon ? "game.forfeitWin" : "game.forfeitLoss");
  } else if (lobby.winReason === "timeout") {
    setTurnLabelKey(iWon ? "game.timeoutWinShort" : "game.timeoutLossShort");
  } else if (lobby.winReason === "tic_tac_toe") {
    setTurnLabelKey(iWon ? "game.winTtt" : "game.lossTtt");
  } else {
    setTurnLabelKey(iWon ? "game.winFour" : "game.lossFour");
  }

  setPostMatchLobbyCtaVisible(true);
  boardRuntime.renderBoard(game.gameType);
}

export function refreshMatchMeta(lobby) {
  var meta = document.getElementById("gameMatchMeta");
  if (!meta) return;
  if (lobby) meta.textContent = formatLobbyMeta(lobby);
  else if (game.lobbyId) {
    meta.textContent = formatLobbyMeta({
      secondsPerPlayer: game.baseSec,
      incrementSeconds: game.incSec,
    });
  }
}
