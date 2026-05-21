/** Telegram Mini Apps 2.0 — viewport, safe area, share. */

var tgInstance = null;

function px(value) {
  return typeof value === "number" && value > 0 ? value + "px" : "0px";
}

function applyViewportCss(tg) {
  var root = document.documentElement;
  var stable = tg.viewportStableHeight || tg.viewportHeight || window.innerHeight;
  root.style.setProperty("--viewport-stable-height", px(stable));

  var safe = tg.safeAreaInset || {};
  var content = tg.contentSafeAreaInset || {};

  root.style.setProperty("--safe-top", px(safe.top));
  root.style.setProperty("--safe-bottom", px(safe.bottom));
  root.style.setProperty("--safe-left", px(safe.left));
  root.style.setProperty("--safe-right", px(safe.right));
  root.style.setProperty("--content-safe-top", px(content.top));
  root.style.setProperty("--content-safe-bottom", px(content.bottom));
  root.style.setProperty("--content-safe-left", px(content.left));
  root.style.setProperty("--content-safe-right", px(content.right));
}

function bindViewportEvents(tg) {
  if (typeof tg.onEvent !== "function") return;

  tg.onEvent("viewportChanged", function (params) {
    if (!params || params.isStateStable) {
      applyViewportCss(tg);
    }
  });
  tg.onEvent("safeAreaChanged", function () {
    applyViewportCss(tg);
  });
  tg.onEvent("contentSafeAreaChanged", function () {
    applyViewportCss(tg);
  });
}

function isMobilePlatform(platform) {
  return platform === "ios" || platform === "android";
}

/**
 * Ініціалізація Mini App 2.0: stable viewport, safe area, без стрибків.
 * @returns {object|null}
 */
export function initTelegramApp() {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return null;

  tgInstance = tg;
  tg.ready();

  if (typeof tg.disableVerticalSwipes === "function") {
    tg.disableVerticalSwipes();
  }

  if (typeof tg.setHeaderColor === "function") tg.setHeaderColor("#0a1628");
  if (typeof tg.setBackgroundColor === "function") tg.setBackgroundColor("#0a1628");
  if (typeof tg.setBottomBarColor === "function") tg.setBottomBarColor("#0a1628");

  var platform = tg.platform || "";
  if (isMobilePlatform(platform)) {
    if (!tg.isExpanded && typeof tg.expand === "function") {
      tg.expand();
    }
  } else if (typeof tg.exitFullscreen === "function" && tg.isFullscreen) {
    tg.exitFullscreen();
  }

  applyViewportCss(tg);
  bindViewportEvents(tg);

  return tg;
}

var backButtonHandler = null;

export function bindTelegramBackButton(handler) {
  var tg = getTelegramWebApp();
  backButtonHandler = typeof handler === "function" ? handler : null;
  if (!tg || !tg.BackButton || typeof tg.BackButton.onClick !== "function") return;

  tg.BackButton.onClick(function () {
    if (backButtonHandler) backButtonHandler();
  });
}

export function setTelegramBackVisible(visible) {
  var tg = getTelegramWebApp();
  if (!tg || !tg.BackButton) return;
  if (visible && typeof tg.BackButton.show === "function") {
    tg.BackButton.show();
  } else if (!visible && typeof tg.BackButton.hide === "function") {
    tg.BackButton.hide();
  }
}

export function getTelegramWebApp() {
  return tgInstance || (window.Telegram && window.Telegram.WebApp) || null;
}

/**
 * Поділитися посиланням лише через Telegram (контакти / чати).
 * @param {string} url
 * @param {string} [text]
 * @returns {boolean}
 */
export function shareLobbyInvite(url, text) {
  var tg = getTelegramWebApp();
  if (!tg || !url) return false;

  var message = text || "Connect Four — грай разом!";

  if (typeof tg.shareUrl === "function") {
    tg.shareUrl(url, message);
    return true;
  }

  if (typeof tg.openTelegramLink === "function") {
    var shareLink =
      "https://t.me/share/url?url=" +
      encodeURIComponent(url) +
      "&text=" +
      encodeURIComponent(message);
    tg.openTelegramLink(shareLink);
    return true;
  }

  return false;
}

/**
 * Mini Apps 2.0 — shareMessage з prepared inline message від бота.
 * @param {string} messageId
 * @returns {boolean}
 */
export function sharePreparedMessage(messageId) {
  var tg = getTelegramWebApp();
  if (!tg || !messageId || typeof tg.shareMessage !== "function") return false;
  tg.shareMessage(messageId);
  return true;
}
