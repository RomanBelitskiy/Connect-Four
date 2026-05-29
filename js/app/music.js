import { getSettings, setMusicEnabledSetting, setMusicVolumeSetting } from "./settings.js";

/** Place your track at public/audio/background.mp3 */
var MUSIC_VERSION =
  typeof __MUSIC_VERSION__ !== "undefined" ? __MUSIC_VERSION__ : "dev";
var MUSIC_SRC = "/audio/background.mp3?v=" + MUSIC_VERSION;

/** @type {HTMLAudioElement|null} */
var audio = null;
var musicEnabled = false;
var musicVolume = 0.7;
/** Waiting for a user gesture before the first successful play this session. */
var awaitingGesture = false;
/** Audio was unlocked by a successful play() in this page session. */
var sessionUnlocked = false;
var listenersBound = false;
var lastGestureAt = 0;
/** Next play via switch should start from the beginning (not after volume-mute). */
var restartOnNextPlay = false;

function ensureAudio() {
  if (audio) return audio;

  audio = document.createElement("audio");
  audio.src = MUSIC_SRC;
  audio.loop = true;
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  audio.volume = musicVolume;
  audio.style.display = "none";
  document.body.appendChild(audio);
  audio.load();
  return audio;
}

function applyMusicVolume(volume) {
  musicVolume = Math.min(1, Math.max(0, volume));
  if (audio) audio.volume = musicVolume;
}

function isPlaying() {
  return !!(audio && !audio.paused && !audio.ended);
}

/**
 * @param {boolean} restart
 * @returns {Promise<boolean>}
 */
function attemptPlay(restart) {
  if (!musicEnabled) return Promise.resolve(false);

  var track = ensureAudio();
  if (restart) track.currentTime = 0;

  var playPromise;
  try {
    playPromise = track.play();
  } catch (_err) {
    awaitingGesture = true;
    return Promise.resolve(false);
  }

  if (!playPromise || typeof playPromise.then !== "function") {
    awaitingGesture = false;
    sessionUnlocked = true;
    return Promise.resolve(true);
  }

  return playPromise
    .then(function () {
      awaitingGesture = false;
      sessionUnlocked = true;
      return true;
    })
    .catch(function () {
      awaitingGesture = true;
      return false;
    });
}

function pauseWithoutReset() {
  if (!audio) return;
  audio.pause();
}

function stopAndReset() {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

function onUserGesture() {
  if (!musicEnabled || !awaitingGesture) return;
  var restart = restartOnNextPlay;
  attemptPlay(restart).then(function (ok) {
    if (ok) restartOnNextPlay = false;
  });
}

function handleGestureEvent() {
  var now = Date.now();
  if (now - lastGestureAt < 280) return;
  lastGestureAt = now;
  onUserGesture();
}

function handleAppVisible() {
  if (!musicEnabled || !sessionUnlocked || isPlaying()) return;
  attemptPlay(false).then(function (ok) {
    if (!ok) awaitingGesture = true;
  });
}

function bindLifecycleListeners() {
  if (listenersBound) return;
  listenersBound = true;

  document.addEventListener("touchend", handleGestureEvent, true);
  document.addEventListener("click", handleGestureEvent, true);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") handleAppVisible();
  });

  window.addEventListener("pageshow", function () {
    handleAppVisible();
  });

  window.addEventListener("focus", function () {
    handleAppVisible();
  });
}

export function initMusic() {
  var stored = getSettings();
  applyMusicVolume(stored.musicVolume);
  musicEnabled = stored.musicEnabled && musicVolume > 0;
  if (stored.musicEnabled && musicVolume <= 0) {
    setMusicEnabledSetting(false);
  }
  awaitingGesture = musicEnabled;
  sessionUnlocked = false;
  bindLifecycleListeners();

  if (musicEnabled) ensureAudio();
}

export function isMusicEnabled() {
  return musicEnabled;
}

export function getMusicVolume() {
  return musicVolume;
}

/**
 * @param {number} volume 0…1 (0 mutes playback but keeps last level in storage)
 */
export function setMusicVolume(volume) {
  var v = Math.min(1, Math.max(0, volume));
  if (v > 0) {
    applyMusicVolume(v);
    setMusicVolumeSetting(musicVolume);
    var track = ensureAudio();
    track.volume = musicVolume;
    if (!musicEnabled) {
      musicEnabled = true;
      setMusicEnabledSetting(true);
      bindLifecycleListeners();
      if (sessionUnlocked) {
        attemptPlay(false);
      } else {
        awaitingGesture = true;
      }
    }
    return;
  }

  if (musicEnabled) {
    musicEnabled = false;
    setMusicEnabledSetting(false);
    awaitingGesture = false;
    pauseWithoutReset();
  }
}

/**
 * @param {boolean} enabled
 * @param {{ immediate?: boolean }} [options]
 */
export function setMusicEnabled(enabled, options) {
  options = options || {};
  musicEnabled = !!enabled;
  setMusicEnabledSetting(musicEnabled);
  bindLifecycleListeners();

  if (!musicEnabled) {
    awaitingGesture = false;
    restartOnNextPlay = false;
    stopAndReset();
    return;
  }

  restartOnNextPlay = true;
  var track = ensureAudio();
  track.volume = musicVolume;

  if (options.immediate) {
    attemptPlay(true).then(function (ok) {
      if (ok) restartOnNextPlay = false;
      else awaitingGesture = true;
    });
    return;
  }

  awaitingGesture = true;
}
