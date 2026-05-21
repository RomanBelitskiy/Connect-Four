import { initialFrom } from "../utils/format.js";
import { avatarHtml, applyAvatarElement } from "../utils/avatar.js";
import {
  fetchHistory,
  fetchLeaderboard,
  fetchLobbies,
  fetchOnlineCount,
} from "../api/client.js";
import { game } from "../game/state.js";
import { initTelegramApp } from "./telegram.js";

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
  try {
    var count = await fetchOnlineCount();
    el.textContent = String(count);
  } catch (_e) {
    el.textContent = "1";
  }
}

export async function renderLobbies() {
  var list = document.getElementById("lobbyList");
  if (!list) return;

  try {
    var rooms = await fetchLobbies();
    if (!rooms.length) {
      renderEmptyList(list, "Немає відкритих кімнат. Створи свою!");
      return;
    }
    list.innerHTML = rooms
      .map(function (room) {
        var mineClass = room.isMine ? " lobby-card--mine" : "";
        var meta = room.isMine ? "Твоє лобі · очікуємо" : "Відкрите лобі";
        var action = room.isMine ? "ти" : "join";
        var avatar = avatarHtml({
          baseClass: "lobby-card__initial",
          displayName: room.hostName,
          photoUrl: room.hostPhotoUrl,
        });
        return (
          '<li class="lobby-card' +
          mineClass +
          '" data-id="' +
          room.id +
          '" data-mine="' +
          (room.isMine ? "1" : "0") +
          '">' +
          avatar +
          '<div class="lobby-card__body">' +
          '<p class="lobby-card__title">' +
          room.title +
          "</p>" +
          '<p class="lobby-card__meta">' +
          meta +
          "</p>" +
          "</div>" +
          '<div class="lobby-card__side">' +
          '<span class="lobby-card__time">' +
          room.timeLabel +
          "</span>" +
          '<span class="pct-up" aria-hidden="true">\u2197 ' +
          action +
          "</span>" +
          "</div>" +
          "</li>"
        );
      })
      .join("");
  } catch (_e) {
    renderEmptyList(list, "Не вдалося завантажити кімнати");
  }
}

var lobbyPollTimer = null;

export function startLobbyListPolling() {
  if (lobbyPollTimer) return;
  lobbyPollTimer = window.setInterval(function () {
    var lobbyView = document.getElementById("view-lobby");
    if (lobbyView && !lobbyView.hasAttribute("hidden")) {
      renderLobbies();
    }
  }, 4000);
}

export function stopLobbyListPolling() {
  if (lobbyPollTimer) {
    window.clearInterval(lobbyPollTimer);
    lobbyPollTimer = null;
  }
}

export var refreshLobbies = renderLobbies;

export async function renderHistory() {
  var list = document.getElementById("historyList");
  if (!list) return;

  try {
    var rows = await fetchHistory();
    if (!rows.length) {
      renderEmptyList(list, "Ще немає зіграних партій");
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
          row.opponent +
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
    renderEmptyList(list, "Не вдалося завантажити історію");
  }
}

export async function renderLeaderboard() {
  var list = document.getElementById("leaderboardList");
  if (!list) return;

  try {
    var rows = await fetchLeaderboard();
    if (!rows.length) {
      renderEmptyList(list, "Рейтинг з\u2019явиться після перших ігор");
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
          '<span class="lb-row__label">рейтинг</span>' +
          "</div>" +
          "</li>"
        );
      })
      .join("");
  } catch (_e) {
    renderEmptyList(list, "Не вдалося завантажити рейтинг");
  }
}

export async function refreshAllData() {
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

  var displayName = user.displayName || "Гравець";

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
  if (r) r.textContent = String(user.rating || 1500);
}

export function setProfileFromTg(tg) {
  var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  var nameEl = document.getElementById("profileName");
  var usernameEl = document.getElementById("profileUsername");
  var idEl = document.getElementById("profileId");
  var avatarEl = document.getElementById("profileAvatar");

  var displayName = "Гравець";
  if (u && nameEl && idEl) {
    displayName =
      [u.first_name, u.last_name].filter(Boolean).join(" ") ||
      u.username ||
      "Гравець";
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
  if (r) r.textContent = "1500";
}

export function setProfileLoading(isLoading) {
  var nameEl = document.getElementById("profileName");
  if (nameEl && isLoading) {
    nameEl.textContent = "Завантаження…";
  }
}
