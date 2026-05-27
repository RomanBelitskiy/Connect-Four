/**
 * Single registry for mini-games. To add a game:
 * 1. Add an entry here (id, i18n keys, chipMode, gridShape, pickIcon).
 * 2. Implement server engine in server/games/<name>.py and register in server/games/registry.py.
 * 3. Add a pick-card renderer in pick-game-render.js (or reuse pickIcon).
 * 4. Add client board module in js/games/ if needed, wire in index.js modules map.
 * 5. Add translation keys in js/i18n/translations.js.
 */

import * as infiniteTttBoard from "./infinite-ttt-board.js";

/** @typedef {"disc"|"marks"} ChipMode */
/** @typedef {"columns"|"cells"} GridShape */

/**
 * @typedef {object} GameDefinition
 * @property {string} id
 * @property {string} labelKey
 * @property {string} titleKey
 * @property {string} hintKey
 * @property {ChipMode} chipMode
 * @property {GridShape} gridShape
 * @property {string} pickIcon
 * @property {string} [winReason] — server win_reason when match ends
 * @property {object|null} [boardModule]
 */

/** @type {GameDefinition[]} */
export var GAME_LIST = [
  {
    id: "connect_four",
    labelKey: "game.connectFour",
    titleKey: "game.title",
    hintKey: "game.hint",
    chipMode: "disc",
    gridShape: "columns",
    pickIcon: "connect_four",
    winReason: "connect4",
    boardModule: null,
  },
  {
    id: "infinite_ttt",
    labelKey: "game.infiniteTtt",
    titleKey: "game.titleTtt",
    hintKey: "game.hintTtt",
    chipMode: "marks",
    gridShape: "cells",
    pickIcon: "infinite_ttt",
    winReason: "tic_tac_toe",
    boardModule: infiniteTttBoard,
  },
];

/** @type {Record<string, GameDefinition>} */
var byId = Object.create(null);
GAME_LIST.forEach(function (def) {
  byId[def.id] = def;
});

export var DEFAULT_GAME_ID = GAME_LIST[0].id;
export var GAME_IDS = GAME_LIST.map(function (d) {
  return d.id;
});

/**
 * @param {string|null|undefined} gameType
 * @returns {GameDefinition}
 */
export function getGameDef(gameType) {
  if (gameType && byId[gameType]) return byId[gameType];
  return byId[DEFAULT_GAME_ID];
}

/**
 * @param {string|null|undefined} gameType
 * @returns {string}
 */
export function normalizeGameId(gameType) {
  return getGameDef(gameType).id;
}

/**
 * @param {string|null|undefined} gameType
 * @returns {boolean}
 */
export function usesMarkChips(gameType) {
  return getGameDef(gameType).chipMode === "marks";
}

/**
 * Infer game id from persisted grid payload.
 * @param {unknown} grid
 * @returns {string|null}
 */
export function inferGameIdFromGrid(grid) {
  if (grid && typeof grid === "object" && !Array.isArray(grid) && Array.isArray(grid.cells)) {
    return "infinite_ttt";
  }
  if (Array.isArray(grid)) return "connect_four";
  return null;
}

/**
 * @param {object|null|undefined} lobby
 * @param {string|null|undefined} [fallback]
 * @returns {string}
 */
export function resolveGameId(lobby, fallback) {
  if (lobby && lobby.gameType && byId[lobby.gameType]) return lobby.gameType;
  var inferred = inferGameIdFromGrid(lobby && lobby.grid);
  if (inferred) return inferred;
  if (fallback && byId[fallback]) return fallback;
  return DEFAULT_GAME_ID;
}
