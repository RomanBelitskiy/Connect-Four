import { avatarHtml } from "../utils/avatar.js";
import { fetchLobbies } from "../api/client.js";
import { t } from "../i18n/index.js";
import { gameLabelKey } from "../games/index.js";

var lastRoomsSignature = "";
var fetchInFlight = null;
var refreshDebounceId = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

function roomSignature(rooms) {
  return rooms
    .map(function (r) {
      return [
        r.id,
        r.statusKey,
        r.isMine ? 1 : 0,
        r.spectatorCount,
        r.timeLabel,
        r.gameType,
        r.title,
      ].join(":");
    })
    .join("|");
}

function statusTextFor(room) {
  var statusKey = room.statusKey || "waiting_player";
  var statusText = t("lobby.status." + statusKey);
  if (!statusText || statusText.indexOf("lobby.status.") === 0) {
    statusText = room.isMine ? t("lobby.roomMine") : t("lobby.roomOpen");
  }
  return statusText;
}

function viewersHtml(count) {
  if (count <= 0) return "";
  return (
    '<span class="lobby-card__viewers">' +
    '<svg class="lobby-card__eye" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="1.75"/>' +
    '<circle cx="12" cy="12" r="2.75" stroke="currentColor" stroke-width="1.75"/>' +
    "</svg>" +
    '<span class="lobby-card__viewers-count">' +
    String(count) +
    "</span></span>"
  );
}

function buildCardElement(room) {
  var li = document.createElement("li");
  li.className = "lobby-card" + (room.isMine ? " lobby-card--mine" : "");
  li.setAttribute("data-id", room.id);
  li.setAttribute("data-mine", room.isMine ? "1" : "0");

  var avatar = document.createElement("div");
  avatar.innerHTML = avatarHtml({
    baseClass: "lobby-card__initial",
    displayName: room.hostName,
    photoUrl: room.hostPhotoUrl,
  });
  while (avatar.firstChild) li.appendChild(avatar.firstChild);

  var body = document.createElement("div");
  body.className = "lobby-card__body";
  var title = document.createElement("p");
  title.className = "lobby-card__title";
  title.textContent = room.title;
  var meta = document.createElement("p");
  meta.className = "lobby-card__meta";
  meta.innerHTML =
    t(gameLabelKey(room.gameType)) + " · " + statusTextFor(room) + viewersHtml(room.spectatorCount);
  body.appendChild(title);
  body.appendChild(meta);

  var side = document.createElement("div");
  side.className = "lobby-card__side";
  var time = document.createElement("span");
  time.className = "lobby-card__time";
  time.textContent = room.timeLabel;
  var action = document.createElement("span");
  action.className = "lobby-card__action-label pct-up";
  action.setAttribute("aria-hidden", "true");
  action.textContent = "\u2197 " + (room.isMine ? t("lobby.actionYou") : t("lobby.actionJoin"));
  side.appendChild(time);
  side.appendChild(action);

  li.appendChild(body);
  li.appendChild(side);
  return li;
}

function updateCardElement(li, room) {
  var title = li.querySelector(".lobby-card__title");
  var meta = li.querySelector(".lobby-card__meta");
  var time = li.querySelector(".lobby-card__time");
  var action = li.querySelector(".lobby-card__action-label");

  if (title && title.textContent !== room.title) title.textContent = room.title;
  if (time && time.textContent !== room.timeLabel) time.textContent = room.timeLabel;
  if (action) {
    var actionText = "\u2197 " + (room.isMine ? t("lobby.actionYou") : t("lobby.actionJoin"));
    if (action.textContent !== actionText) action.textContent = actionText;
  }
  if (meta) {
    var metaHtml =
      t(gameLabelKey(room.gameType)) + " · " + statusTextFor(room) + viewersHtml(room.spectatorCount);
    if (meta.innerHTML !== metaHtml) meta.innerHTML = metaHtml;
  }

  li.classList.toggle("lobby-card--mine", !!room.isMine);
  li.setAttribute("data-mine", room.isMine ? "1" : "0");
}

function renderEmptyList(list, message) {
  list.innerHTML =
    '<li class="empty-state"><p class="empty-state__text">' + message + "</p></li>";
  lastRoomsSignature = "";
}

function listSignature(rooms) {
  if (!rooms.length) return "__empty__";
  return roomSignature(rooms);
}

function patchLobbyList(list, rooms) {
  var sig = listSignature(rooms);
  if (sig === lastRoomsSignature) return false;
  lastRoomsSignature = sig;

  if (!rooms.length) {
    renderEmptyList(list, t("lobby.emptyRooms"));
    return true;
  }

  var existing = new Map();
  list.querySelectorAll(".lobby-card").forEach(function (el) {
    existing.set(el.getAttribute("data-id"), el);
  });

  var frag = document.createDocumentFragment();
  rooms.forEach(function (room) {
    var id = String(room.id);
    var card = existing.get(id);
    if (card) {
      updateCardElement(card, room);
      existing.delete(id);
      frag.appendChild(card);
    } else {
      frag.appendChild(buildCardElement(room));
    }
  });

  existing.forEach(function (el) {
    el.remove();
  });

  list.innerHTML = "";
  list.appendChild(frag);
  return true;
}

async function renderLobbiesNow() {
  var list = document.getElementById("lobbyList");
  if (!list) return;

  try {
    var rooms = await fetchLobbies();
    patchLobbyList(list, rooms);
  } catch (_e) {
    renderEmptyList(list, t("lobby.loadError"));
  }
}

/** Debounced refresh — зливає WS + poll в один запит. */
export function scheduleLobbyListRefresh() {
  if (refreshDebounceId != null) clearTimeout(refreshDebounceId);
  refreshDebounceId = window.setTimeout(function () {
    refreshDebounceId = null;
    void flushLobbyListRefresh();
  }, 60);
}

export async function flushLobbyListRefresh() {
  if (refreshDebounceId != null) {
    clearTimeout(refreshDebounceId);
    refreshDebounceId = null;
  }
  if (fetchInFlight) return fetchInFlight;
  fetchInFlight = renderLobbiesNow().finally(function () {
    fetchInFlight = null;
  });
  return fetchInFlight;
}

/** Скидає кеш підпису (напр. зміна мови). */
export function invalidateLobbyListCache() {
  lastRoomsSignature = "";
}

export var renderLobbies = flushLobbyListRefresh;
