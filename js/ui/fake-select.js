/** Custom dropdowns inside modals (time, increment, etc.). */

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
  var preferUp = wrap.getAttribute("data-fake-select-flip") === "up";
  var flipUp = false;

  if (preferUp) {
    flipUp = naturalHeight <= spaceAbove || spaceAbove >= spaceBelow;
  } else if (naturalHeight <= spaceBelow) {
    flipUp = false;
  } else if (naturalHeight <= spaceAbove) {
    flipUp = true;
  } else {
    flipUp = spaceAbove >= spaceBelow;
  }

  var modalBody = wrap.closest(".modal__body--game");
  if (modalBody && !flipUp && !preferUp && naturalHeight > spaceBelow) {
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

function closeFakeSelectWrap(wrap) {
  var list = getFakeSelectList(wrap);
  var trig = wrap.querySelector(".fake-select__trigger");
  wrap.classList.remove("is-open");
  if (trig) trig.setAttribute("aria-expanded", "false");
  if (list) list.hidden = true;
  clearFakeSelectListPosition(list);
  restoreFakeSelectList(wrap);
}

function repositionOpenFakeSelects(modal) {
  if (!modal || modal.hasAttribute("hidden")) return;
  modal.querySelectorAll("[data-fake-select].is-open").forEach(positionFakeSelectList);
}

function ensureViewportListeners() {
  if (window.__miniGamesFakeSelectViewportBound) return;
  window.__miniGamesFakeSelectViewportBound = true;
  window.addEventListener("resize", function () {
    document.querySelectorAll(".modal:not([hidden])").forEach(repositionOpenFakeSelects);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      document.querySelectorAll(".modal:not([hidden])").forEach(repositionOpenFakeSelects);
    });
    window.visualViewport.addEventListener("scroll", function () {
      document.querySelectorAll(".modal:not([hidden])").forEach(repositionOpenFakeSelects);
    });
  }
}

/**
 * @param {HTMLElement} modal
 * @param {{ labelForTimeValue: (v: string) => string, labelForIncValue: (v: string) => string, labelForFirstMoveValue?: (v: string) => string }} labels
 */
export function bindFakeSelectsInModal(modal, labels) {
  if (!modal) return;

  function docClose(ev) {
    if (modal.hasAttribute("hidden")) return;
    modal.querySelectorAll("[data-fake-select].is-open").forEach(function (fs) {
      if (!fakeSelectContains(fs, ev.target)) closeFakeSelectWrap(fs);
    });
  }

  var modalBody = modal.querySelector(".modal__body--game");
  if (modalBody) {
    modalBody.addEventListener(
      "scroll",
      function () {
        repositionOpenFakeSelects(modal);
      },
      { passive: true }
    );
  }

  ensureViewportListeners();

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
        list.hidden = false;
        wrap.classList.add("is-open");
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
        if (opt.hasAttribute("data-time-value")) {
          valSpan.textContent = labels.labelForTimeValue(opt.getAttribute("data-time-value"));
          valSpan.setAttribute("data-time-value", opt.getAttribute("data-time-value") || "");
        } else if (opt.hasAttribute("data-inc-value")) {
          valSpan.textContent = labels.labelForIncValue(opt.getAttribute("data-inc-value"));
          valSpan.setAttribute("data-inc-value", opt.getAttribute("data-inc-value") || "");
        } else if (opt.hasAttribute("data-first-move-value") && labels.labelForFirstMoveValue) {
          valSpan.textContent = labels.labelForFirstMoveValue(opt.getAttribute("data-first-move-value"));
          valSpan.setAttribute("data-first-move-value", opt.getAttribute("data-first-move-value") || "");
        } else {
          valSpan.textContent = opt.textContent.replace(/\s+/g, " ").trim();
        }
        options.forEach(function (o) {
          var sel = o === opt;
          o.setAttribute("aria-selected", sel ? "true" : "false");
          o.classList.toggle("is-selected", sel);
        });
        closeFakeSelectWrap(wrap);
      });
    });
  });

  if (!modal.dataset.fakeSelectDocBound) {
    modal.dataset.fakeSelectDocBound = "1";
    document.addEventListener("mousedown", docClose);
    document.addEventListener("touchstart", docClose);
  }
}

export function closeAllFakeSelects(modal) {
  if (!modal) return;
  modal.querySelectorAll("[data-fake-select].is-open").forEach(closeFakeSelectWrap);
}

export function closeOpenFakeSelectOnEscape(modal) {
  var openFs = modal && modal.querySelector("[data-fake-select].is-open");
  if (!openFs) return false;
  closeFakeSelectWrap(openFs);
  return true;
}
