import { game } from "../game/state.js";
import { t } from "../i18n/index.js";
import { submitMove, syncLobby } from "../api/client.js";
import { notifyLobbyState } from "../api/ws.js";
import { markOptimisticMove } from "../game/move-guard.js";
import {
  chipColorToTttMark,
  guestChipColorFromGame,
  hostChipColorFromGame,
} from "../game/match-chips.js";

var SIZE = 3;
var CELLS = 9;
var SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @param {object} serverState
 * @param {{ myRole?: string, hostChipColor?: string }} context
 */
export function serverStateToLocal(serverState, context) {
  var cells = (serverState && serverState.cells) || [];
  var myRole = context.myRole;
  var hostChipColor = context.hostChipColor;
  var local = [];
  for (var i = 0; i < CELLS; i++) {
    var p = cells[i];
    if (!p) {
      local.push(null);
      continue;
    }
    if (myRole === "spectator") {
      var hostIsYellow = hostChipColor !== "red";
      if (p === "h") local.push(hostIsYellow ? "y" : "r");
      else local.push(hostIsYellow ? "r" : "y");
    } else if (p === "h") {
      local.push(myRole === "host" ? "y" : "r");
    } else {
      local.push(myRole === "guest" ? "y" : "r");
    }
  }
  return {
    cells: local,
    hostOrder: (serverState && serverState.hostOrder) || [],
    guestOrder: (serverState && serverState.guestOrder) || [],
  };
}

function cloneTttState(state) {
  if (!state) return null;
  return {
    cells: state.cells.slice(),
    hostOrder: state.hostOrder.slice(),
    guestOrder: state.guestOrder.slice(),
  };
}

function tttMarkLetter(color) {
  return chipColorToTttMark(color) === "x" ? "X" : "O";
}

function markSymbol(localMark, myRole, serverPiece) {
  var hostMark = tttMarkLetter(hostChipColorFromGame());
  var guestMark = tttMarkLetter(guestChipColorFromGame());
  if (myRole === "spectator") {
    return serverPiece === "h" ? hostMark : guestMark;
  }
  if (myRole === "guest") {
    return localMark === "y" ? guestMark : hostMark;
  }
  return localMark === "y" ? hostMark : guestMark;
}

function serverPieceForLocal(localMark, myRole) {
  if (myRole === "host") return localMark === "y" ? "h" : "g";
  if (myRole === "guest") return localMark === "y" ? "g" : "h";
  var hostIsYellow = game.humanChipColor !== "red";
  if (localMark === "y") return hostIsYellow ? "h" : "g";
  return hostIsYellow ? "g" : "h";
}

function fadingCellIndex(state, piece) {
  if (!state) return -1;
  var order = piece === "h" ? state.hostOrder : state.guestOrder;
  if (order.length >= 3) return order[0];
  return -1;
}

function createMarkSvg(symbol, fading, extraClass) {
  var wrap = document.createElement("span");
  wrap.className =
    "ttt-board__mark " +
    (symbol === "X" ? "ttt-board__mark--x" : "ttt-board__mark--o") +
    (extraClass ? " " + extraClass : "");
  if (fading) wrap.classList.add("ttt-board__mark--fading");

  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("class", "ttt-board__mark-svg");
  svg.setAttribute("aria-hidden", "true");

  if (symbol === "X") {
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "ttt-board__mark-shape ttt-board__mark-shape--x");
    [
      { x1: 16, y1: 16, x2: 48, y2: 48 },
      { x1: 48, y1: 16, x2: 16, y2: 48 },
    ].forEach(function (line) {
      var el = document.createElementNS(SVG_NS, "line");
      el.setAttribute("x1", String(line.x1));
      el.setAttribute("y1", String(line.y1));
      el.setAttribute("x2", String(line.x2));
      el.setAttribute("y2", String(line.y2));
      g.appendChild(el);
    });
    svg.appendChild(g);
  } else {
    var circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("class", "ttt-board__mark-shape ttt-board__mark-shape--o");
    circle.setAttribute("cx", "32");
    circle.setAttribute("cy", "32");
    circle.setAttribute("r", "18");
    svg.appendChild(circle);
  }

  wrap.appendChild(svg);
  return wrap;
}

function isHumanTurn() {
  if (game.myRole === "spectator") return false;
  return game.currentPlayer === "y";
}

export function createTttMarkElement(symbol, options) {
  options = options || {};
  return createMarkSvg(symbol, options.fading, options.extraClass || "");
}

function cellsOrOrdersChanged(a, b) {
  if (!a || !b) return true;
  for (var i = 0; i < CELLS; i++) {
    if (a.cells[i] !== b.cells[i]) return true;
  }
  return (
    a.hostOrder.join(",") !== b.hostOrder.join(",") ||
    a.guestOrder.join(",") !== b.guestOrder.join(",")
  );
}

function updateTttCellButton(btn, cellIdx, state, myRole) {
  var mark = state.cells[cellIdx];
  btn.innerHTML = "";
  if (mark) {
    var serverPiece = serverPieceForLocal(mark, myRole);
    var fading = fadingCellIndex(state, serverPiece) === cellIdx;
    btn.appendChild(createMarkSvg(markSymbol(mark, myRole, serverPiece), fading));
  }
  btn.disabled =
    !!mark || !isHumanTurn() || !game.matchActive || game.matchFinished || game.waiting;
}

function refreshTttBoardCells(board) {
  if (!board || !game.tttState) return;
  board.querySelectorAll(".ttt-board__cell").forEach(function (btn) {
    var idx = parseInt(btn.getAttribute("data-cell"), 10);
    if (!Number.isNaN(idx)) updateTttCellButton(btn, idx, game.tttState, game.myRole);
  });
}

/** Миттєво показує свій хід до відповіді сервера. */
export function applyOptimisticTttMove(cellIdx) {
  if (!game.tttState || game.tttState.cells[cellIdx]) return false;

  var orderKey = game.myRole === "host" ? "hostOrder" : "guestOrder";
  var order = game.tttState[orderKey];
  if (order.length >= 3) {
    var oldest = order.shift();
    game.tttState.cells[oldest] = null;
  }
  game.tttState.cells[cellIdx] = "y";
  order.push(cellIdx);
  game.currentPlayer = "r";

  var board = document.getElementById("gameBoard");
  if (!board || !board.querySelector(".ttt-board__cell")) {
    renderBoard();
    return true;
  }
  refreshTttBoardCells(board);
  markOptimisticMove();
  return true;
}

export function renderBoard() {
  var board = document.getElementById("gameBoard");
  if (!board || !game.tttState) return;

  board.innerHTML = "";
  board.className = "game-board game-board--ttt";
  clearWinHighlight();

  var state = game.tttState;
  var myRole = game.myRole;

  for (var i = 0; i < CELLS; i++) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ttt-board__cell";
    btn.setAttribute("data-cell", String(i));
    btn.setAttribute("aria-label", t("game.tttCellAria", { n: i + 1 }));

    var mark = state.cells[i];
    if (mark) {
      var serverPiece = serverPieceForLocal(mark, myRole);
      var symbol = markSymbol(mark, myRole, serverPiece);
      var fading = fadingCellIndex(state, serverPiece) === i;
      btn.appendChild(createMarkSvg(symbol, fading));
    }

    btn.disabled =
      !!mark || !isHumanTurn() || !game.matchActive || game.matchFinished || game.waiting;
    board.appendChild(btn);
  }

  if (game.matchFinished && game.winCells && game.winCells.length) {
    requestAnimationFrame(updateWinHighlight);
  }
}

export function applyPatch(prevState) {
  if (!game.tttState) return false;

  var board = document.getElementById("gameBoard");
  if (!board || !board.querySelector(".ttt-board__cell")) {
    renderBoard();
    return true;
  }

  if (!prevState || cellsOrOrdersChanged(prevState, game.tttState)) {
    refreshTttBoardCells(board);
  }

  if (game.matchFinished && game.winCells && game.winCells.length) {
    requestAnimationFrame(updateWinHighlight);
  }
  return true;
}

export function syncWinFromLobby(lobby) {
  if (
    lobby &&
    lobby.status === "finished" &&
    lobby.winReason === "tic_tac_toe" &&
    lobby.winCells &&
    lobby.winCells.length
  ) {
    game.winCells = lobby.winCells;
  } else {
    game.winCells = null;
  }
  game.winLine = null;
}

export function clearWinHighlight() {
  var board = document.getElementById("gameBoard");
  if (!board) return;
  board.querySelectorAll(".ttt-board__cell--win").forEach(function (el) {
    el.classList.remove("ttt-board__cell--win");
  });
}

export function updateWinHighlight() {
  clearWinHighlight();
  if (!game.winCells || !game.winCells.length) return;
  var board = document.getElementById("gameBoard");
  if (!board) return;
  game.winCells.forEach(function (cell) {
    var idx = cell.row * SIZE + cell.col;
    var el = board.querySelector('.ttt-board__cell[data-cell="' + idx + '"]');
    if (el) el.classList.add("ttt-board__cell--win");
  });
}

function requestResync() {
  if (!game.lobbyId) return;
  syncLobby(game.lobbyId)
    .then(function (lobby) {
      if (lobby) notifyLobbyState(lobby);
    })
    .catch(function () {});
}

export function bindBoardInteractions() {
  var board = document.getElementById("gameBoard");
  if (!board || board.dataset.tttBound === "1") return;
  board.dataset.tttBound = "1";

  if (!window.__tttWsErrorBound) {
    window.__tttWsErrorBound = true;
    window.addEventListener("lobby-ws-error", function () {
      requestResync();
    });
  }

  board.addEventListener("click", function (ev) {
    var cellBtn = ev.target.closest(".ttt-board__cell");
    if (!cellBtn || !isHumanTurn() || !game.matchActive || game.matchFinished || game.waiting) return;
    var idx = parseInt(cellBtn.getAttribute("data-cell"), 10);
    if (Number.isNaN(idx) || !game.lobbyId) return;
    if (game.tttState && game.tttState.cells[idx]) return;

    applyOptimisticTttMove(idx);

    submitMove(game.lobbyId, { cell: idx })
      .then(function (result) {
        if (!result) {
          requestResync();
          return;
        }
        if (result.viaWs) return;
        if (result.lobby) notifyLobbyState(result.lobby);
      })
      .catch(function (err) {
        console.warn("[move]", err.message || err);
        requestResync();
      });
  });
}

export function cloneState(state) {
  return cloneTttState(state);
}

export function emptyLocalState() {
  return { cells: new Array(CELLS).fill(null), hostOrder: [], guestOrder: [] };
}
