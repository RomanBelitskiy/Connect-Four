import { isLobbySocketOpen, sendMove } from "./ws.js";
import { nextSyncEpoch, isSyncEpochCurrent } from "../game/sync-epoch.js";

/** @type {string} */
export var telegramInitData = "";

export function setTelegramInitData(value) {
  telegramInitData = value || "";
}

export function hasTelegramInitData() {
  return !!telegramInitData;
}

function assertTelegramInitData() {
  if (!telegramInitData) {
    throw new Error("Telegram initData required");
  }
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": telegramInitData,
  };
}

async function apiFetch(url, options) {
  assertTelegramInitData();
  return fetch(url, options);
}

function formatApiDetail(detail) {
  if (!detail) return "";
  if (typeof detail === "string") {
    if (detail === "active_lobby_exists") return "active_lobby_exists";
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map(function (item) {
        if (typeof item === "string") return item;
        if (item && item.msg) return item.msg;
        return "";
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof detail === "object") {
    if (detail.code === "active_lobby_exists") return "active_lobby_exists";
    if (detail.message) return detail.message;
    if (detail.msg) return detail.msg;
  }
  return "";
}

async function parseError(res) {
  const err = await res.json().catch(function () {
    return {};
  });
  const msg = err.error || formatApiDetail(err.detail) || err.message || "Request failed";
  const error = new Error(msg);
  if (err.detail && typeof err.detail === "object" && err.detail.code) {
    error.code = err.detail.code;
  }
  throw error;
}

export async function authenticateWithTelegram(initData, options) {
  if (!initData) {
    throw new Error("Telegram initData required");
  }
  var force = options && options.force;
  setTelegramInitData(initData);
  const res = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: initData, force: !!force }),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.user;
}

export async function fetchOnlineCount() {
  if (!telegramInitData) return null;
  const res = await apiFetch("/api/online", { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.count || 1;
}

export async function fetchLobby(lobbyId) {
  const res = await apiFetch("/api/lobbies/" + encodeURIComponent(lobbyId), {
    headers: authHeaders(),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function syncLobby(lobbyId) {
  if (!telegramInitData) return null;
  var epoch = nextSyncEpoch();
  const res = await apiFetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/sync", {
    method: "POST",
    headers: authHeaders(),
  });
  if (!isSyncEpochCurrent(epoch)) return null;
  if (!res.ok) await parseError(res);
  const data = await res.json();
  if (!isSyncEpochCurrent(epoch)) return null;
  return data.lobby;
}

export async function submitMove(lobbyId, move) {
  var payload =
    typeof move === "number"
      ? { column: move }
      : move && typeof move === "object"
        ? move
        : {};

  if (isLobbySocketOpen() && sendMove(payload)) {
    return { viaWs: true };
  }

  const res = await apiFetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/move", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return { lobby: data.lobby };
}

export async function fetchActiveLobby() {
  if (!telegramInitData) return null;
  const res = await apiFetch("/api/lobbies/mine/active", { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.lobby || null;
}

export async function fetchSpectatingLobby() {
  if (!telegramInitData) return null;
  const res = await apiFetch("/api/lobbies/mine/spectating", { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.lobby || null;
}

export async function spectateLobby(lobbyId) {
  const res = await apiFetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/spectate", {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function leaveSpectatorLobby(lobbyId) {
  const res = await apiFetch(
    "/api/lobbies/" + encodeURIComponent(lobbyId) + "/leave-spectator",
    { method: "POST", headers: authHeaders() }
  );
  if (!res.ok) await parseError(res);
}

export async function fetchLobbies() {
  if (!telegramInitData) return [];
  const res = await apiFetch("/api/lobbies", { headers: authHeaders() });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobbies || [];
}

export async function createLobby(settings, replaceExisting) {
  const res = await apiFetch("/api/lobbies", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      visibility: settings.visibility,
      hostChipColor: settings.playerChipColor,
      firstMove: settings.firstMove || "random",
      secondsPerPlayer: parseInt(settings.secondsPerPlayer, 10),
      incrementSeconds: parseInt(settings.incrementSeconds, 10),
      gameType: settings.gameType,
      replaceExisting: !!replaceExisting,
    }),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function fetchLobbyByCode(code) {
  const res = await apiFetch("/api/lobbies/join/" + encodeURIComponent(code), {
    headers: authHeaders(),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function joinLobby(lobbyId, replaceExisting) {
  const res = await apiFetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/join", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ replaceExisting: !!replaceExisting }),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function setLobbyReady(lobbyId, ready) {
  const res = await apiFetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/ready", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ready: !!ready }),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function kickLobbyGuest(lobbyId) {
  const res = await apiFetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/kick-guest", {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function forfeitLobby(lobbyId) {
  const res = await apiFetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/forfeit", {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function fetchHistory() {
  if (!telegramInitData) return [];
  const res = await apiFetch("/api/history", { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.history || [];
}

export async function fetchLeaderboard() {
  if (!telegramInitData) return [];
  const res = await apiFetch("/api/leaderboard", { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.leaderboard || [];
}

export async function prepareLobbyShare(lobbyId) {
  const res = await apiFetch(
    "/api/lobbies/" + encodeURIComponent(lobbyId) + "/prepare-share",
    { method: "POST", headers: authHeaders() }
  );
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.messageId;
}

export async function fetchCurrentUser(_telegramId) {
  if (!telegramInitData) return null;
  const res = await apiFetch("/api/users/me", { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user;
}
