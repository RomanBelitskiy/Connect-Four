/** Знімок лобі для прегейму — окремий модуль без циклу з lobby-session. */

/** @type {object|null} */
var lastLobbySnapshot = null;

export function getLastLobbySnapshot() {
  return lastLobbySnapshot;
}

export function setLastLobbySnapshot(lobby) {
  lastLobbySnapshot = lobby;
}

export function resetPregameLobbySnapshot() {
  lastLobbySnapshot = null;
}
