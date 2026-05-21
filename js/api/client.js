import { isLobbySocketOpen, sendMove } from "./ws.js";

/** @type {string} */
export var telegramInitData = "";

export function setTelegramInitData(value) {
  telegramInitData = value || "";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": telegramInitData,
  };
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

export async function authenticateWithTelegram(initData) {
  setTelegramInitData(initData);
  const res = await fetch("/api/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.user;
}

export async function fetchOnlineCount() {
  const res = await fetch("/api/online");
  if (!res.ok) return 1;
  const data = await res.json();
  return data.count || 1;
}

export async function fetchLobby(lobbyId) {
  const res = await fetch("/api/lobbies/" + encodeURIComponent(lobbyId), {
    headers: authHeaders(),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function syncLobby(lobbyId) {
  const res = await fetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/sync", {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function submitMove(lobbyId, column) {
  if (isLobbySocketOpen() && sendMove(column)) {
    return null;
  }

  const res = await fetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/move", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ column }),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function fetchActiveLobby() {
  const res = await fetch("/api/lobbies/mine/active", { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.lobby || null;
}

export async function fetchLobbies() {
  const res = await fetch("/api/lobbies", { headers: authHeaders() });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobbies || [];
}

export async function createLobby(settings, replaceExisting) {
  const res = await fetch("/api/lobbies", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      visibility: settings.visibility,
      hostChipColor: settings.playerChipColor,
      secondsPerPlayer: parseInt(settings.secondsPerPlayer, 10),
      incrementSeconds: parseInt(settings.incrementSeconds, 10),
      replaceExisting: !!replaceExisting,
    }),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function fetchLobbyByCode(code) {
  const res = await fetch("/api/lobbies/join/" + encodeURIComponent(code), {
    headers: authHeaders(),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function joinLobby(lobbyId, replaceExisting) {
  const res = await fetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/join", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ replaceExisting: !!replaceExisting }),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function forfeitLobby(lobbyId) {
  const res = await fetch("/api/lobbies/" + encodeURIComponent(lobbyId) + "/forfeit", {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.lobby;
}

export async function fetchHistory() {
  const res = await fetch("/api/history", { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.history || [];
}

export async function fetchLeaderboard() {
  const res = await fetch("/api/leaderboard", { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.leaderboard || [];
}

export async function prepareLobbyShare(lobbyId) {
  const res = await fetch(
    "/api/lobbies/" + encodeURIComponent(lobbyId) + "/prepare-share",
    { method: "POST", headers: authHeaders() }
  );
  if (!res.ok) await parseError(res);
  const data = await res.json();
  return data.messageId;
}

export async function fetchCurrentUser(telegramId) {
  const res = await fetch("/api/users/me?telegramId=" + encodeURIComponent(telegramId), {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user;
}
