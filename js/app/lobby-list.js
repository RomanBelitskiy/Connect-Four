import { avatarHtml } from "../utils/avatar.js";
import { fetchLobbies } from "../api/client.js";
import { t } from "../i18n/index.js";
import { gameLabelKey } from "../games/index.js";

var lastRoomsSignature = "";
/** @type {object[]|null} */
var cachedRooms = null;
var fetchInFlight = null;
var refreshDebounceId = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

function isLobbyViewVisible() {
  var lobbyView = document.getElementById("view-lobby");
  return !!(lobbyView && !lobbyView.hasAttribute("hidden"));
}

function maybeSyncDom() {
  if (!isLobbyViewVisible() || cachedRooms === null) return false;
  return applyRoomsToDom(cachedRooms);
}

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
        r.hostName || "",
        r.guestName || "",
        r.hasGuest ? 1 : 0,
        r.canJoinAsGuest ? 1 : 0,
        r.hostPhotoUrl || "",
        r.guestPhotoUrl || "",
      ].join(":");
    })
    .join("|");
}

function statusTextFor(room) {
  var statusKey = room.statusKey || "waiting_player";
  var statusText = t("lobby.status." + statusKey);
  if (!statusText || statusText.indexOf("lobby.status.") === 0) {
    statusText = t("lobby.status.waiting_player");
  }
  return statusText;
}

function playerName(name) {
  return name || t("profile.player");
}

function guestSlotName(room) {
  if (room.hasGuest) return playerName(room.guestName);
  return t("lobby.slotOpen");
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

function statusBadgeHtml(room) {
  var statusKey = room.statusKey || "waiting_player";
  return (
    '<span class="lobby-card__badge lobby-card__badge--' +
    statusKey +
    '">' +
    '<span class="lobby-card__badge-text">' +
    statusTextFor(room) +
    "</span>" +
    viewersHtml(room.spectatorCount) +
    "</span>"
  );
}

function actionLabelFor(room) {
  if (room.isMine) return t("lobby.actionYou");
  if (room.canJoinAsGuest) return t("lobby.actionJoin");
  return t("lobby.actionWatch");
}

function actionClassFor(room) {
  if (room.isMine) return "lobby-card__join-btn--mine";
  if (room.canJoinAsGuest) return "lobby-card__join-btn--join";
  return "lobby-card__join-btn--watch";
}

function cardAriaLabel(room) {
  return (
    t(gameLabelKey(room.gameType)) +
    ", " +
    playerName(room.hostName) +
    " " +
    t("lobby.vs") +
    " " +
    guestSlotName(room)
  );
}

function duelAvatarHtml(room, role) {
  if (role === "guest" && !room.hasGuest) {
    return (
      '<span class="lobby-card__initial lobby-card__initial--open" aria-hidden="true">' +
      t("lobby.openSlot") +
      "</span>"
    );
  }

  var isGuest = role === "guest";
  return avatarHtml({
    baseClass: "lobby-card__initial",
    displayName: isGuest ? room.guestName : room.hostName,
    photoUrl: isGuest ? room.guestPhotoUrl : room.hostPhotoUrl,
  });
}

function buildDuelPlayerElement(room, role) {
  var wrap = document.createElement("div");
  wrap.className = "lobby-card__duel-player lobby-card__duel-player--" + role;
  if (role === "guest" && !room.hasGuest) {
    wrap.classList.add("lobby-card__duel-player--empty");
  }

  var headRow = document.createElement("span");
  if (role === "host") {
    headRow.className = "lobby-card__duel-head lobby-card__duel-head--game";
    headRow.textContent = t(gameLabelKey(room.gameType));
  } else {
    headRow.className = "lobby-card__duel-head lobby-card__duel-head--time";
    headRow.textContent = room.timeLabel;
  }

  var avatarWrap = document.createElement("div");
  avatarWrap.className = "lobby-card__duel-avatar";
  avatarWrap.innerHTML = duelAvatarHtml(room, role);

  var name = document.createElement("span");
  name.className = "lobby-card__duel-name";
  if (role === "guest" && !room.hasGuest) {
    name.classList.add("lobby-card__duel-name--open");
  }
  name.textContent = role === "host" ? playerName(room.hostName) : guestSlotName(room);

  wrap.appendChild(headRow);
  wrap.appendChild(avatarWrap);
  wrap.appendChild(name);
  return wrap;
}

function buildDuelElement(room) {
  var duel = document.createElement("div");
  duel.className = "lobby-card__duel";

  var vs = document.createElement("span");
  vs.className = "lobby-card__duel-vs";
  vs.setAttribute("aria-hidden", "true");
  vs.textContent = t("lobby.vs");

  duel.appendChild(buildDuelPlayerElement(room, "host"));
  duel.appendChild(vs);
  duel.appendChild(buildDuelPlayerElement(room, "guest"));
  return duel;
}

function buildMatchupElement(room) {
  var matchup = document.createElement("div");
  matchup.className = "lobby-card__matchup";
  matchup.appendChild(buildDuelElement(room));
  return matchup;
}

function buildJoinButtonElement(room) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "lobby-card__join-btn " + actionClassFor(room);
  btn.setAttribute("aria-label", actionLabelFor(room));
  btn.innerHTML =
    '<span class="lobby-card__join-icon" aria-hidden="true">\u2197</span>' +
    '<span class="lobby-card__join-text">' +
    actionLabelFor(room) +
    "</span>";
  return btn;
}

function updateDuelElement(duel, room) {
  if (!duel) return;

  var host = duel.querySelector(".lobby-card__duel-player--host");
  var guest = duel.querySelector(".lobby-card__duel-player--guest");

  if (host) {
    var hostHead = host.querySelector(".lobby-card__duel-head--game");
    var hostAvatar = host.querySelector(".lobby-card__duel-avatar");
    var hostName = host.querySelector(".lobby-card__duel-name");
    if (hostHead) hostHead.textContent = t(gameLabelKey(room.gameType));
    if (hostAvatar) hostAvatar.innerHTML = duelAvatarHtml(room, "host");
    if (hostName) hostName.textContent = playerName(room.hostName);
  }

  if (guest) {
    guest.classList.toggle("lobby-card__duel-player--empty", !room.hasGuest);
    var guestHead = guest.querySelector(".lobby-card__duel-head--time");
    var guestAvatar = guest.querySelector(".lobby-card__duel-avatar");
    var guestName = guest.querySelector(".lobby-card__duel-name");
    if (guestHead) guestHead.textContent = room.timeLabel;
    if (guestAvatar) guestAvatar.innerHTML = duelAvatarHtml(room, "guest");
    if (guestName) {
      guestName.classList.toggle("lobby-card__duel-name--open", !room.hasGuest);
      guestName.textContent = guestSlotName(room);
    }
  }
}

function buildCardElement(room) {
  var li = document.createElement("li");
  li.className = "lobby-card" + (room.isMine ? " lobby-card--mine" : "");
  li.setAttribute("data-id", room.id);
  li.setAttribute("data-mine", room.isMine ? "1" : "0");
  li.setAttribute("data-can-join", room.canJoinAsGuest ? "1" : "0");
  li.setAttribute("aria-label", cardAriaLabel(room));

  li.appendChild(buildMatchupElement(room));

  var aside = document.createElement("div");
  aside.className = "lobby-card__aside";

  var badgeWrap = document.createElement("div");
  badgeWrap.className = "lobby-card__badge-wrap";
  badgeWrap.innerHTML = statusBadgeHtml(room);

  aside.appendChild(badgeWrap);
  aside.appendChild(buildJoinButtonElement(room));

  li.appendChild(aside);
  return li;
}

function updateCardElement(li, room) {
  var gameHead = li.querySelector(".lobby-card__duel-player--host .lobby-card__duel-head--game");
  var timeHead = li.querySelector(".lobby-card__duel-player--guest .lobby-card__duel-head--time");
  var badgeWrap = li.querySelector(".lobby-card__badge-wrap");
  var joinBtn = li.querySelector(".lobby-card__join-btn");

  updateDuelElement(li.querySelector(".lobby-card__duel"), room);
  li.setAttribute("aria-label", cardAriaLabel(room));

  var gameText = t(gameLabelKey(room.gameType));
  if (gameHead && gameHead.textContent !== gameText) gameHead.textContent = gameText;
  if (timeHead && timeHead.textContent !== room.timeLabel) timeHead.textContent = room.timeLabel;
  if (badgeWrap) {
    var nextBadge = statusBadgeHtml(room);
    if (badgeWrap.innerHTML !== nextBadge) badgeWrap.innerHTML = nextBadge;
  }
  if (joinBtn) {
    var nextClass = "lobby-card__join-btn " + actionClassFor(room);
    if (joinBtn.className !== nextClass) joinBtn.className = nextClass;
    var joinText = joinBtn.querySelector(".lobby-card__join-text");
    var label = actionLabelFor(room);
    if (joinText && joinText.textContent !== label) joinText.textContent = label;
    if (joinBtn.getAttribute("aria-label") !== label) joinBtn.setAttribute("aria-label", label);
  }

  li.classList.toggle("lobby-card--mine", !!room.isMine);
  li.setAttribute("data-mine", room.isMine ? "1" : "0");
  li.setAttribute("data-can-join", room.canJoinAsGuest ? "1" : "0");
}

function renderEmptyList(list, message) {
  list.querySelectorAll(".lobby-card").forEach(function (el) {
    el.remove();
  });
  var empty = list.querySelector(".empty-state");
  if (!empty) {
    empty = document.createElement("li");
    empty.className = "empty-state";
    var p = document.createElement("p");
    p.className = "empty-state__text";
    empty.appendChild(p);
    list.appendChild(empty);
  }
  var text = empty.querySelector(".empty-state__text");
  if (text) text.textContent = message;
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

  var empty = list.querySelector(".empty-state");
  if (empty) empty.remove();

  var existing = new Map();
  list.querySelectorAll(".lobby-card").forEach(function (el) {
    existing.set(el.getAttribute("data-id"), el);
  });

  var nextIds = new Set();
  rooms.forEach(function (room) {
    var id = String(room.id);
    nextIds.add(id);
    var card = existing.get(id);
    if (card) {
      updateCardElement(card, room);
    } else {
      card = buildCardElement(room);
      existing.set(id, card);
    }
  });

  existing.forEach(function (el, id) {
    if (!nextIds.has(id)) el.remove();
  });

  rooms.forEach(function (room, index) {
    var id = String(room.id);
    var card = existing.get(id);
    if (!card) return;
    var ref = list.children[index] || null;
    if (list.children[index] !== card) {
      list.insertBefore(card, ref);
    }
  });

  return true;
}

function applyRoomsToDom(rooms) {
  var list = document.getElementById("lobbyList");
  if (!list) return false;
  return patchLobbyList(list, rooms);
}

/** Зберігає актуальний список і малює DOM, якщо вкладка Lobby видима. */
export function setLobbyRooms(rooms) {
  cachedRooms = Array.isArray(rooms) ? rooms : [];
  maybeSyncDom();
}

/** Миттєво малює закешований список (напр. при поверненні на вкладку Lobby). */
export function syncLobbyListFromCache() {
  if (cachedRooms === null) return false;
  if (!isLobbyViewVisible()) return false;
  return applyRoomsToDom(cachedRooms);
}
async function fetchAndSetLobbyRooms() {
  try {
    setLobbyRooms(await fetchLobbies());
  } catch (_e) {
    var list = document.getElementById("lobbyList");
    if (list && cachedRooms === null && isLobbyViewVisible()) {
      renderEmptyList(list, t("lobby.loadError"));
    }
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

export async function flushLobbyListRefresh(options) {
  options = options || {};
  if (refreshDebounceId != null) {
    clearTimeout(refreshDebounceId);
    refreshDebounceId = null;
  }
  if (fetchInFlight) {
    if (!options.force) return fetchInFlight;
    await fetchInFlight;
  }
  fetchInFlight = fetchAndSetLobbyRooms().finally(function () {
    fetchInFlight = null;
  });
  return fetchInFlight;
}

/** Скидає кеш підпису (напр. зміна мови). */
export function invalidateLobbyListCache() {
  lastRoomsSignature = "";
  if (cachedRooms !== null) maybeSyncDom();
}

export var renderLobbies = flushLobbyListRefresh;
