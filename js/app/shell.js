import { initialFrom } from "../utils/format.js";
import { avatarHtml, applyAvatarElement } from "../utils/avatar.js";
import { fetchHistory, fetchLeaderboard, fetchOnlineCount, hasTelegramInitData } from "../api/client.js";
import { renderLobbies, scheduleLobbyListRefresh, flushLobbyListRefresh, invalidateLobbyListCache, syncLobbyListFromCache } from "./lobby-list.js";
import { isLobbyFeedOpen, setLobbyFeedConnectionHandler } from "../api/lobby-feed.js";
import { game } from "../game/state.js";
import { initTelegramApp } from "./telegram.js";
import { t, onLanguageChange } from "../i18n/index.js";
import { gameLabelKey } from "../games/index.js";
import { refreshGameTexts } from "../game/match-board.js";
import { syncLeaveModalCopy } from "../ui/leave-game-modal.js";
import { syncReplaceLobbyModalCopy } from "../ui/replace-lobby-modal.js";
import { syncCreateLobbySelectLabels } from "../ui/create-lobby-modal.js";

/** @type {object|null} */
export var currentUser = null;

export function initTelegram() {
  return initTelegramApp();
}

function renderEmptyList(list, message) {
  if (!list) return;
  list.innerHTML =
    '<li class="empty-state"><p class="empty-state__text">' + message + "</p></li>";
}

export async function refreshOnlineCount() {
  var el = document.getElementById("lobbyOnlineCount");
  if (!el) return;
  if (!hasTelegramInitData()) {
    el.textContent = "—";
    return;
  }
  try {
    var count = await fetchOnlineCount();
    el.textContent = count == null ? "—" : String(count);
  } catch (_e) {
    el.textContent = "—";
  }
}

export { renderLobbies, flushLobbyListRefresh as refreshLobbies, syncLobbyListFromCache };

/** Показує вкладку Lobby: спочатку кеш, потім свіжий fetch. */
export function showLobbyList() {
  syncLobbyListFromCache();
  return flushLobbyListRefresh({ force: true });
}

var lobbyPollTimer = null;
/** Рідкий fallback, коли WS живий (snapshot приходить по WS). */
var LOBBY_POLL_WS_OPEN_MS = 45000;
/** Частіший poll без WS. */
var LOBBY_POLL_WS_DOWN_MS = 8000;

function isLobbyViewVisible() {
  var lobbyView = document.getElementById("view-lobby");
  return !!(lobbyView && !lobbyView.hasAttribute("hidden"));
}

export function refreshLobbiesIfVisible() {
  if (!hasTelegramInitData() || !isLobbyViewVisible()) return;
  if (isLobbyFeedOpen()) {
    scheduleLobbyListRefresh();
  } else {
    void flushLobbyListRefresh();
  }
}

function pollIntervalMs() {
  return isLobbyFeedOpen() ? LOBBY_POLL_WS_OPEN_MS : LOBBY_POLL_WS_DOWN_MS;
}

function scheduleNextPoll() {
  if (!hasTelegramInitData()) return;
  if (lobbyPollTimer) {
    clearTimeout(lobbyPollTimer);
    lobbyPollTimer = null;
  }
  lobbyPollTimer = window.setTimeout(function () {
    lobbyPollTimer = null;
    if (!hasTelegramInitData()) return;
    if (isLobbyViewVisible()) {
      if (isLobbyFeedOpen()) {
        scheduleLobbyListRefresh();
      } else {
        void flushLobbyListRefresh();
      }
    }
    scheduleNextPoll();
  }, pollIntervalMs());
}

export function startLobbyListPolling() {
  if (!hasTelegramInitData()) return;
  setLobbyFeedConnectionHandler(function () {
    scheduleNextPoll();
    if (isLobbyViewVisible()) {
      void flushLobbyListRefresh();
    }
  });

  scheduleNextPoll();

  if (!document.documentElement.dataset.lobbyVisibilityBound) {
    document.documentElement.dataset.lobbyVisibilityBound = "1";
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && isLobbyViewVisible()) {
        void flushLobbyListRefresh();
      }
    });
  }
}

export function stopLobbyListPolling() {
  if (lobbyPollTimer) {
    clearTimeout(lobbyPollTimer);
    lobbyPollTimer = null;
  }
}

export async function renderHistory() {
  var list = document.getElementById("historyList");
  if (!list) return;

  try {
    var rows = await fetchHistory();
    if (!rows.length) {
      renderEmptyList(list, t("profile.historyEmpty"));
      return;
    }
    list.innerHTML = rows
      .map(function (row) {
        var badgeClass =
          row.result === "win"
            ? "history-row__badge--win"
            : row.result === "draw"
              ? "history-row__badge--draw"
              : "history-row__badge--loss";
        var label = row.result === "win" ? "W" : row.result === "draw" ? "D" : "L";
        var meta = [row.meta, row.timeLabel].filter(Boolean).join(" · ");
        return (
          '<li class="history-row">' +
          '<div class="history-row__left">' +
          '<span class="history-row__badge ' +
          badgeClass +
          '">' +
          label +
          "</span>" +
          "<div>" +
          '<p class="history-row__title">' +
          t("profile.historyAgainst", {
            name: row.opponentLabel || row.opponent || "",
          }) +
          "</p>" +
          '<p class="history-row__meta">' +
          meta +
          "</p>" +
          "</div>" +
          "</div>" +
          '<span class="history-row__rating">' +
          row.delta +
          "</span>" +
          "</li>"
        );
      })
      .join("");
  } catch (_e) {
    renderEmptyList(list, t("profile.historyError"));
  }
}

export async function renderLeaderboard() {
  var list = document.getElementById("leaderboardList");
  if (!list) return;

  try {
    var rows = await fetchLeaderboard();
    if (!rows.length) {
      renderEmptyList(list, t("leaderboard.empty"));
      return;
    }
    list.innerHTML = rows
      .map(function (row) {
        var top = row.rank <= 3 ? " lb-row__rank--top" : "";
        var me =
          currentUser && row.telegramId && String(row.telegramId) === String(currentUser.telegramId)
            ? " lb-row--me"
            : "";
        var avatar = avatarHtml({
          baseClass: "lb-row__initial",
          displayName: row.displayName || row.name,
          photoUrl: row.photoUrl,
        });
        return (
          '<li class="lb-row' +
          me +
          '">' +
          '<span class="lb-row__rank' +
          top +
          '">' +
          row.rank +
          "</span>" +
          avatar +
          '<div class="lb-row__info">' +
          '<p class="lb-row__name">' +
          row.name +
          "</p>" +
          "</div>" +
          '<div class="lb-row__score">' +
          '<span class="lb-row__points">' +
          row.score +
          "</span>" +
          '<span class="lb-row__label">' +
          t("leaderboard.scoreLabel") +
          "</span>" +
          "</div>" +
          "</li>"
        );
      })
      .join("");
  } catch (_e) {
    renderEmptyList(list, t("leaderboard.loadError"));
  }
}

export async function refreshAllData() {
  if (!hasTelegramInitData()) return;
  await Promise.all([
    refreshOnlineCount(),
    renderLobbies(),
    renderHistory(),
    renderLeaderboard(),
  ]);
}

function applyAvatar(avatarEl, displayName, photoUrl) {
  applyAvatarElement(avatarEl, displayName, photoUrl);
}

export function setProfileFromUser(user) {
  if (!user) return;
  currentUser = user;
  game.myTelegramId = String(user.telegramId);

  var nameEl = document.getElementById("profileName");
  var usernameEl = document.getElementById("profileUsername");
  var idEl = document.getElementById("profileId");
  var avatarEl = document.getElementById("profileAvatar");

  var displayName = user.displayName || t("profile.player");

  if (nameEl) nameEl.textContent = displayName;

  if (usernameEl) {
    usernameEl.textContent = user.username ? "@" + user.username : "";
    usernameEl.hidden = !user.username;
  }

  if (idEl) idEl.textContent = "id: " + user.telegramId;

  applyAvatar(avatarEl, displayName, user.photoUrl);

  var wr = document.getElementById("statWinrate");
  var g = document.getElementById("statGames");
  var r = document.getElementById("statRating");
  if (wr) wr.textContent = user.gamesPlayed > 0 ? user.winrate + "%" : "—";
  if (g) g.textContent = String(user.gamesPlayed || 0);
  if (r) r.textContent = String(user.rating ?? 100);
}

export function setProfileFromTg(tg) {
  var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  var nameEl = document.getElementById("profileName");
  var usernameEl = document.getElementById("profileUsername");
  var idEl = document.getElementById("profileId");
  var avatarEl = document.getElementById("profileAvatar");

  var displayName = t("profile.player");
  if (u && nameEl && idEl) {
    displayName =
      [u.first_name, u.last_name].filter(Boolean).join(" ") ||
      u.username ||
      t("profile.player");
    nameEl.textContent = displayName;
    idEl.textContent = "id: " + u.id;
    game.myTelegramId = String(u.id);

    if (usernameEl) {
      usernameEl.textContent = u.username ? "@" + u.username : "";
      usernameEl.hidden = !u.username;
    }
  } else if (nameEl && idEl) {
    nameEl.textContent = displayName;
    idEl.textContent = "id: —";
    if (usernameEl) {
      usernameEl.textContent = "";
      usernameEl.hidden = true;
    }
  }

  applyAvatar(avatarEl, displayName, u && u.photo_url);

  var wr = document.getElementById("statWinrate");
  var g = document.getElementById("statGames");
  var r = document.getElementById("statRating");
  if (wr) wr.textContent = "—";
  if (g) g.textContent = "0";
  if (r) r.textContent = "100";
}

export function setProfileLoading(isLoading) {
  var nameEl = document.getElementById("profileName");
  if (nameEl && isLoading) {
    nameEl.textContent = t("loading");
  }
}

onLanguageChange(function () {
  invalidateLobbyListCache();
  renderLobbies();
  renderHistory();
  renderLeaderboard();
  refreshGameTexts();
  syncLeaveModalCopy();
  syncReplaceLobbyModalCopy();
  syncCreateLobbySelectLabels();
});
