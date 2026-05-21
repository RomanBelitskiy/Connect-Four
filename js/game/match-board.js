import { game, GAME_COLS, GAME_ROWS } from "./state.js";
import { formatClock, formatLobbyMeta, prefersReducedMotion } from "../utils/format.js";

let navigateToTab = function (tab) {
  console.warn("[ConnectFour] navigate not wired:", tab);
};

export function setNavigateToTab(fn) {
  navigateToTab = typeof fn === "function" ? fn : navigateToTab;
}

function normalizeHumanChip(value) {
  return value === "red" ? "red" : "yellow";
}

function opponentChipColor() {
  return game.humanChipColor === "red" ? "yellow" : "red";
}

function syncChipVisuals() {
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
function pieceModifierForDrop(moverKind) {
  if (moverKind === "y") {
    return game.humanChipColor === "red" ? "game-board__piece--red" : "game-board__piece--yellow";
  }
  return opponentChipColor() === "red" ? "game-board__piece--red" : "game-board__piece--yellow";
}

function removeAllDropOverlays() {
  document.querySelectorAll(".game-board__piece--falling-overlay").forEach(function (el) {
    el.remove();
  });
  var board = document.getElementById("gameBoard");
  if (board) board.removeAttribute("data-drop-active");
}

function updateGhostPreviewColumn(board, colBtn) {
  if (!board) return;
  board.querySelectorAll(".game-board__ghost").forEach(function (el) {
    el.remove();
  });

  if (
    !colBtn ||
    colBtn.disabled ||
    game.matchFinished ||
    !game.matchActive ||
    game.currentPlayer !== "y" ||
    board.getAttribute("data-drop-active") === "1"
  ) {
    return;
  }

  var c = parseInt(colBtn.getAttribute("data-col"), 10);
  if (Number.isNaN(c) || game.grid[c].length >= GAME_ROWS) return;

  var rowIndex = game.grid[c].length;
  var slots = colBtn.querySelectorAll(".game-board__slot");
  var targetSlot = slots[rowIndex];
  if (!targetSlot) return;

  var ghost = document.createElement("span");
  ghost.className =
    "game-board__piece " + pieceModifierForDrop("y") + " game-board__ghost";
  ghost.setAttribute("aria-hidden", "true");
  targetSlot.appendChild(ghost);
}

function animatePieceDrop(colIndex, moverKind, done) {
  var board = document.getElementById("gameBoard");
  var finish = typeof done === "function" ? done : function () {};

  if (!board || prefersReducedMotion()) {
    finish();
    return;
  }

  var colBtn = board.querySelector('.game-board__col[data-col="' + colIndex + '"]');
  if (!colBtn || game.grid[colIndex].length >= GAME_ROWS) {
    finish();
    return;
  }

  var rowIndex = game.grid[colIndex].length;
  var slots = colBtn.querySelectorAll(".game-board__slot");
  var targetSlot = slots[rowIndex];
  if (!targetSlot) {
    finish();
    return;
  }

  board.setAttribute("data-drop-active", "1");
  updateGhostPreviewColumn(board, null);

  var cr = colBtn.getBoundingClientRect();
  var sr = targetSlot.getBoundingClientRect();
  var pw = sr.height * 0.78;

  var gapAbove = (function () {
    var raw = getComputedStyle(document.documentElement).getPropertyValue("--spacing-xs").trim();
    var fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    if (raw.endsWith("rem")) return parseFloat(raw) * fs;
    return parseFloat(raw) || 4;
  })();

  var piece = document.createElement("span");
  piece.className =
    "game-board__piece " + pieceModifierForDrop(moverKind) + " game-board__piece--falling-overlay";
  piece.setAttribute("aria-hidden", "true");
  piece.style.width = pw + "px";
  piece.style.height = pw + "px";
  piece.style.left = sr.left + sr.width / 2 - pw / 2 + "px";
  var startTop = cr.top - pw - gapAbove;
  var endTop = sr.top + sr.height / 2 - pw / 2;
  piece.style.top = startTop + "px";
  document.body.appendChild(piece);

  var cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    piece.removeEventListener("transitionend", onTransitionEnd);
    if (piece.parentNode) piece.parentNode.removeChild(piece);
    board.removeAttribute("data-drop-active");
    finish();
  }

  function onTransitionEnd(ev) {
    if (ev.propertyName === "top") cleanup();
  }

  piece.addEventListener("transitionend", onTransitionEnd);

  window.requestAnimationFrame(function () {
    window.requestAnimationFrame(function () {
      piece.style.top = endTop + "px";
    });
  });

  window.setTimeout(function () {
    cleanup();
  }, 900);
}
function resetClocksFromSettings(settings) {
  var allowedBase = [15, 30, 60, 120, 180];
  var baseSec =
    settings && settings.secondsPerPlayer != null
      ? parseInt(String(settings.secondsPerPlayer), 10)
      : 60;
  if (Number.isNaN(baseSec) || allowedBase.indexOf(baseSec) === -1) baseSec = 60;
  var inc =
    settings && settings.incrementSeconds != null
      ? parseInt(String(settings.incrementSeconds), 10)
      : 1;
  if (Number.isNaN(inc) || inc < 0) inc = 0;
  game.clockYellowSec = baseSec;
  game.clockRedSec = baseSec;
  game.incSec = inc;
}

function stopGameClock() {
  if (game.clockTimerId != null) {
    window.clearInterval(game.clockTimerId);
    game.clockTimerId = null;
  }
}

function updateClockDisplay() {
  var yVal = document.getElementById("gameClockYellowValue");
  var rVal = document.getElementById("gameClockRedValue");
  var yPanel = document.getElementById("gameClockYellowPanel");
  var rPanel = document.getElementById("gameClockRedPanel");
  if (yVal) yVal.textContent = formatClock(game.clockYellowSec);
  if (rVal) rVal.textContent = formatClock(game.clockRedSec);
  if (yPanel && rPanel) {
    yPanel.classList.toggle(
      "is-active",
      game.matchActive && !game.matchFinished && game.currentPlayer === "y"
    );
    rPanel.classList.toggle(
      "is-active",
      game.matchActive && !game.matchFinished && game.currentPlayer === "r"
    );
  }
}

function endGameTimeLoss(loser) {
  if (!game.matchActive || game.matchFinished) return;
  stopGameClock();
  game.matchFinished = true;
  game.matchActive = false;
  setInMatchUi(false);
  var banner = document.getElementById("gameTurnBanner");
  var label = document.getElementById("gameTurnLabel");
  if (banner) {
    banner.classList.remove(
      "game-turn--compact",
      "game-turn--outcome-loss",
      "game-turn--outcome-win",
      "game-turn--outcome-draw",
      "game-turn--disk-yellow",
      "game-turn--disk-red"
    );
    banner.classList.add(
      "game-turn--compact",
      loser === "y" ? "game-turn--outcome-loss" : "game-turn--outcome-win"
    );
  }
  if (label) {
    label.textContent =
      loser === "y"
        ? "Час вичерпано — ти програв"
        : "Час суперника вичерпано — твоя перемога";
  }
  renderGameBoardDOM();
  updateClockDisplay();
  setPostMatchLobbyCtaVisible(true);
}

function tickGameClock() {
  if (!game.matchActive || game.matchFinished) return;
  if (game.currentPlayer === "y") {
    game.clockYellowSec = Math.max(0, game.clockYellowSec - 1);
    if (game.clockYellowSec <= 0) {
      endGameTimeLoss("y");
      return;
    }
  } else {
    game.clockRedSec = Math.max(0, game.clockRedSec - 1);
    if (game.clockRedSec <= 0) {
      endGameTimeLoss("r");
      return;
    }
  }
  updateClockDisplay();
}

function startGameClock() {
  stopGameClock();
  game.clockTimerId = window.setInterval(tickGameClock, 1000);
}

function triggerBonusAnim(side) {
  if (game.incSec <= 0) return;
  var id = side === "yellow" ? "gameClockYellowBonus" : "gameClockRedBonus";
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = "+" + game.incSec + " с";
  el.classList.remove("is-pulsing");
  void el.offsetWidth;
  el.classList.add("is-pulsing");
  function onEnd() {
    el.removeEventListener("animationend", onEnd);
    el.classList.remove("is-pulsing");
    el.textContent = "";
  }
  el.addEventListener("animationend", onEnd);
}

function applyIncrementAfterMoveFor(mover) {
  if (!game.matchActive || game.matchFinished) return;
  if (game.incSec <= 0) return;
  if (mover === "y") {
    game.clockYellowSec += game.incSec;
    triggerBonusAnim("yellow");
  } else {
    game.clockRedSec += game.incSec;
    triggerBonusAnim("red");
  }
  updateClockDisplay();
}

function setInMatchUi(on) {
  var root = document.getElementById("app");
  if (root) root.classList.toggle("app--in-match", !!on);
}

function setPostMatchLobbyCtaVisible(visible) {
  var btn = document.getElementById("btnGameReturnLobby");
  var foot = document.querySelector(".game-screen__footer");
  if (btn) {
    if (visible) btn.removeAttribute("hidden");
    else btn.setAttribute("hidden", "");
  }
  if (foot) foot.classList.toggle("game-screen__footer--post-match", !!visible);
}

function scheduleForfeitBannerDismiss(wrap, bannerEl) {
  if (!wrap || !wrap.parentNode || wrap.getAttribute("data-forfeit-exiting") === "1") return;
  wrap.setAttribute("data-forfeit-exiting", "1");

  if (prefersReducedMotion()) {
    wrap.remove();
    return;
  }

  var targetH = wrap.scrollHeight;
  wrap.style.maxHeight = targetH + "px";
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
    if (ev.target !== wrap) return;
    if (ev.propertyName !== "max-height") return;
    teardown();
  }

  wrap.addEventListener("transitionend", onTe);
  window.setTimeout(teardown, 1100);
}

function showForfeitBanner() {
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
  p.textContent =
    "Ти покинув партію до її завершення — це зараховано як поразку.";

  wrap.appendChild(p);

  var pulse = intro.querySelector(".lobby-intro__pulse");
  if (pulse && pulse.nextSibling) intro.insertBefore(wrap, pulse.nextSibling);
  else intro.appendChild(wrap);

  var dismissMs = 7000;
  var timerId = window.setTimeout(function () {
    scheduleForfeitBannerDismiss(wrap, p);
  }, dismissMs);
  wrap.setAttribute("data-dismiss-timer-id", String(timerId));
}

export function maybeForfeitActiveMatch() {
  removeAllDropOverlays();
  var boardForGhost = document.getElementById("gameBoard");
  updateGhostPreviewColumn(boardForGhost, null);

  if (game.matchActive && !game.matchFinished) {
    showForfeitBanner();
  }
  stopGameClock();
  resetClocksFromSettings(null);
  updateClockDisplay();
  resetGameGrid();
  game.currentPlayer = "y";
  game.matchActive = false;
  game.matchFinished = false;
  renderGameBoardDOM();
  updateGameTurnUI();
  setInMatchUi(false);
  setPostMatchLobbyCtaVisible(false);
}

function resetGameGrid() {
  game.grid = [];
  for (var i = 0; i < GAME_COLS; i++) game.grid.push([]);
}

function isBoardFull() {
  return playableColumns().length === 0;
}

function readBoardCell(columnIndex, rowFromBottom) {
  if (
    columnIndex < 0 ||
    columnIndex >= GAME_COLS ||
    rowFromBottom < 0 ||
    rowFromBottom >= GAME_ROWS
  ) {
    return null;
  }
  if (game.grid[columnIndex].length <= rowFromBottom) return null;
  return game.grid[columnIndex][rowFromBottom];
}

function checkWinnerForLastMove(moveColumn) {
  var rowIdx = game.grid[moveColumn].length - 1;
  var piece = readBoardCell(moveColumn, rowIdx);
  if (piece !== "y" && piece !== "r") return null;

  function arm(dc, dr) {
    var n = 0;
    var c = moveColumn + dc;
    var r = rowIdx + dr;
    while (readBoardCell(c, r) === piece) {
      n++;
      c += dc;
      r += dr;
    }
    return n;
  }

  var lineDefs = [
    [
      [-1, 0],
      [1, 0],
    ],
    [
      [0, -1],
      [0, 1],
    ],
    [
      [-1, -1],
      [1, 1],
    ],
    [
      [-1, 1],
      [1, -1],
    ],
  ];

  var d = 0;
  for (; d < lineDefs.length; d++) {
    var a = lineDefs[d][0];
    var b = lineDefs[d][1];
    var total = 1 + arm(a[0], a[1]) + arm(b[0], b[1]);
    if (total >= 4) return piece;
  }
  return null;
}

function finalizeMatchWinner(winner) {
  if (game.matchFinished) return;
  stopGameClock();
  game.matchFinished = true;
  game.matchActive = false;
  setInMatchUi(false);
  var banner = document.getElementById("gameTurnBanner");
  var label = document.getElementById("gameTurnLabel");
  var humanLost = winner === "r";

  if (banner) {
    banner.classList.remove(
      "game-turn--compact",
      "game-turn--outcome-loss",
      "game-turn--outcome-win",
      "game-turn--outcome-draw",
      "game-turn--disk-yellow",
      "game-turn--disk-red"
    );
    banner.classList.add(
      "game-turn--compact",
      humanLost ? "game-turn--outcome-loss" : "game-turn--outcome-win"
    );
  }
  if (label) {
    label.textContent = humanLost
      ? "Суперник зібрав чотири в ряд!"
      : "Твоя перемога — чотири в ряд!";
  }
  renderGameBoardDOM();
  updateClockDisplay();
  setPostMatchLobbyCtaVisible(true);
}

function finalizeMatchIfBoardFull() {
  if (!isBoardFull()) return false;
  if (!game.matchFinished) {
    stopGameClock();
    game.matchFinished = true;
    game.matchActive = false;
    setInMatchUi(false);
    var label = document.getElementById("gameTurnLabel");
    if (label) label.textContent = "Нічия — поле заповнене";
    var drawBanner = document.getElementById("gameTurnBanner");
    if (drawBanner) {
      drawBanner.classList.remove(
        "game-turn--compact",
        "game-turn--outcome-loss",
        "game-turn--outcome-win",
        "game-turn--outcome-draw",
        "game-turn--disk-yellow",
        "game-turn--disk-red"
      );
      drawBanner.classList.add("game-turn--compact", "game-turn--outcome-draw");
    }
    renderGameBoardDOM();
    updateClockDisplay();
    setPostMatchLobbyCtaVisible(true);
  }
  return true;
}
function updateGameTurnUI() {
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
    "game-turn--disk-red"
  );
  if (game.currentPlayer === "y") {
    if (game.humanChipColor === "red") {
      banner.classList.add("game-turn--disk-red");
      label.textContent = "Твій хід — червоні фішки";
    } else {
      banner.classList.add("game-turn--disk-yellow");
      label.textContent = "Твій хід — жовті фішки";
    }
  } else {
    if (opponentChipColor() === "red") {
      banner.classList.add("game-turn--disk-red");
      label.textContent = "Хід суперника — червоні фішки";
    } else {
      banner.classList.add("game-turn--disk-yellow");
      label.textContent = "Хід суперника — жовті фішки";
    }
  }
}

function playableColumns() {
  var list = [];
  for (var i = 0; i < GAME_COLS; i++) if (game.grid[i].length < GAME_ROWS) list.push(i);
  return list;
}

function renderGameBoardDOM() {
  var board = document.getElementById("gameBoard");
  if (!board) return;
  board.innerHTML = "";

  for (var c = 0; c < GAME_COLS; c++) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-board__col";
    btn.setAttribute("data-col", String(c));
    btn.setAttribute("aria-label", "Колонка " + (c + 1));
    var full = game.grid[c].length >= GAME_ROWS;
    if (full) btn.classList.add("game-board__col--full");
    btn.disabled = full || game.currentPlayer !== "y" || !game.matchActive;

    for (var ri = 0; ri < GAME_ROWS; ri++) {
      var slot = document.createElement("span");
      slot.className = "game-board__slot";
      var pieceKind = game.grid[c][ri];
      if (pieceKind === "y") {
        var py = document.createElement("span");
        py.className = "game-board__piece " + pieceModifierForDrop("y");
        py.setAttribute("aria-hidden", "true");
        slot.appendChild(py);
      } else if (pieceKind === "r") {
        var pr = document.createElement("span");
        pr.className = "game-board__piece " + pieceModifierForDrop("r");
        pr.setAttribute("aria-hidden", "true");
        slot.appendChild(pr);
      }
      btn.appendChild(slot);
    }
    board.appendChild(btn);
  }
}

function scheduleMockRedMove() {
  var playable = playableColumns();
  if (!playable.length || game.currentPlayer !== "r") return;
  window.setTimeout(function () {
    if (game.currentPlayer !== "r") return;
    var cols = playableColumns();
    if (!cols.length) return;
    var c = cols[Math.floor(Math.random() * cols.length)];
    animatePieceDrop(c, "r", function () {
      game.grid[c].push("r");
      renderGameBoardDOM();
      applyIncrementAfterMoveFor("r");
      var winR = checkWinnerForLastMove(c);
      if (winR) {
        finalizeMatchWinner(winR);
        return;
      }
      if (finalizeMatchIfBoardFull()) return;
      game.currentPlayer = "y";
      renderGameBoardDOM();
      updateGameTurnUI();
      updateClockDisplay();
    });
  }, 420);
}

export function bindGameBoardInteractions() {
  var board = document.getElementById("gameBoard");
  if (!board || board.dataset.bound === "1") return;
  board.dataset.bound = "1";

  board.addEventListener("mousemove", function (ev) {
    if (board.getAttribute("data-drop-active") === "1") return;
    var colBtn = ev.target.closest(".game-board__col");
    updateGhostPreviewColumn(board, colBtn);
  });

  board.addEventListener("mouseleave", function () {
    updateGhostPreviewColumn(board, null);
  });

  board.addEventListener("click", function (ev) {
    var colBtn = ev.target.closest(".game-board__col");
    if (!colBtn || game.currentPlayer !== "y" || !game.matchActive || game.matchFinished) return;
    if (board.getAttribute("data-drop-active") === "1") return;
    var c = parseInt(colBtn.getAttribute("data-col"), 10);
    if (Number.isNaN(c) || game.grid[c].length >= GAME_ROWS) return;

    animatePieceDrop(c, "y", function () {
      game.grid[c].push("y");
      renderGameBoardDOM();
      applyIncrementAfterMoveFor("y");
      var winY = checkWinnerForLastMove(c);
      if (winY) {
        finalizeMatchWinner(winY);
        return;
      }
      if (finalizeMatchIfBoardFull()) return;
      game.currentPlayer = "r";
      renderGameBoardDOM();
      updateGameTurnUI();
      updateClockDisplay();
      scheduleMockRedMove();
    });
export function openGameFromNewLobby(settings) {
  game.matchActive = true;
  game.matchFinished = false;
  setInMatchUi(true);
  resetGameGrid();
  game.currentPlayer = "y";
  game.humanChipColor = normalizeHumanChip(settings && settings.playerChipColor);
  var turnBanner = document.getElementById("gameTurnBanner");
  if (turnBanner) {
    turnBanner.classList.remove(
      "game-turn--compact",
      "game-turn--outcome-loss",
      "game-turn--outcome-win",
      "game-turn--outcome-draw"
    );
  }
  setPostMatchLobbyCtaVisible(false);
  syncChipVisuals();
  var meta = document.getElementById("gameMatchMeta");
  if (meta) meta.textContent = formatLobbyMeta(settings);
  resetClocksFromSettings(settings);
  renderGameBoardDOM();
  updateGameTurnUI();
  updateClockDisplay();
  startGameClock();
  navigateToTab("game");
  window.setTimeout(function () {
    var first = document.querySelector("#gameBoard .game-board__col:not(:disabled)");
    if (first && typeof first.focus === "function") first.focus({ preventScroll: true });
  }, 80);
}
export function primeGamePresentation() {
  resetGameGrid();
  resetClocksFromSettings(null);
  renderGameBoardDOM();
  updateGameTurnUI();
  updateClockDisplay();
  syncChipVisuals();
  bindGameBoardInteractions();
}
