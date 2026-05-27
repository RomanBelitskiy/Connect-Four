/** Shared modal open/close helpers. */

export function lockPageScroll() {
  document.documentElement.style.overflow = "hidden";
}

export function unlockPageScroll() {
  document.documentElement.style.overflow = "";
}

/**
 * @param {HTMLElement|null} modal
 * @param {{ focusSelector?: string }} [opts]
 */
export function openModal(modal, opts) {
  if (!modal) return;
  modal.removeAttribute("hidden");
  lockPageScroll();
  var sel = opts && opts.focusSelector;
  var focusEl = sel ? modal.querySelector(sel) : modal.querySelector(".modal__close-btn");
  if (focusEl) focusEl.focus();
}

/**
 * @param {HTMLElement|null} modal
 * @param {HTMLElement|null} [returnFocus]
 */
export function closeModal(modal, returnFocus) {
  if (!modal) return;
  modal.setAttribute("hidden", "");
  unlockPageScroll();
  if (returnFocus) returnFocus.focus();
}
