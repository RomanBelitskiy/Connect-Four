import { game } from "../state.js";

export function hasLobbyGuest(lobby) {
  return !!(lobby && lobby.guest && lobby.guest.telegramId);
}

export function isPregameHost(lobby) {
  return lobby.myRole === "host";
}

export function isPregameGuest(lobby) {
  return lobby.myRole === "guest";
}

/** Глядач або в кімнаті без місця (myRole=null після гонок join/leave). */
export function isPregameSpectator(lobby) {
  if (lobby.myRole === "spectator") return true;
  if (isPregameHost(lobby) || isPregameGuest(lobby)) return false;
  return !!(
    game.lobbyId &&
    String(game.lobbyId) === String(lobby.id) &&
    lobby.status === "waiting"
  );
}

export function shouldShowHostInvite(lobby, hasGuest, countdownLocked) {
  return !hasGuest && !countdownLocked && isPregameHost(lobby);
}

export function shouldShowSpectatorJoin(lobby, hasGuest, countdownLocked) {
  return !hasGuest && !countdownLocked && isPregameSpectator(lobby);
}

/** Без суперника готовність не показуємо й не зберігаємо в UI. */
export function normalizeWaitingLobby(lobby) {
  if (!lobby || lobby.status !== "waiting") return lobby;
  if (hasLobbyGuest(lobby)) return lobby;
  return Object.assign({}, lobby, { hostReady: false, guestReady: false, countdownAt: null });
}

export function getPregameReadyState(lobby) {
  var hasGuest = hasLobbyGuest(lobby);
  var countdownLocked = !!(lobby && lobby.countdownAt);
  var rawMy = lobby.myRole === "host" ? lobby.hostReady : lobby.guestReady;
  var rawOpp = lobby.myRole === "host" ? lobby.guestReady : lobby.hostReady;
  return {
    hasGuest: hasGuest,
    countdownLocked: countdownLocked,
    myReady: hasGuest && !!rawMy,
    oppReady: hasGuest && !!rawOpp,
  };
}

export function isLobbyHostPlayer(lobby, player) {
  if (!lobby || !player || !lobby.host) return false;
  return String(player.telegramId) === String(lobby.host.telegramId);
}

export function chipForRole(lobby, role) {
  var hostColor = lobby.hostChipColor === "red" ? "red" : "yellow";
  if (role === "host") return hostColor;
  return hostColor === "red" ? "yellow" : "red";
}

export function lobbyPlayersUnchanged(prev, lobby) {
  if (!prev || String(prev.id) !== String(lobby.id)) return false;
  if (String(prev.myRole || "") !== String(lobby.myRole || "")) return false;
  var prevGuest = prev.guest && prev.guest.telegramId;
  var guest = lobby.guest && lobby.guest.telegramId;
  if (String(prevGuest || "") !== String(guest || "")) return false;
  var prevHost = prev.host && prev.host.telegramId;
  var host = lobby.host && lobby.host.telegramId;
  return String(prevHost || "") === String(host || "");
}

/** Лише галочки готовності / відлік — без зміни складу гравців. */
export function isPregameLobbyDelta(prev, lobby) {
  if (!prev || !lobby || String(prev.id) !== String(lobby.id)) return false;
  if (prev.status !== "waiting" || lobby.status !== "waiting") return false;
  if (!lobbyPlayersUnchanged(prev, lobby)) return false;
  return (
    !!prev.hostReady !== !!lobby.hostReady ||
    !!prev.guestReady !== !!lobby.guestReady ||
    String(prev.countdownAt || "") !== String(lobby.countdownAt || "")
  );
}
