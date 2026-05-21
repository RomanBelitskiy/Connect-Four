import { initialFrom } from "../utils/format.js";
import { MOCK_LEADERBOARD, MOCK_HISTORY, MOCK_LOBBIES } from "../data/mock-data.js";

export function initTelegram() {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return null;
  tg.ready();
  tg.expand();
  return tg;
}

export function renderLobbies() {
  var list = document.getElementById("lobbyList");
  if (!list) return;
  list.innerHTML = MOCK_LOBBIES.map(function (room) {
    var letter = initialFrom(room.hostName);
    return (
      '<li class="lobby-card" data-mock="join-lobby" data-id="' +
      room.id +
      '">' +
      '<span class="lobby-card__initial" aria-hidden="true">' +
      letter +
      "</span>" +
      '<div class="lobby-card__body">' +
      '<p class="lobby-card__title">' +
      room.title +
      "</p>" +
      '<p class="lobby-card__meta">' +
      '<span class="lobby-card__viewers" role="img" aria-label="\u0413\u043B\u044F\u0434\u0430\u0447\u0456: ' +
      room.viewers +
      '">' +
      '<svg class="lobby-card__eye" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>' +
      "</svg>" +
      '<span class="lobby-card__viewers-count">' +
      room.viewers +
      "</span>" +
      "</span>" +
      "</p>" +
      "</div>" +
      '<div class="lobby-card__side">' +
      '<span class="lobby-card__time">' +
      room.timeLabel +
      "</span>" +
      '<span class="pct-up" aria-hidden="true">\u2197 live</span>' +
      "</div>" +
      "</li>"
    );
  }).join("");
}

export function renderHistory() {
  var list = document.getElementById("historyList");
  if (!list) return;
  list.innerHTML = MOCK_HISTORY.map(function (row) {
    var badgeClass = row.result === "win" ? "history-row__badge--win" : "history-row__badge--loss";
    var label = row.result === "win" ? "W" : "L";
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
      row.meta +
      "</p>" +
      "</div>" +
      "</div>" +
      '<span class="history-row__rating">' +
      row.delta +
      "</span>" +
      "</li>"
    );
  }).join("");
}

export function renderLeaderboard() {
  var list = document.getElementById("leaderboardList");
  if (!list) return;
  list.innerHTML = MOCK_LEADERBOARD.map(function (row) {
    var letter = initialFrom(row.name);
    var top = row.rank <= 3 ? " lb-row__rank--top" : "";
    var me = row.isMe ? " lb-row--me" : "";
    var deltaColor =
      row.delta.trim().indexOf("\u2212") === 0 || row.delta.trim().indexOf("-") === 0
        ? "#f87171"
        : "var(--color-status-success)";
    return (
      '<li class="lb-row' +
      me +
      '">' +
      '<span class="lb-row__rank' +
      top +
      '">' +
      row.rank +
      "</span>" +
      '<span class="lb-row__initial" aria-hidden="true">' +
      letter +
      "</span>" +
      '<div class="lb-row__info">' +
      '<p class="lb-row__name">' +
      row.name +
      "</p>" +
      '<p class="lb-row__delta" style="color:' +
      deltaColor +
      '">' +
      row.delta +
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
  }).join("");
}

export function setProfileFromTg(tg) {
  var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  var nameEl = document.getElementById("profileName");
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
  } else if (nameEl && idEl) {
    nameEl.textContent = displayName;
    idEl.textContent = "id: —";
  }

  if (avatarEl) {
    if (u && u.photo_url) {
      avatarEl.classList.add("profile-hero__avatar--photo");
      avatarEl.style.backgroundImage =
        "url('" + String(u.photo_url).replace(/'/g, "%27") + "')";
      avatarEl.textContent = "";
      avatarEl.setAttribute("aria-label", displayName || "Аватар гравця");
    } else {
      avatarEl.classList.remove("profile-hero__avatar--photo");
      avatarEl.style.backgroundImage = "";
      avatarEl.textContent = initialFrom(displayName);
      avatarEl.setAttribute("aria-label", "Аватар гравця");
    }
  }

  var wr = document.getElementById("statWinrate");
  var g = document.getElementById("statGames");
  var r = document.getElementById("statRating");
  if (wr) wr.textContent = "62%";
  if (g) g.textContent = "24";
  if (r) r.textContent = "1650";
}
