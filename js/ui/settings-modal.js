import { t, setLanguage, getLanguage } from "../i18n/index.js";
import { setLanguageSetting } from "../app/settings.js";
import { setMusicEnabled, isMusicEnabled } from "../app/music.js";

function getSettingsModal() {
  return document.getElementById("settingsModal");
}

function syncSettingsModalUi() {
  var modal = getSettingsModal();
  if (!modal) return;

  var musicToggle = document.getElementById("settingsMusicToggle");
  if (musicToggle) {
    musicToggle.checked = isMusicEnabled();
    musicToggle.setAttribute("aria-checked", musicToggle.checked ? "true" : "false");
  }

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
  modal.removeAttribute("hidden");
  var closeBtn = modal.querySelector(".modal__close-btn");
  if (closeBtn) closeBtn.focus();
  document.documentElement.style.overflow = "hidden";
}

function closeSettingsModal() {
  var modal = getSettingsModal();
  if (!modal) return;
  modal.setAttribute("hidden", "");
  document.documentElement.style.overflow = "";
  var opener = document.getElementById("btnOpenSettings");
  if (opener) opener.focus();
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
      setMusicEnabled(enabled, { immediate: enabled });
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
