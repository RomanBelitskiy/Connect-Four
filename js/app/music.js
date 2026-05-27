import { getSettings, setMusicEnabledSetting } from "./settings.js";

/** Place your track at public/audio/background.mp3 */
var MUSIC_SRC = "/audio/background.mp3";

/** @type {HTMLAudioElement|null} */
var audio = null;
var musicEnabled = false;
/** Waiting for a user gesture before the first successful play this session. */
var awaitingGesture = false;
/** Audio was unlocked by a successful play() in this page session. */
var sessionUnlocked = false;
var listenersBound = false;
var lastGestureAt = 0;

function ensureAudio() {
  if (audio) return audio;

  audio = document.createElement("audio");
  audio.src = MUSIC_SRC;
  audio.loop = true;
  audio.preload = "auto";
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  audio.style.display = "none";
  document.body.appendChild(audio);
  audio.load();
  return audio;
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

function stopAndReset() {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

function onUserGesture() {
  if (!musicEnabled || !awaitingGesture) return;
  attemptPlay(true);
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
  musicEnabled = stored.musicEnabled;
  awaitingGesture = musicEnabled;
  sessionUnlocked = false;
  bindLifecycleListeners();

  if (musicEnabled) ensureAudio();
}

export function isMusicEnabled() {
  return musicEnabled;
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
    stopAndReset();
    return;
  }

  ensureAudio();

  if (options.immediate) {
    attemptPlay(true);
    return;
  }

  awaitingGesture = true;
}
