import {
  DEFAULT_GAME_ID,
  GAME_IDS,
  GAME_LIST,
  getGameDef,
  normalizeGameId,
  resolveGameId,
  usesMarkChips,
} from "./catalog.js";

export {
  DEFAULT_GAME_ID,
  GAME_IDS,
  GAME_LIST,
  getGameDef,
  normalizeGameId,
  resolveGameId,
  usesMarkChips,
} from "./catalog.js";

/** @typedef {import("./catalog.js").GameDefinition["id"]} GameType */

/**
 * @param {string|null|undefined} gameType
 * @returns {object|null}
 */
export function getGameModule(gameType) {
  return getGameDef(gameType).boardModule;
}

export function gameLabelKey(gameType) {
  return getGameDef(gameType).labelKey;
}

/**
 * @param {object|null|undefined} lobby
 * @param {string|null|undefined} [fallback]
 * @returns {string}
 */
export function resolveGameType(lobby, fallback) {
  return resolveGameId(lobby, fallback);
}
