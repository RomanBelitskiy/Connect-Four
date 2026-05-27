import { GAME_LIST } from "./catalog.js";

var SVG_NS = "http://www.w3.org/2000/svg";

function createTttMarkSvg(kind) {
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "ttt-board__mark-svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("aria-hidden", "true");
  if (kind === "x") {
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "ttt-board__mark-shape ttt-board__mark-shape--x");
    var line1 = document.createElementNS(SVG_NS, "line");
    line1.setAttribute("x1", "16");
    line1.setAttribute("y1", "16");
    line1.setAttribute("x2", "48");
    line1.setAttribute("y2", "48");
    var line2 = document.createElementNS(SVG_NS, "line");
    line2.setAttribute("x1", "48");
    line2.setAttribute("y1", "16");
    line2.setAttribute("x2", "16");
    line2.setAttribute("y2", "48");
    g.appendChild(line1);
    g.appendChild(line2);
    svg.appendChild(g);
  } else {
    var circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("class", "ttt-board__mark-shape ttt-board__mark-shape--o");
    circle.setAttribute("cx", "32");
    circle.setAttribute("cy", "32");
    circle.setAttribute("r", "18");
    svg.appendChild(circle);
  }
  return svg;
}

function tttCell(markKind) {
  var cell = document.createElement("span");
  cell.className = "pick-game-card__ttt-cell";
  if (!markKind) return cell;
  var wrap = document.createElement("span");
  wrap.className = "ttt-board__mark ttt-board__mark--" + (markKind === "x" ? "x" : "o");
  wrap.appendChild(createTttMarkSvg(markKind));
  cell.appendChild(wrap);
  return cell;
}

function renderConnectFourIcon() {
  var icon = document.createElement("span");
  icon.className = "pick-game-card__icon pick-game-card__icon--connect-four";
  icon.setAttribute("aria-hidden", "true");

  var grid = document.createElement("span");
  grid.className = "pick-game-card__c4-grid";

  var layout = [
    ["", "", "y", "r"],
    ["", "r", "y", "r"],
    ["", "", "", "y"],
    ["", "y", "r", "y"],
  ];

  layout.forEach(function (colPieces) {
    var col = document.createElement("span");
    col.className = "pick-game-card__c4-col";
    colPieces.forEach(function (piece) {
      var slot = document.createElement("span");
      slot.className = "pick-game-card__slot";
      if (piece) {
        var disc = document.createElement("span");
        disc.className =
          "pick-game-card__piece pick-game-card__piece--" + (piece === "r" ? "red" : "yellow");
        slot.appendChild(disc);
      }
      col.appendChild(slot);
    });
    grid.appendChild(col);
  });

  icon.appendChild(grid);
  return icon;
}

function renderInfiniteTttIcon() {
  var icon = document.createElement("span");
  icon.className = "pick-game-card__icon pick-game-card__icon--ttt";
  icon.setAttribute("aria-hidden", "true");

  var board = document.createElement("span");
  board.className = "pick-game-card__ttt-board";
  var marks = [null, "x", null, null, "o", null, "x", null, "o"];
  marks.forEach(function (m) {
    board.appendChild(tttCell(m));
  });
  icon.appendChild(board);
  return icon;
}

var iconRenderers = {
  connect_four: renderConnectFourIcon,
  infinite_ttt: renderInfiniteTttIcon,
};

/**
 * Build pick-game grid from catalog (2 columns via CSS).
 * @param {HTMLElement} listEl — <ul class="pick-game-list">
 */
export function renderPickGameList(listEl) {
  if (!listEl) return;
  listEl.innerHTML = "";

  GAME_LIST.forEach(function (def) {
    var item = document.createElement("li");
    item.className = "pick-game-list__item";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pick-game-card";
    btn.setAttribute("data-game-type", def.id);

    var renderIcon = iconRenderers[def.pickIcon];
    if (renderIcon) btn.appendChild(renderIcon());

    var name = document.createElement("span");
    name.className = "pick-game-card__name";
    name.setAttribute("data-i18n", def.labelKey);
    btn.appendChild(name);

    item.appendChild(btn);
    listEl.appendChild(item);
  });
}
