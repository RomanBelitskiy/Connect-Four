/** Shared modal open/close helpers with GPU-friendly slide animations. */

const MODAL_MS_DESKTOP = 300;
const MODAL_MS_TOUCH = 200;

/** @type {WeakMap<HTMLElement, { timer: number, sheet: Element | null, onTransitionEnd: (ev: TransitionEvent) => void }>} */
const closingModals = new WeakMap();

export function lockPageScroll() {
  document.documentElement.style.overflow = "hidden";
}

export function unlockPageScroll() {
  document.documentElement.style.overflow = "";
}

function anyModalOpen() {
  return !!document.querySelector(".modal:not([hidden])");
}

function syncScrollLock() {
  if (anyModalOpen()) lockPageScroll();
  else unlockPageScroll();
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isCoarsePointer() {
  return window.matchMedia("(pointer: coarse)").matches;
}

function modalDurationMs() {
  if (prefersReducedMotion()) return 0;
  return isCoarsePointer() ? MODAL_MS_TOUCH : MODAL_MS_DESKTOP;
}

function shouldAnimateModal() {
  return modalDurationMs() > 0;
}

function getSheet(modal) {
  return modal.querySelector(".modal__sheet");
}

function clearAnimating(modal, sheet) {
  modal.classList.remove("modal--animating");
  if (sheet) sheet.style.willChange = "";
}

function finishClose(modal, returnFocus, onClosed) {
  const pending = closingModals.get(modal);
  if (pending) {
    window.clearTimeout(pending.timer);
    if (pending.sheet && pending.onTransitionEnd) {
      pending.sheet.removeEventListener("transitionend", pending.onTransitionEnd);
    }
    closingModals.delete(modal);
  }

  clearAnimating(modal, getSheet(modal));
  modal.setAttribute("hidden", "");
  modal.classList.remove("modal--open");
  syncScrollLock();

  if (returnFocus && typeof returnFocus.focus === "function") {
    returnFocus.focus({ preventScroll: true });
  }
  if (typeof onClosed === "function") onClosed();
}

function scheduleFocus(modal, focusEl) {
  if (!focusEl) return;
  var delay = shouldAnimateModal() ? (isCoarsePointer() ? modalDurationMs() : 48) : 0;
  window.setTimeout(function () {
    if (!modal.hasAttribute("hidden")) focusEl.focus({ preventScroll: true });
  }, delay);
}

function markAnimating(modal, sheet) {
  modal.classList.add("modal--animating");
  if (sheet && shouldAnimateModal()) sheet.style.willChange = "transform";
}

function watchSheetTransition(modal, sheet, onDone) {
  if (!sheet || !shouldAnimateModal()) {
    onDone();
    return;
  }

  var timer = window.setTimeout(onDone, modalDurationMs() + 32);

  function onEnd(ev) {
    if (ev.target !== sheet || ev.propertyName !== "transform") return;
    window.clearTimeout(timer);
    sheet.removeEventListener("transitionend", onEnd);
    onDone();
  }

  sheet.addEventListener("transitionend", onEnd);
}

/**
 * @param {HTMLElement|null} modal
 * @param {{ focusSelector?: string }} [opts]
 */
export function openModal(modal, opts) {
  if (!modal) return;

  const pending = closingModals.get(modal);
  if (pending) {
    window.clearTimeout(pending.timer);
    if (pending.sheet && pending.onTransitionEnd) {
      pending.sheet.removeEventListener("transitionend", pending.onTransitionEnd);
    }
    closingModals.delete(modal);
  }

  var sheet = getSheet(modal);
  modal.removeAttribute("hidden");
  modal.classList.remove("modal--open");
  lockPageScroll();

  if (!shouldAnimateModal()) {
    modal.classList.add("modal--open");
  } else {
    markAnimating(modal, sheet);
    requestAnimationFrame(function () {
      if (!modal.hasAttribute("hidden")) modal.classList.add("modal--open");
    });
    watchSheetTransition(modal, sheet, function () {
      clearAnimating(modal, sheet);
    });
  }

  var sel = opts && opts.focusSelector;
  var focusEl = sel ? modal.querySelector(sel) : modal.querySelector(".modal__close-btn");
  scheduleFocus(modal, focusEl);
}

/**
 * @param {HTMLElement|null} modal
 * @param {HTMLElement|null} [returnFocus]
 * @param {{ onClosed?: () => void }} [opts]
 */
export function closeModal(modal, returnFocus, opts) {
  if (!modal || modal.hasAttribute("hidden")) return;

  const onClosed = opts && opts.onClosed;

  if (!shouldAnimateModal() || !modal.classList.contains("modal--open")) {
    finishClose(modal, returnFocus, onClosed);
    return;
  }

  var sheet = getSheet(modal);
  markAnimating(modal, sheet);
  modal.classList.remove("modal--open");

  function done() {
    finishClose(modal, returnFocus, onClosed);
  }

  const timer = window.setTimeout(done, modalDurationMs() + 32);

  function onEnd(ev) {
    if (sheet && ev.target !== sheet) return;
    if (ev.propertyName !== "transform") return;
    window.clearTimeout(timer);
    done();
  }

  closingModals.set(modal, { timer, sheet, onTransitionEnd: onEnd });

  if (sheet) {
    sheet.addEventListener("transitionend", onEnd);
  } else {
    window.clearTimeout(timer);
    done();
  }
}

/** Чи варто анімувати дропдауни (fake-select) — на тачі вимкнено. */
export function shouldAnimateSheetControls() {
  return shouldAnimateModal() && !isCoarsePointer();
}

export function sheetControlDurationMs() {
  return shouldAnimateSheetControls() ? 160 : 0;
}
