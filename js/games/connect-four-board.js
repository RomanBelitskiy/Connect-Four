import { game, GAME_COLS, GAME_ROWS } from "../game/state.js";
import { prefersReducedMotion } from "../utils/format.js";
import { t } from "../i18n/index.js";
import { pieceModifierForDrop } from "../game/match-chips.js";
import { isHumanTurn } from "../game/match-clock.js";

export function resetGrid() {
  game.grid = [];
  for (var i = 0; i < GAME_COLS; i++) game.grid.push([]);
}

export function serverGridToLocal(serverGrid, myRole) {
  var local = [];
  for (var c = 0; c < GAME_COLS; c++) {
    local[c] = [];
    var col = (serverGrid && serverGrid[c]) || [];
    for (var i = 0; i < col.length; i++) {
      var p = col[i];
      if (p === "h") local[c].push(myRole === "host" ? "y" : "r");
      else if (p === "g") local[c].push(myRole === "guest" ? "y" : "r");
    }
  }
  return local;
}

export function serverGridToHostGuest(serverGrid, hostChipColor) {
  var local = [];
  var hostIsYellow = hostChipColor !== "red";
  for (var c = 0; c < GAME_COLS; c++) {
    local[c] = [];
    var col = (serverGrid && serverGrid[c]) || [];
    for (var i = 0; i < col.length; i++) {
      var p = col[i];
      if (p === "h") local[c].push(hostIsYellow ? "y" : "r");
      else if (p === "g") local[c].push(hostIsYellow ? "r" : "y");
    }
  }
  return local;
}

export function syncGridFromLobby(lobby) {
  game.tttState = null;
  if (lobby.myRole === "spectator") {
    game.grid = serverGridToHostGuest(lobby.grid, lobby.hostChipColor);
  } else {
    game.grid = serverGridToLocal(lobby.grid, lobby.myRole);
  }
}

export function syncWinFromLobby(lobby) {
  if (
    lobby &&
    lobby.status === "finished" &&
    lobby.winReason === "connect4" &&
    lobby.winLine &&
    lobby.winLine.length
  ) {
    game.winLine = lobby.winLine;
  } else {
    game.winLine = null;
  }
  game.winCells = null;
}

export function cloneGrid(grid) {
  return grid.map(function (col) {
    return col.slice();
  });
}

export function cloneState() {
  return cloneGrid(game.grid);
}

export function hasAnyPieces() {
  for (var c = 0; c < game.grid.length; c++) {
    if (game.grid[c] && game.grid[c].length > 0) return true;
  }
  return false;
}

export function removeAllDropOverlays() {
  document.querySelectorAll(".game-board__piece--falling-overlay").forEach(function (el) {
    el.remove();
  });
  var board = document.getElementById("gameBoard");
  if (board) board.removeAttribute("data-drop-active");
}

function getPieceDropDurationMs() {
  var raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--motion-piece-drop-duration")
    .trim();
  if (raw.endsWith("ms")) return parseFloat(raw) || 260;
  if (raw.endsWith("s")) return (parseFloat(raw) || 0.26) * 1000;
  return 260;
}

function slotHasPlacedPiece(col, row) {
  var board = document.getElementById("gameBoard");
  if (!board) return false;
  var colBtn = board.querySelector('.game-board__col[data-col="' + col + '"]');
  if (!colBtn) return false;
  var slots = colBtn.querySelectorAll(".game-board__slot");
  var slot = slots[row];
  if (!slot) return false;
  var piece = slot.querySelector(".game-board__piece");
  return !!(piece && !piece.classList.contains("game-board__ghost"));
}

function placePieceInSlot(col, row, moverKind) {
  var board = document.getElementById("gameBoard");
  if (!board) return false;
  var colBtn = board.querySelector('.game-board__col[data-col="' + col + '"]');
  if (!colBtn) return false;
  var slots = colBtn.querySelectorAll(".game-board__slot");
  var slot = slots[row];
  if (!slot) return false;
  if (slot.querySelector(".game-board__piece")) return true;
  var span = document.createElement("span");
  span.className = "game-board__piece " + pieceModifierForDrop(moverKind);
  span.setAttribute("aria-hidden", "true");
  slot.appendChild(span);
  return true;
}

function animatePieceDrop(colIndex, rowIndex, moverKind, done) {
  var board = document.getElementById("gameBoard");
  var finish = typeof done === "function" ? done : function () {};

  if (!board) {
    placePieceInSlot(colIndex, rowIndex, moverKind);
    finish();
    return;
  }

  if (slotHasPlacedPiece(colIndex, rowIndex)) {
    finish();
    return;
  }

  if (prefersReducedMotion()) {
    placePieceInSlot(colIndex, rowIndex, moverKind);
    finish();
    return;
  }

  var colBtn = board.querySelector('.game-board__col[data-col="' + colIndex + '"]');
  if (!colBtn) {
    placePieceInSlot(colIndex, rowIndex, moverKind);
    finish();
    return;
  }

  var slots = colBtn.querySelectorAll(".game-board__slot");
  var targetSlot = slots[rowIndex];
  if (!targetSlot) {
    placePieceInSlot(colIndex, rowIndex, moverKind);
    finish();
    return;
  }

  board.setAttribute("data-drop-active", "1");
  updateGhostPreviewColumn(board, null);

  var slotRect = targetSlot.getBoundingClientRect();
  var pw = slotRect.width * 0.78;
  var gapAbove = (function () {
    var raw = getComputedStyle(document.documentElement).getPropertyValue("--spacing-xs").trim();
    var fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    if (raw.endsWith("rem")) return parseFloat(raw) * fs;
    return parseFloat(raw) || 4;
  })();

  var startTop = colBtn.getBoundingClientRect().top - pw - gapAbove;
  var endTop = slotRect.top + slotRect.height / 2 - pw / 2;
  var dropDistance = endTop - startTop;

  var piece = document.createElement("span");
  piece.className =
    "game-board__piece " + pieceModifierForDrop(moverKind) + " game-board__piece--falling-overlay";
  piece.setAttribute("aria-hidden", "true");
  piece.style.width = pw + "px";
  piece.style.height = pw + "px";
  piece.style.left = slotRect.left + slotRect.width / 2 - pw / 2 + "px";
  piece.style.top = startTop + "px";
  document.body.appendChild(piece);

  var cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    piece.removeEventListener("transitionend", onTransitionEnd);
    if (piece.parentNode) piece.parentNode.removeChild(piece);
    board.removeAttribute("data-drop-active");
    placePieceInSlot(colIndex, rowIndex, moverKind);
    finish();
  }

  function onTransitionEnd(ev) {
    if (ev.target !== piece || ev.propertyName !== "transform") return;
    cleanup();
  }

  piece.addEventListener("transitionend", onTransitionEnd);

  window.requestAnimationFrame(function () {
    piece.style.setProperty("--drop-distance", dropDistance + "px");
    window.requestAnimationFrame(function () {
      piece.classList.add("is-dropping");
    });
  });

  window.setTimeout(cleanup, getPieceDropDurationMs() + 48);
}

export function updateGhostPreviewColumn(board, colBtn) {
  if (!board) return;
  board.querySelectorAll(".game-board__ghost").forEach(function (el) {
    el.remove();
  });

  if (
    !colBtn ||
    colBtn.disabled ||
    game.matchFinished ||
    !game.matchActive ||
    !isHumanTurn() ||
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
  ghost.className = "game-board__piece " + pieceModifierForDrop("y") + " game-board__ghost";
  ghost.setAttribute("aria-hidden", "true");
  targetSlot.appendChild(ghost);
}

function gridsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var c = 0; c < a.length; c++) {
    var ac = a[c] || [];
    var bc = b[c] || [];
    if (ac.length !== bc.length) return false;
    for (var i = 0; i < ac.length; i++) if (ac[i] !== bc[i]) return false;
  }
  return true;
}

function findNewPieceMove(prevGrid, newGrid) {
  if (!prevGrid || !newGrid) return null;
  var col = -1;
  for (var c = 0; c < GAME_COLS; c++) {
    var oLen = (prevGrid[c] && prevGrid[c].length) || 0;
    var nLen = (newGrid[c] && newGrid[c].length) || 0;
    if (nLen > oLen) {
      if (col >= 0 || nLen - oLen !== 1) return null;
      col = c;
    } else if (nLen < oLen) {
      return null;
    }
  }
  if (col < 0) return null;
  return { col: col, row: newGrid[col].length - 1, piece: newGrid[col][newGrid[col].length - 1] };
}

function boardHasColumns() {
  var board = document.getElementById("gameBoard");
  return !!(board && board.querySelector(".game-board__col"));
}

function updateBoardColumnStates() {
  var board = document.getElementById("gameBoard");
  if (!board) return;
  for (var c = 0; c < GAME_COLS; c++) {
    var btn = board.querySelector('.game-board__col[data-col="' + c + '"]');
    if (!btn) continue;
    var full = game.grid[c].length >= GAME_ROWS;
    btn.classList.toggle("game-board__col--full", full);
    btn.disabled =
      full || !isHumanTurn() || !game.matchActive || game.matchFinished || game.waiting;
  }
}

export function clearWinLineOverlay() {
  var frame = document.querySelector(".game-board__frame");
  if (!frame) return;
  var svg = frame.querySelector(".game-board__win-line");
  if (svg) svg.remove();
}

function winLineRoundedRectPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return (
    "M " +
    (x + r) +
    " " +
    y +
    " H " +
    (x + w - r) +
    " A " +
    r +
    " " +
    r +
    " 0 0 1 " +
    (x + w) +
    " " +
    (y + r) +
    " V " +
    (y + h - r) +
    " A " +
    r +
    " " +
    r +
    " 0 0 1 " +
    (x + w - r) +
    " " +
    (y + h) +
    " H " +
    (x + r) +
    " A " +
    r +
    " " +
    r +
    " 0 0 1 " +
    x +
    " " +
    (y + h - r) +
    " V " +
    (y + r) +
    " A " +
    r +
    " " +
    r +
    " 0 0 1 " +
    (x + r) +
    " " +
    y +
    " Z"
  );
}

function updateWinLineOverlay() {
  clearWinLineOverlay();
  var board = document.getElementById("gameBoard");
  var frame = board && board.parentElement;
  if (!board || !frame || !game.matchFinished || !game.winLine || game.winLine.length < 4) return;

  var boardRect = board.getBoundingClientRect();
  if (!boardRect.width || !boardRect.height) return;

  var centers = [];
  var slotSize = 0;
  var minX = Infinity;
  var minY = Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;

  for (var i = 0; i < game.winLine.length; i++) {
    var cell = game.winLine[i];
    var colBtn = board.querySelector('.game-board__col[data-col="' + cell.col + '"]');
    if (!colBtn) return;
    var slots = colBtn.querySelectorAll(".game-board__slot");
    var slot = slots[cell.row];
    if (!slot) return;
    var slotRect = slot.getBoundingClientRect();
    if (!slotSize) slotSize = slotRect.width;
    var left = slotRect.left - boardRect.left;
    var top = slotRect.top - boardRect.top;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, slotRect.right - boardRect.left);
    maxY = Math.max(maxY, slotRect.bottom - boardRect.top);
    centers.push({ x: left + slotRect.width / 2, y: top + slotRect.height / 2 });
  }
  if (centers.length < 4) return;

  var pad = slotSize * 0.11;
  var pieceDiam = slotSize * 0.78;
  var dCol = Math.abs(game.winLine[3].col - game.winLine[0].col);
  var dRow = Math.abs(game.winLine[3].row - game.winLine[0].row);

  var svgNs = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "game-board__win-line");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 " + boardRect.width + " " + boardRect.height);

  var path = document.createElementNS(svgNs, "path");
  var d;

  if (dCol === 0 || dRow === 0) {
    d = winLineRoundedRectPath(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, Math.min(maxX - minX + pad * 2, maxY - minY + pad * 2) / 2);
  } else {
    var p0 = centers[0];
    var p3 = centers[3];
    var cx = (p0.x + p3.x) / 2;
    var cy = (p0.y + p3.y) / 2;
    var dx = p3.x - p0.x;
    var dy = p3.y - p0.y;
    var span = Math.sqrt(dx * dx + dy * dy);
    var len = span + pieceDiam + pad * 2;
    var thick = pieceDiam + pad * 2;
    var angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    var g = document.createElementNS(svgNs, "g");
    g.setAttribute("transform", "translate(" + cx + " " + cy + ") rotate(" + angleDeg + ")");
    path.setAttribute("d", winLineRoundedRectPath(-len / 2, -thick / 2, len, thick, thick / 2));
    g.appendChild(path);
    svg.appendChild(g);
    frame.appendChild(svg);
    return;
  }

  path.setAttribute("d", d);
  svg.appendChild(path);
  frame.appendChild(svg);
}

export function applyPatch(prevGrid) {
  if (!boardHasColumns()) return false;

  if (gridsEqual(prevGrid, game.grid)) {
    updateBoardColumnStates();
    return true;
  }

  var move = findNewPieceMove(prevGrid, game.grid);
  if (!move) return false;

  var board = document.getElementById("gameBoard");
  var humanOwnMove = move.piece === "y" && game.myRole !== "spectator";

  if (board && board.getAttribute("data-drop-active") === "1" && humanOwnMove) {
    updateBoardColumnStates();
    return true;
  }

  if (humanOwnMove && slotHasPlacedPiece(move.col, move.row)) {
    updateBoardColumnStates();
    if (game.matchFinished && game.winLine) {
      requestAnimationFrame(updateWinLineOverlay);
    }
    return true;
  }

  animatePieceDrop(move.col, move.row, move.piece, function () {
    updateBoardColumnStates();
    if (game.matchFinished && game.winLine) {
      requestAnimationFrame(updateWinLineOverlay);
    }
  });
  return true;
}

export function renderBoard() {
  var board = document.getElementById("gameBoard");
  if (!board) return;
  board.className = "game-board";
  board.innerHTML = "";
  clearWinLineOverlay();

  for (var c = 0; c < GAME_COLS; c++) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "game-board__col";
    btn.setAttribute("data-col", String(c));
    btn.setAttribute("aria-label", t("game.columnAria", { n: c + 1 }));
    var full = game.grid[c].length >= GAME_ROWS;
    if (full) btn.classList.add("game-board__col--full");
    btn.disabled = full || !isHumanTurn() || !game.matchActive || game.matchFinished || game.waiting;

    for (var ri = 0; ri < GAME_ROWS; ri++) {
      var slot = document.createElement("span");
      slot.className = "game-board__slot";
      var pieceKind = game.grid[c][ri];
      if (pieceKind === "y" || pieceKind === "r") {
        var p = document.createElement("span");
        p.className = "game-board__piece " + pieceModifierForDrop(pieceKind);
        p.setAttribute("aria-hidden", "true");
        slot.appendChild(p);
      }
      btn.appendChild(slot);
    }
    board.appendChild(btn);
  }

  if (game.matchFinished && game.winLine && game.winLine.length >= 4) {
    requestAnimationFrame(updateWinLineOverlay);
  }
}

/**
 * @param {(column: number) => void} onColumnClick
 */
export function bindColumnInteractions(onColumnClick) {
  var board = document.getElementById("gameBoard");
  if (!board || board.dataset.c4Bound === "1") return;
  board.dataset.c4Bound = "1";

  board.addEventListener("mousemove", function (ev) {
    if (board.getAttribute("data-drop-active") === "1") return;
    updateGhostPreviewColumn(board, ev.target.closest(".game-board__col"));
  });

  board.addEventListener("mouseleave", function () {
    updateGhostPreviewColumn(board, null);
  });

  board.addEventListener("click", function (ev) {
    var colBtn = ev.target.closest(".game-board__col");
    if (!colBtn || !isHumanTurn() || !game.matchActive || game.matchFinished || game.waiting) return;
    if (board.getAttribute("data-drop-active") === "1") return;
    var c = parseInt(colBtn.getAttribute("data-col"), 10);
    if (Number.isNaN(c) || game.grid[c].length >= GAME_ROWS || !game.lobbyId) return;
    onColumnClick(c);
  });
}
