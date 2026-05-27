import { t } from "../i18n/index.js";

var USER_ERROR_KEYS = {
  active_lobby_exists: "error.activeLobby",
  "Lobby is not available": "error.lobbyUnavailable",
  "Lobby is full": "error.lobbyFull",
  "Cannot join your own lobby": "error.ownLobby",
  "Lobby not found": "error.lobbyNotFound",
  "Кімната вже не доступна": "error.lobbyUnavailable",
  "Кімната вже зайнята або завершена": "error.lobbyFull",
};

export function userErrorMessage(err) {
  if (!err) return t("error.generic");
  var msg = err.message || String(err);
  var key = USER_ERROR_KEYS[msg];
  if (key) return t(key);
  return msg;
}
