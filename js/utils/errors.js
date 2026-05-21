var USER_ERRORS = {
  active_lobby_exists: "У тебе вже є активне лобі.",
  "Lobby is not available": "Кімната вже не доступна",
  "Lobby is full": "Кімната вже зайнята",
  "Cannot join your own lobby": "Не можна приєднатись до власного лобі",
  "Lobby not found": "Кімнату не знайдено",
};

export function userErrorMessage(err) {
  if (!err) return "Щось пішло не так";
  var msg = err.message || String(err);
  return USER_ERRORS[msg] || msg;
}
