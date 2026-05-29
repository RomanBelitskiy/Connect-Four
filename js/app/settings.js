import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "../i18n/translations.js";

var STORAGE_KEY = "connect-four:settings";

var DEFAULT_MUSIC_VOLUME = 0.7;

/** @type {{ language: string, musicEnabled: boolean, musicVolume: number }} */
var settings = {
  language: DEFAULT_LANGUAGE,
  musicEnabled: false,
  musicVolume: DEFAULT_MUSIC_VOLUME,
};

function normalizeMusicVolume(value) {
  var n = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(n)) return DEFAULT_MUSIC_VOLUME;
  return Math.min(1, Math.max(0, n));
}

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
        musicVolume: settings.musicVolume,
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
    if (stored.musicVolume != null) {
      settings.musicVolume = normalizeMusicVolume(stored.musicVolume);
    }
  }
  return getSettings();
}

export function getSettings() {
  return {
    language: settings.language,
    musicEnabled: settings.musicEnabled,
    musicVolume: settings.musicVolume,
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

export function setMusicVolumeSetting(volume) {
  settings.musicVolume = normalizeMusicVolume(volume);
  writeStorage();
  return getSettings();
}
