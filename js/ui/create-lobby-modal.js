import { startLobbyFromSettings, leaveActiveLobby } from "../game/lobby-session.js";
import { refreshLobbies } from "../app/shell.js";
import { fetchActiveLobby } from "../api/client.js";
import { confirmReplaceLobby } from "./replace-lobby-modal.js";
import { userErrorMessage } from "../utils/errors.js";

async function createLobbyFlow(settings) {
  var existing = await fetchActiveLobby();
  if (existing) {
    var ok = await confirmReplaceLobby({ mode: "create" });
    if (!ok) return;
    await leaveActiveLobby(existing.id);
    await startLobbyFromSettings(settings, true);
    await refreshLobbies();
    return;
  }

  try {
    await startLobbyFromSettings(settings, false);
  } catch (err) {
    if (err && (err.code === "active_lobby_exists" || err.message === "active_lobby_exists")) {
      var retryOk = await confirmReplaceLobby({ mode: "create" });
      if (!retryOk) return;
      await leaveActiveLobby();
      await startLobbyFromSettings(settings, true);
    } else {
      throw err;
    }
  }
  await refreshLobbies();
}

function getCreateLobbyModal() {
  return document.getElementById("createLobbyModal");
}

function clearFakeSelectListPosition(list) {
  if (!list) return;
  list.style.position = "";
  list.style.top = "";
  list.style.bottom = "";
  list.style.left = "";
  list.style.right = "";
  list.style.width = "";
  list.style.maxHeight = "";
  list.style.zIndex = "";
}

function spacingXsPx() {
  var raw = getComputedStyle(document.documentElement).getPropertyValue("--spacing-xs").trim();
  var fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  if (raw.endsWith("rem")) return parseFloat(raw) * fs || 4;
  if (raw.endsWith("px")) return parseFloat(raw) || 4;
  return 4;
}

function positionFakeSelectList(wrap) {
  var trigger = wrap.querySelector(".fake-select__trigger");
  var list = wrap.querySelector(".fake-select__list");
  if (!trigger || !list || list.hidden || !wrap.classList.contains("is-open")) return;

  var rect = trigger.getBoundingClientRect();
  var gap = spacingXsPx();
  var pad = spacingXsPx();
  var viewportH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  var spaceBelow = viewportH - rect.bottom - gap;
  var spaceAbove = rect.top - gap;
  var minComfort = 120;
  var flipUp = spaceBelow < minComfort && spaceAbove > spaceBelow;

  list.style.position = "fixed";
  list.style.left = rect.left + "px";
  list.style.width = rect.width + "px";
  list.style.right = "auto";
  list.style.zIndex = "60";

  var maxLen = viewportH * 0.45;
  if (flipUp) {
    list.style.bottom = viewportH - rect.top + gap + "px";
    list.style.top = "auto";
    list.style.maxHeight = Math.min(Math.max(0, spaceAbove - pad), maxLen) + "px";
  } else {
    list.style.top = rect.bottom + gap + "px";
    list.style.bottom = "auto";
    list.style.maxHeight = Math.min(Math.max(0, spaceBelow - pad), maxLen) + "px";
  }
}

function repositionOpenLobbyFakeSelects() {
  var modal = getCreateLobbyModal();
  if (!modal || modal.hasAttribute("hidden")) return;
  modal.querySelectorAll("[data-fake-select].is-open").forEach(positionFakeSelectList);
}

function closeFakeSelectWrap(wrap) {
  wrap.classList.remove("is-open");
  var list = wrap.querySelector(".fake-select__list");
  var trig = wrap.querySelector(".fake-select__trigger");
  if (list) list.hidden = true;
  clearFakeSelectListPosition(list);
  if (trig) trig.setAttribute("aria-expanded", "false");
}

function openCreateLobbyModal() {
  var modal = getCreateLobbyModal();
  if (!modal) return;
  modal.removeAttribute("hidden");
  var closeBtn = modal.querySelector(".modal__close-btn");
  if (closeBtn) closeBtn.focus();
  document.documentElement.style.overflow = "hidden";
}

function closeCreateLobbyModal() {
  var modal = getCreateLobbyModal();
  if (!modal) return;
  modal.querySelectorAll("[data-fake-select].is-open").forEach(closeFakeSelectWrap);
  modal.setAttribute("hidden", "");
  document.documentElement.style.overflow = "";
  var opener = document.getElementById("btnOpenCreateLobby");
  if (opener) opener.focus();
}

function getLobbyModalSettings() {
  var activeVisBtn = document.querySelector('.segmented__btn[data-segment="visibility"].is-active');
  var visibility = activeVisBtn && activeVisBtn.getAttribute("data-value") ? activeVisBtn.getAttribute("data-value") : "open";
  var timeEl = document.getElementById("lobbyTimeSeconds");
  var incEl = document.getElementById("lobbyIncrementSeconds");
  var activePlayerChipBtn = document.querySelector('.segmented__btn[data-segment="player-chip"].is-active');
  var playerChipChoice =
    activePlayerChipBtn && activePlayerChipBtn.getAttribute("data-value")
      ? activePlayerChipBtn.getAttribute("data-value")
      : "yellow";
  return {
    visibility: visibility,
    secondsPerPlayer: timeEl ? timeEl.value : "60",
    incrementSeconds: incEl ? incEl.value : "1",
    playerChipColor: playerChipChoice,
  };
}

export function bindCreateLobbyModal() {
  var modal = getCreateLobbyModal();
  var openBtn = document.getElementById("btnOpenCreateLobby");
  if (openBtn) {
    openBtn.addEventListener("click", openCreateLobbyModal);
  }
  if (!modal) return;

  modal.querySelectorAll("[data-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeCreateLobbyModal);
  });

  modal.querySelectorAll('.segmented__btn[data-segment="visibility"]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      modal.querySelectorAll('.segmented__btn[data-segment="visibility"]').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      var seg = btn.closest(".segmented--thumb");
      if (seg) {
        seg.setAttribute("data-active", btn.getAttribute("data-value") === "closed" ? "closed" : "open");
      }
    });
  });

  modal.querySelectorAll('.segmented__btn[data-segment="player-chip"]').forEach(function (btn) {
    btn.addEventListener("click", function () {
      modal.querySelectorAll('.segmented__btn[data-segment="player-chip"]').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      var seg = btn.closest(".segmented--thumb");
      if (seg) seg.setAttribute("data-active", btn.getAttribute("data-value"));
    });
  });

  var confirmBtn = document.getElementById("btnCreateLobbyConfirm");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function () {
      var settings = getLobbyModalSettings();
      closeCreateLobbyModal();
      createLobbyFlow(settings).catch(function (err) {
        window.alert(userErrorMessage(err) || "Не вдалося створити лобі");
      });
    });
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (modal.hasAttribute("hidden")) return;
    var openFs = modal.querySelector("[data-fake-select].is-open");
    if (openFs) {
      closeFakeSelectWrap(openFs);
      ev.preventDefault();
      return;
    }
    closeCreateLobbyModal();
  });

  function bindLobbyFakeSelects() {
    function docClose(ev) {
      if (modal.hasAttribute("hidden")) return;
      modal.querySelectorAll("[data-fake-select].is-open").forEach(function (fs) {
        if (!fs.contains(ev.target)) closeFakeSelectWrap(fs);
      });
    }

    var modalBody = modal.querySelector(".modal__body--game");
    if (modalBody) {
      modalBody.addEventListener("scroll", repositionOpenLobbyFakeSelects, { passive: true });
    }

    if (!window.__connectFourFakeSelectViewportBound) {
      window.__connectFourFakeSelectViewportBound = true;
      window.addEventListener("resize", repositionOpenLobbyFakeSelects);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", repositionOpenLobbyFakeSelects);
        window.visualViewport.addEventListener("scroll", repositionOpenLobbyFakeSelects);
      }
    }

    modal.querySelectorAll("[data-fake-select]").forEach(function (wrap) {
      var trigger = wrap.querySelector(".fake-select__trigger");
      var list = wrap.querySelector(".fake-select__list");
      var hidden = wrap.querySelector('input[type="hidden"]');
      var valSpan = wrap.querySelector(".fake-select__value");
      var options = list ? list.querySelectorAll('[role="option"]') : [];
      if (!trigger || !list || !hidden || !valSpan) return;

      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var opening = !wrap.classList.contains("is-open");
        modal.querySelectorAll("[data-fake-select].is-open").forEach(function (w) {
          if (w !== wrap) closeFakeSelectWrap(w);
        });
        if (opening) {
          wrap.classList.add("is-open");
          list.hidden = false;
          trigger.setAttribute("aria-expanded", "true");
          positionFakeSelectList(wrap);
          requestAnimationFrame(function () {
            positionFakeSelectList(wrap);
          });
        } else {
          closeFakeSelectWrap(wrap);
        }
      });

      options.forEach(function (opt) {
        opt.addEventListener("click", function (e) {
          e.stopPropagation();
          hidden.value = opt.getAttribute("data-value") || "";
          valSpan.textContent = opt.textContent.replace(/\s+/g, " ").trim();
          options.forEach(function (o) {
            var sel = o === opt;
            o.setAttribute("aria-selected", sel ? "true" : "false");
            o.classList.toggle("is-selected", sel);
          });
          closeFakeSelectWrap(wrap);
        });
      });
    });

    document.addEventListener("mousedown", docClose);
    document.addEventListener("touchstart", docClose);
  }

  bindLobbyFakeSelects();
}
