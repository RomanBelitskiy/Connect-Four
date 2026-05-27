import { avatarHtml } from "../../utils/avatar.js";
import { t } from "../../i18n/index.js";
import { resolveGameType } from "../../games/index.js";
import pregameCrownUrl from "../../../assets/pregame-crown.png?url";
import { updatePregameChips } from "./chips.js";
import {
  chipForRole,
  getPregameReadyState,
  hasLobbyGuest,
  isLobbyHostPlayer,
  isPregameGuest,
  isPregameHost,
  isPregameSpectator,
  normalizeWaitingLobby,
  shouldShowHostInvite,
  shouldShowSpectatorJoin,
} from "./roles.js";
import {
  configureGuestSlotReady,
  configureHostSlotReady,
  setHostGuestSlotLabels,
  setPlayerCardReadyHighlight,
  setPregamePlayerSideClasses,
} from "./ready-ui.js";
import { startCountdownUi, stopCountdownTimers, hideCountdown, wrapCountdownHandler } from "./countdown.js";

function bindPregameCrownImages() {
  document.querySelectorAll(".pregame-player__crown-icon").forEach(function (img) {
    if (img.getAttribute("src") !== pregameCrownUrl) {
      img.setAttribute("src", pregameCrownUrl);
    }
  });
}

bindPregameCrownImages();

function setPlayerHostCrown(slotEl, show) {
  if (!slotEl) return;
  var crown = slotEl.querySelector(".pregame-player__crown");
  if (!crown) return;
  if (show) {
    crown.removeAttribute("hidden");
    crown.setAttribute("aria-hidden", "true");
  } else {
    crown.setAttribute("hidden", "");
    crown.setAttribute("aria-hidden", "true");
  }
}

export function updatePregameStatusText(lobby, hasGuest, countdownLocked, myReady, oppReady) {
  var statusEl = document.getElementById("pregameStatus");
  if (!statusEl) return;
  if (!hasGuest) {
    statusEl.textContent = t("pregame.waitingOpponent");
  } else if (countdownLocked) {
    statusEl.textContent = t("pregame.startingSoon");
  } else if (myReady && oppReady) {
    statusEl.textContent = t("pregame.bothReady");
  } else if (myReady) {
    statusEl.textContent = t("pregame.youReady");
  } else {
    statusEl.textContent = t("pregame.markReady");
  }
}

function renderPlayerCard(slotEl, player, ready, options) {
  if (!slotEl || !player) return;
  var opts = options || {};
  var playerId = String(player.telegramId || "");
  var avatarWrap = slotEl.querySelector(".pregame-player__avatar");
  var nameEl = slotEl.querySelector(".pregame-player__name");
  var kickBtn = slotEl.querySelector("#pregameHostKickBtn");

  slotEl.classList.remove("pregame-player--empty", "pregame-player--invite");
  setPlayerCardReadyHighlight(slotEl, !!ready);

  if (slotEl.dataset.playerId !== playerId) {
    slotEl.dataset.playerId = playerId;
    if (avatarWrap) {
      avatarWrap.innerHTML = avatarHtml({
        baseClass: "pregame-player__avatar-img",
        displayName: player.displayName,
        photoUrl: player.photoUrl,
      });
    }
  }

  if (nameEl) nameEl.textContent = player.displayName || t("profile.player");

  if (kickBtn) {
    if (opts.showKick) {
      kickBtn.removeAttribute("hidden");
      kickBtn.setAttribute("aria-label", t("pregame.kickAria"));
    } else {
      kickBtn.setAttribute("hidden", "");
    }
  }

  setPlayerHostCrown(slotEl, !!opts.isHost);
}

function hideReadyControls(btn, badge) {
  if (btn) btn.setAttribute("hidden", "");
  if (badge) {
    badge.setAttribute("hidden", "");
    badge.setAttribute("aria-hidden", "true");
  }
}

function renderOpponentSlot(lobby, hasGuest, opp, oppReady, countdownLocked) {
  var slot = document.getElementById("pregameSlotOpp");
  var main = document.getElementById("pregameOppMain");
  var invitePanel = document.getElementById("pregameOppInvitePanel");
  var invite = document.getElementById("pregameOppInvite");
  var spectatorJoin = document.getElementById("pregameSpectatorJoin");
  var readySlot = slot && slot.querySelector(".pregame-player__ready-slot");
  var showInvite = shouldShowHostInvite(lobby, hasGuest, countdownLocked);
  var showSpectatorJoin = shouldShowSpectatorJoin(lobby, hasGuest, countdownLocked);

  if (!slot) return;

  if (showInvite || showSpectatorJoin) {
    slot.classList.add("pregame-player--empty", "pregame-player--invite");
    slot.classList.remove("pregame-player--is-ready");
    hideReadyControls(
      document.getElementById("pregameGuestReadyBtn"),
      document.getElementById("pregameOppReadyBadge")
    );
    setPlayerHostCrown(slot, false);
    var kickBtnInvite = document.getElementById("pregameHostKickBtn");
    if (kickBtnInvite) kickBtnInvite.setAttribute("hidden", "");
    var leaveBtnInvite = document.getElementById("pregameGuestLeaveBtn");
    if (leaveBtnInvite) leaveBtnInvite.setAttribute("hidden", "");
    if (main) main.setAttribute("hidden", "");
    if (readySlot) readySlot.setAttribute("hidden", "");
    if (invitePanel) invitePanel.removeAttribute("hidden");
    if (invite) {
      if (showInvite) invite.removeAttribute("hidden");
      else invite.setAttribute("hidden", "");
    }
    if (spectatorJoin) {
      if (showSpectatorJoin) spectatorJoin.removeAttribute("hidden");
      else spectatorJoin.setAttribute("hidden", "");
    }
    delete slot.dataset.playerId;
    return;
  }

  slot.classList.remove("pregame-player--invite", "pregame-player--empty");
  if (invitePanel) invitePanel.setAttribute("hidden", "");
  if (invite) invite.setAttribute("hidden", "");
  if (spectatorJoin) spectatorJoin.setAttribute("hidden", "");
  if (readySlot) readySlot.removeAttribute("hidden");
  if (main) main.removeAttribute("hidden");

  if (!opp) {
    if (isPregameSpectator(lobby) && !hasGuest && !countdownLocked) {
      slot.classList.add("pregame-player--empty", "pregame-player--invite");
      if (main) main.setAttribute("hidden", "");
      if (readySlot) readySlot.setAttribute("hidden", "");
      if (invitePanel) invitePanel.removeAttribute("hidden");
      if (invite) invite.setAttribute("hidden", "");
      if (spectatorJoin) spectatorJoin.removeAttribute("hidden");
      return;
    }
    if (main) main.setAttribute("hidden", "");
    if (readySlot) readySlot.setAttribute("hidden", "");
    return;
  }

  renderPlayerCard(slot, opp, oppReady, {
    showKick: hasGuest && isPregameHost(lobby) && !countdownLocked,
    isHost: isLobbyHostPlayer(lobby, opp),
  });
}

export function renderHostGuestPregame(lobby, ready) {
  var hostChip = chipForRole(lobby, "host");
  var guestChip = chipForRole(lobby, "guest");
  var hostReady = ready.hasGuest && !!lobby.hostReady;
  var guestReady = ready.hasGuest && !!lobby.guestReady;

  updatePregameChips(hostChip, guestChip, ready.hasGuest, resolveGameType(lobby));
  setHostGuestSlotLabels(lobby);
  setPregamePlayerSideClasses(lobby);

  if (lobby.host) {
    renderPlayerCard(document.getElementById("pregameSlotMe"), lobby.host, hostReady, {
      isHost: true,
    });
  }
  configureHostSlotReady(lobby, ready, hostReady);

  renderOpponentSlot(lobby, ready.hasGuest, lobby.guest, guestReady, ready.countdownLocked);
  configureGuestSlotReady(lobby, ready, guestReady);

  var kickBtn = document.getElementById("pregameHostKickBtn");
  if (kickBtn) {
    if (isPregameHost(lobby) && ready.hasGuest && !ready.countdownLocked) {
      kickBtn.removeAttribute("hidden");
    } else {
      kickBtn.setAttribute("hidden", "");
    }
  }

  var leaveBtn = document.getElementById("pregameGuestLeaveBtn");
  if (leaveBtn) {
    if (isPregameGuest(lobby) && ready.hasGuest && !ready.countdownLocked) {
      leaveBtn.removeAttribute("hidden");
    } else {
      leaveBtn.setAttribute("hidden", "");
    }
  }
}

/** @param {object} lobby @param {{ onPlaying?: function }} [options] */
export function patchPregameFromLobby(lobby, options) {
  options = options || {};
  lobby = normalizeWaitingLobby(lobby);
  var ready = getPregameReadyState(lobby);

  renderHostGuestPregame(lobby, ready);
  updatePregameStatusText(lobby, ready.hasGuest, ready.countdownLocked, ready.myReady, ready.oppReady);

  if (ready.countdownLocked) {
    startCountdownUi(lobby, wrapCountdownHandler(options.onPlaying, lobby));
  } else {
    stopCountdownTimers();
    hideCountdown();
  }
}
