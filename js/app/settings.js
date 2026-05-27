import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "../i18n/translations.js";

var STORAGE_KEY = "connect-four:settings";

/** @type {{ language: string, musicEnabled: boolean }} */
var settings = {
  language: DEFAULT_LANGUAGE,
  musicEnabled: false,
};

function readStorage() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

function writeStorage() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        language: settings.language,
        musicEnabled: settings.musicEnabled,
      })
    );
  } catch (_e) {
    /* ignore quota / private mode */
  }
}

export function loadSettings() {
  var stored = readStorage();
  if (stored) {
    if (SUPPORTED_LANGUAGES.indexOf(stored.language) >= 0) {
      settings.language = stored.language;
    }
    if (typeof stored.musicEnabled === "boolean") {
      settings.musicEnabled = stored.musicEnabled;
    }
  }
  return getSettings();
}

export function getSettings() {
  return {
    language: settings.language,
    musicEnabled: settings.musicEnabled,
  };
}

export function setLanguageSetting(lang) {
  if (SUPPORTED_LANGUAGES.indexOf(lang) < 0) return getSettings();
  settings.language = lang;
  writeStorage();
  return getSettings();
}

export function setMusicEnabledSetting(enabled) {
  settings.musicEnabled = !!enabled;
  writeStorage();
  return getSettings();
}
