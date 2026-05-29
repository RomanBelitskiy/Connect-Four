import { t, setLanguage, getLanguage } from "../i18n/index.js";
import { setLanguageSetting } from "../app/settings.js";
import { setMusicEnabled, isMusicEnabled, getMusicVolume, setMusicVolume } from "../app/music.js";
import { closeModal, openModal } from "./modal-utils.js";

function getSettingsModal() {
  return document.getElementById("settingsModal");
}

var MUSIC_UI_MS = 280;

/** @type {number} */
var musicVolumeAnimId = 0;

function formatVolumePercent(volume) {
  return Math.round(Math.min(1, Math.max(0, volume)) * 100) + "%";
}

function cancelMusicVolumeAnimation() {
  if (musicVolumeAnimId) {
    cancelAnimationFrame(musicVolumeAnimId);
    musicVolumeAnimId = 0;
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * @param {number} targetPct
 * @param {number} durationMs
 * @param {(() => void)|undefined} onDone
 */
function animateMusicVolumeSlider(targetPct, durationMs, onDone) {
  var slider = document.getElementById("settingsMusicVolume");
  var valueEl = document.getElementById("settingsMusicVolumeValue");
  if (!slider) {
    if (onDone) onDone();
    return;
  }

  cancelMusicVolumeAnimation();
  var startPct = parseInt(slider.value, 10);
  if (Number.isNaN(startPct)) startPct = 0;
  if (startPct === targetPct) {
    slider.value = String(targetPct);
    if (valueEl) valueEl.textContent = targetPct + "%";
    if (onDone) onDone();
    return;
  }

  var startTime = performance.now();

  function frame(now) {
    var t = Math.min(1, (now - startTime) / durationMs);
    var pct = Math.round(startPct + (targetPct - startPct) * easeOutCubic(t));
    slider.value = String(pct);
    if (valueEl) valueEl.textContent = pct + "%";
    if (t < 1) {
      musicVolumeAnimId = requestAnimationFrame(frame);
      return;
    }
    musicVolumeAnimId = 0;
    slider.value = String(targetPct);
    if (valueEl) valueEl.textContent = targetPct + "%";
    if (onDone) onDone();
  }

  musicVolumeAnimId = requestAnimationFrame(frame);
}

function syncMusicVolumeUi() {
  cancelMusicVolumeAnimation();
  var slider = document.getElementById("settingsMusicVolume");
  var valueEl = document.getElementById("settingsMusicVolumeValue");
  var musicToggle = document.getElementById("settingsMusicToggle");
  var enabled = isMusicEnabled();
  var volume = enabled ? getMusicVolume() : 0;
  var pct = Math.round(volume * 100);

  if (slider) slider.value = String(pct);
  if (valueEl) valueEl.textContent = formatVolumePercent(volume);
  if (musicToggle) {
    musicToggle.checked = enabled;
    musicToggle.setAttribute("aria-checked", enabled ? "true" : "false");
  }
}

function syncSettingsModalUi() {
  var modal = getSettingsModal();
  if (!modal) return;

  syncMusicVolumeUi();

  var lang = getLanguage();
  modal.querySelectorAll('.segmented__btn[data-segment="language"]').forEach(function (btn) {
    var value = btn.getAttribute("data-value");
    var on = value === lang;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  var seg = modal.querySelector('.segmented[data-segment-group="language"]');
  if (seg) seg.setAttribute("data-active", lang);
}

export function openSettingsModal() {
  var modal = getSettingsModal();
  if (!modal) return;
  syncSettingsModalUi();
  openModal(modal);
}

function closeSettingsModal() {
  var modal = getSettingsModal();
  if (!modal) return;
  var opener = document.getElementById("btnOpenSettings");
  closeModal(modal, opener);
}

export function bindSettingsModal() {
  var modal = getSettingsModal();
  var openBtn = document.getElementById("btnOpenSettings");
  if (openBtn) {
    openBtn.addEventListener("click", openSettingsModal);
  }
  if (!modal) return;

  modal.querySelectorAll("[data-settings-close]").forEach(function (el) {
    el.addEventListener("click", closeSettingsModal);
  });

  var musicToggle = document.getElementById("settingsMusicToggle");
  if (musicToggle) {
    musicToggle.addEventListener("change", function () {
      var enabled = musicToggle.checked;
      musicToggle.setAttribute("aria-checked", enabled ? "true" : "false");

      if (enabled) {
        setMusicEnabled(true, { immediate: true });
        var targetPct = Math.round(getMusicVolume() * 100);
        animateMusicVolumeSlider(targetPct, MUSIC_UI_MS, syncMusicVolumeUi);
      } else {
        setMusicEnabled(false);
        animateMusicVolumeSlider(0, MUSIC_UI_MS, syncMusicVolumeUi);
      }
    });
  }

  var volumeSlider = document.getElementById("settingsMusicVolume");
  if (volumeSlider) {
    volumeSlider.addEventListener("input", function () {
      var pct = parseInt(volumeSlider.value, 10);
      if (Number.isNaN(pct)) return;

      setMusicVolume(pct / 100);
      syncMusicVolumeUi();
    });
  }

  modal.querySelectorAll('.segmented__btn[data-segment="language"]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      var lang = btn.getAttribute("data-value");
      if (!lang) return;
      setLanguageSetting(lang);
      setLanguage(lang);
      syncSettingsModalUi();
    });
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (!modal || modal.hasAttribute("hidden")) return;
    closeSettingsModal();
    ev.preventDefault();
  });
}
