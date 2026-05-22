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
  list.style.overflowY = "";
  list.style.zIndex = "";
}

function spacingTokenPx(token) {
  var raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  var fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  if (raw.endsWith("rem")) return parseFloat(raw) * fs || 4;
  if (raw.endsWith("px")) return parseFloat(raw) || 4;
  return parseFloat(raw) || 4;
}

function getViewportHeight() {
  return window.visualViewport ? window.visualViewport.height : window.innerHeight;
}

function getFakeSelectList(wrap) {
  return wrap._portaledList || wrap.querySelector(".fake-select__list");
}

function fakeSelectContains(wrap, target) {
  if (!wrap || !target) return false;
  if (wrap.contains(target)) return true;
  var list = wrap._portaledList;
  return !!(list && list.contains(target));
}

function portalFakeSelectList(wrap, list) {
  var modal = wrap.closest(".modal");
  if (!modal || wrap._portaledList) return;
  wrap._portaledList = list;
  wrap._portaledListParent = list.parentElement;
  wrap._portaledListNext = list.nextSibling;
  list.classList.add("fake-select__list--portaled");
  modal.appendChild(list);
}

function restoreFakeSelectList(wrap) {
  var list = wrap._portaledList;
  if (!list || !wrap._portaledListParent) return;
  list.classList.remove("fake-select__list--portaled");
  wrap._portaledListParent.insertBefore(list, wrap._portaledListNext || null);
  delete wrap._portaledList;
  delete wrap._portaledListParent;
  delete wrap._portaledListNext;
}

function getFakeSelectBounds(wrap) {
  var viewportH = getViewportHeight();
  var pad = spacingTokenPx("--spacing-sm");
  var gap = spacingTokenPx("--spacing-xs");
  var modal = wrap.closest(".modal");
  var footer = modal && modal.querySelector(".modal__footer");
  var header = modal && modal.querySelector(".modal__header");

  var minTop = pad;
  var maxBottom = viewportH - pad;

  if (header) {
    minTop = Math.max(minTop, header.getBoundingClientRect().bottom + gap);
  }
  if (footer) {
    maxBottom = Math.min(maxBottom, footer.getBoundingClientRect().top - gap);
  }

  return { minTop, maxBottom, gap, pad };
}

function positionFakeSelectList(wrap) {
  var trigger = wrap.querySelector(".fake-select__trigger");
  var list = getFakeSelectList(wrap);
  if (!trigger || !list || list.hidden || !wrap.classList.contains("is-open")) return;

  var bounds = getFakeSelectBounds(wrap);
  var gap = bounds.gap;
  var rect = trigger.getBoundingClientRect();

  list.style.position = "fixed";
  list.style.left = rect.left + "px";
  list.style.width = rect.width + "px";
  list.style.right = "auto";
  list.style.zIndex = "50";
  list.style.maxHeight = "none";
  list.style.overflowY = "visible";

  var naturalHeight = list.scrollHeight;
  var spaceBelow = bounds.maxBottom - rect.bottom - gap;
  var spaceAbove = rect.top - bounds.minTop - gap;
  var flipUp = false;

  if (naturalHeight <= spaceBelow) {
    flipUp = false;
  } else if (naturalHeight <= spaceAbove) {
    flipUp = true;
  } else {
    flipUp = spaceAbove >= spaceBelow;
  }

  var modalBody = wrap.closest(".modal__body--game");
  if (modalBody && !flipUp && naturalHeight > spaceBelow) {
    modalBody.scrollTop += naturalHeight - spaceBelow;
    rect = trigger.getBoundingClientRect();
    bounds = getFakeSelectBounds(wrap);
    spaceBelow = bounds.maxBottom - rect.bottom - gap;
    spaceAbove = rect.top - bounds.minTop - gap;

    if (naturalHeight <= spaceBelow) {
      flipUp = false;
    } else if (naturalHeight <= spaceAbove) {
      flipUp = true;
    } else {
      flipUp = spaceAbove >= spaceBelow;
    }
  }

  var available = flipUp ? spaceAbove : spaceBelow;
  var viewportH = getViewportHeight();

  if (flipUp) {
    list.style.top = "auto";
    list.style.bottom = viewportH - rect.top + gap + "px";
  } else {
    list.style.bottom = "auto";
    list.style.top = rect.bottom + gap + "px";
  }

  if (naturalHeight > available) {
    list.style.maxHeight = Math.max(0, available) + "px";
    list.style.overflowY = "auto";
  } else {
    list.style.maxHeight = "none";
    list.style.overflowY = "visible";
  }
}

function repositionOpenLobbyFakeSelects() {
  var modal = getCreateLobbyModal();
  if (!modal || modal.hasAttribute("hidden")) return;
  modal.querySelectorAll("[data-fake-select].is-open").forEach(positionFakeSelectList);
}

function closeFakeSelectWrap(wrap) {
  wrap.classList.remove("is-open");
  var list = getFakeSelectList(wrap);
  var trig = wrap.querySelector(".fake-select__trigger");
  if (list) list.hidden = true;
  clearFakeSelectListPosition(list);
  restoreFakeSelectList(wrap);
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
        if (!fakeSelectContains(fs, ev.target)) closeFakeSelectWrap(fs);
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
          portalFakeSelectList(wrap, list);
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
