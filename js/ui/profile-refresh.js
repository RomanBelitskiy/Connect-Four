import { authenticateWithTelegram } from "../api/client.js";
import { currentUser, setProfileFromUser, setProfileLoading } from "../app/shell.js";
import { getTelegramWebApp } from "../app/telegram.js";
import { t, onLanguageChange } from "../i18n/index.js";
import profileRefreshIconUrl from "../../assets/icons/profile-refresh.png?url";

var profileRefreshMask = 'url("' + profileRefreshIconUrl + '")';

var REFRESH_COOLDOWN_MS = 60 * 1000;
var REFRESH_COOLDOWN_STORAGE_PREFIX = "profileRefreshLockedUntil:";
var refreshLockedUntil = 0;
var cooldownTimerId = null;
var refreshInFlight = false;

function cooldownStorageKey() {
  var tg = getTelegramWebApp();
  var id = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
  return REFRESH_COOLDOWN_STORAGE_PREFIX + (id || "anon");
}

function loadCooldownUntil() {
  try {
    var raw = sessionStorage.getItem(cooldownStorageKey());
    var until = raw ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(until) || until <= Date.now()) {
      sessionStorage.removeItem(cooldownStorageKey());
      return 0;
    }
    return until;
  } catch (_e) {
    return 0;
  }
}

function saveCooldownUntil(until) {
  try {
    if (until > Date.now()) {
      sessionStorage.setItem(cooldownStorageKey(), String(until));
    } else {
      sessionStorage.removeItem(cooldownStorageKey());
    }
  } catch (_e) {
    /* ignore quota / private mode */
  }
}

function bustAvatarUrl(url) {
  if (!url) return url;
  var base = String(url);
  var sep = base.indexOf("?") >= 0 ? "&" : "?";
  return base + sep + "v=" + Date.now();
}

function syncRefreshButton(btn) {
  if (!btn) return;
  var locked = refreshInFlight || Date.now() < refreshLockedUntil;
  btn.disabled = locked;
  btn.classList.toggle("profile-refresh-btn--loading", refreshInFlight);
  btn.setAttribute("aria-disabled", locked ? "true" : "false");
  btn.setAttribute("aria-label", locked && !refreshInFlight ? t("profile.refreshLocked") : t("profile.refresh"));
}

function scheduleCooldownUnlock(btn) {
  if (cooldownTimerId != null) {
    clearTimeout(cooldownTimerId);
    cooldownTimerId = null;
  }
  var remaining = refreshLockedUntil - Date.now();
  if (remaining <= 0) {
    refreshLockedUntil = 0;
    saveCooldownUntil(0);
    syncRefreshButton(btn);
    return;
  }
  cooldownTimerId = window.setTimeout(function () {
    cooldownTimerId = null;
    refreshLockedUntil = 0;
    saveCooldownUntil(0);
    syncRefreshButton(btn);
  }, remaining);
}

function startRefreshCooldown(btn) {
  refreshLockedUntil = Date.now() + REFRESH_COOLDOWN_MS;
  saveCooldownUntil(refreshLockedUntil);
  syncRefreshButton(btn);
  scheduleCooldownUnlock(btn);
}

function restoreCooldownFromStorage(btn) {
  refreshLockedUntil = loadCooldownUntil();
  syncRefreshButton(btn);
  scheduleCooldownUnlock(btn);
}

async function refreshProfile(btn) {
  if (refreshInFlight || Date.now() < refreshLockedUntil) return;

  var tg = getTelegramWebApp();
  if (!tg || !tg.initData) return;

  refreshInFlight = true;
  syncRefreshButton(btn);
  setProfileLoading(true);

  try {
    var user = await authenticateWithTelegram(tg.initData, { force: true });
    if (user && user.photoUrl) {
      user = Object.assign({}, user, { photoUrl: bustAvatarUrl(user.photoUrl) });
    }
    setProfileFromUser(user);
    startRefreshCooldown(btn);
  } catch (err) {
    console.warn("[profile-refresh]", err.message);
    if (currentUser) setProfileFromUser(currentUser);
    syncRefreshButton(btn);
  } finally {
    refreshInFlight = false;
    syncRefreshButton(btn);
  }
}

function applyRefreshIconMask(btn) {
  var icon = btn && btn.querySelector(".profile-refresh-btn__icon");
  if (!icon) return;
  icon.style.maskImage = profileRefreshMask;
  icon.style.webkitMaskImage = profileRefreshMask;
}

export function bindProfileRefresh() {
  var btn = document.getElementById("btnProfileRefresh");
  if (!btn) return;

  var tg = getTelegramWebApp();
  if (!tg || !tg.initData) {
    btn.hidden = true;
    return;
  }

  applyRefreshIconMask(btn);
  restoreCooldownFromStorage(btn);
  btn.addEventListener("click", function () {
    refreshProfile(btn);
  });

  onLanguageChange(function () {
    syncRefreshButton(btn);
  });
}
