import { t } from "../../i18n/index.js";
import {
  hasLobbyGuest,
  isPregameHost,
  isPregameGuest,
  isPregameSpectator,
} from "./roles.js";
import { isReadyToggleCoolingDown } from "./ready-pending.js";

export function setReadyBadgeActive(el, active) {
  if (!el) return;
  el.classList.toggle("pregame-ready-badge--active", !!active);
}

export function setPlayerCardReadyHighlight(slotEl, ready) {
  if (slotEl) slotEl.classList.toggle("pregame-player--is-ready", !!ready);
}

export function setReadyButtonState(btn, checked, locked) {
  if (!btn) return;
  btn.classList.toggle("pregame-ready__btn--checked", !!checked);
  btn.setAttribute("aria-pressed", checked ? "true" : "false");
  btn.disabled = !!locked;
}

function setReadyBadgeUi(badge, slot, hasGuest, ready, locked) {
  if (!badge) return;
  if (!hasGuest) {
    badge.setAttribute("hidden", "");
    badge.setAttribute("aria-hidden", "true");
    if (slot) setPlayerCardReadyHighlight(slot, false);
    return;
  }
  badge.removeAttribute("hidden");
  badge.setAttribute("aria-hidden", "false");
  badge.classList.add("pregame-ready-badge--muted");
  setReadyBadgeActive(badge, !!ready);
  if (locked) badge.classList.add("pregame-ready-badge--locked");
  else badge.classList.remove("pregame-ready-badge--locked");
  if (slot) setPlayerCardReadyHighlight(slot, !!ready);
}

function setInteractiveReadyUi(btn, slot, ready, locked, hasGuest) {
  if (!btn) return;
  btn.removeAttribute("hidden");
  setReadyButtonState(btn, !!ready && !!hasGuest, locked || isReadyToggleCoolingDown());
  if (slot) setPlayerCardReadyHighlight(slot, !!ready && !!hasGuest);
}

function hideReadyControls(btn, badge) {
  if (btn) btn.setAttribute("hidden", "");
  if (badge) {
    badge.setAttribute("hidden", "");
    badge.setAttribute("aria-hidden", "true");
  }
}

export function setPregamePlayerSideClasses(lobby) {
  var slotLeft = document.getElementById("pregameSlotMe");
  var slotRight = document.getElementById("pregameSlotOpp");
  if (!slotLeft || !slotRight) return;
  var iAmHost = isPregameHost(lobby);
  var iAmGuest = isPregameGuest(lobby);
  slotLeft.classList.toggle("pregame-player--me", iAmHost);
  slotLeft.classList.toggle("pregame-player--opp", !iAmHost);
  slotRight.classList.toggle("pregame-player--me", iAmGuest);
  slotRight.classList.toggle("pregame-player--opp", !iAmGuest);
}

export function setHostGuestSlotLabels(lobby) {
  var labelLeft = document.querySelector("#pregameSlotMe .pregame-player__label");
  var labelRight = document.querySelector("#pregameSlotOpp .pregame-player__label");
  var hasGuest = hasLobbyGuest(lobby);
  if (labelLeft) {
    labelLeft.textContent = isPregameHost(lobby) ? t("game.you") : t("pregame.hostPlayer");
  }
  if (labelRight) {
    if (isPregameGuest(lobby)) labelRight.textContent = t("game.you");
    else labelRight.textContent = t("game.opponent");
  }
  if (labelRight && isPregameHost(lobby) && !hasGuest) {
    labelRight.textContent = t("game.opponent");
  }
}

export function configureHostSlotReady(lobby, ready, hostReady) {
  var slot = document.getElementById("pregameSlotMe");
  var btn = document.getElementById("pregameHostReadyBtn");
  var badge = document.getElementById("pregameHostReadyBadge");
  var locked = ready.countdownLocked || !ready.hasGuest;

  if (isPregameHost(lobby)) {
    hideReadyControls(null, badge);
    setInteractiveReadyUi(btn, slot, ready.myReady, locked, ready.hasGuest);
    return;
  }

  hideReadyControls(btn, null);
  if (isPregameGuest(lobby)) {
    setReadyBadgeUi(badge, slot, ready.hasGuest, hostReady, locked);
    return;
  }

  if (isPregameSpectator(lobby)) {
    if (ready.hasGuest) {
      hideReadyControls(null, badge);
      setInteractiveReadyUi(btn, slot, hostReady, true, ready.hasGuest);
    } else {
      hideReadyControls(btn, badge);
      setPlayerCardReadyHighlight(slot, false);
    }
  }
}

export function configureGuestSlotReady(lobby, ready, guestReady) {
  var slot = document.getElementById("pregameSlotOpp");
  var btn = document.getElementById("pregameGuestReadyBtn");
  var badge = document.getElementById("pregameOppReadyBadge");
  var locked = ready.countdownLocked || !ready.hasGuest;

  if (!ready.hasGuest) {
    hideReadyControls(btn, badge);
    setPlayerCardReadyHighlight(slot, false);
    return;
  }

  if (isPregameGuest(lobby)) {
    hideReadyControls(null, badge);
    setInteractiveReadyUi(btn, slot, ready.myReady, locked, ready.hasGuest);
    return;
  }

  hideReadyControls(btn, null);
  setReadyBadgeUi(badge, slot, ready.hasGuest, guestReady, locked);
}

export function resetReadyButtonsDisabled() {
  var hostReadyBtn = document.getElementById("pregameHostReadyBtn");
  var guestReadyBtn = document.getElementById("pregameGuestReadyBtn");
  if (hostReadyBtn) setReadyButtonState(hostReadyBtn, false, true);
  if (guestReadyBtn) setReadyButtonState(guestReadyBtn, false, true);
}
