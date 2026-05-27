import { MESSAGES, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from "./translations.js";

var currentLang = DEFAULT_LANGUAGE;
/** @type {Set<(lang: string) => void>} */
var listeners = new Set();

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, function (_m, key) {
    return params[key] != null ? String(params[key]) : "";
  });
}

export function getLanguage() {
  return currentLang;
}

export function t(key, params) {
  var pack = MESSAGES[currentLang] || MESSAGES[DEFAULT_LANGUAGE];
  var fallback = MESSAGES[DEFAULT_LANGUAGE];
  var text = (pack && pack[key]) || (fallback && fallback[key]) || key;
  return interpolate(text, params);
}

export function setLanguage(lang) {
  var next = SUPPORTED_LANGUAGES.indexOf(lang) >= 0 ? lang : DEFAULT_LANGUAGE;
  if (next === currentLang) return;
  currentLang = next;
  document.documentElement.lang = next === "uk" ? "uk" : next === "ru" ? "ru" : "en";
  applyDomTranslations();
  listeners.forEach(function (fn) {
    fn(currentLang);
  });
}

export function initLanguage(lang) {
  currentLang = SUPPORTED_LANGUAGES.indexOf(lang) >= 0 ? lang : DEFAULT_LANGUAGE;
  document.documentElement.lang = currentLang === "uk" ? "uk" : currentLang === "ru" ? "ru" : "en";
  applyDomTranslations();
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return function () {
    listeners.delete(fn);
  };
}

export function applyDomTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
    var key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });

  document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
    var key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });

  document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
    var key = el.getAttribute("data-i18n-title");
    if (key) el.setAttribute("title", t(key));
  });

  document.querySelectorAll("[data-i18n-option]").forEach(function (el) {
    var key = el.getAttribute("data-i18n-option");
    if (key) el.textContent = t(key);
  });

  var titleKey = document.documentElement.getAttribute("data-i18n-document-title");
  if (titleKey) document.title = t(titleKey);
}

export function formatTimeOption(seconds) {
  var sec = parseInt(String(seconds), 10);
  if (Number.isNaN(sec)) return "—";
  if (sec < 60) return t("time.secShort", { n: sec });
  return t("time.minShort", { n: Math.floor(sec / 60) });
}

export function formatIncrementOption(seconds) {
  return t("time.increment", { n: parseInt(String(seconds), 10) || 0 });
}

export function formatLobbyMetaLocal(settings) {
  if (!settings) return "—";
  if (settings.secondsPerPlayer == null) return "—";
  var sec = parseInt(String(settings.secondsPerPlayer), 10);
  if (Number.isNaN(sec)) return "—";
  var allowedBase = [15, 30, 60, 120, 180];
  if (allowedBase.indexOf(sec) === -1) return "—";
  var inc = settings.incrementSeconds != null ? settings.incrementSeconds : "0";
  return t("time.meta", {
    base: formatTimeOption(sec),
    inc: inc,
  });
}
