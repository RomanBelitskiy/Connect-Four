/** Підказка для cold start: користувач був на екрані матчу (pregame / гра). */

var STORAGE_KEY = "mg:game-tab";

export function markActiveGameTab() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch (_e) {
    /* private mode */
  }
}

export function clearActiveGameTab() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (_e) {
    /* ignore */
  }
}

export function rememberGameTabForLobby(lobby) {
  if (lobby && (lobby.status === "waiting" || lobby.status === "playing")) {
    markActiveGameTab();
  }
}

export { finishAppLoading as clearBootResumeState } from "./boot-gate.js";
