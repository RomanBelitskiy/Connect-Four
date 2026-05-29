/** Блокує hover на Join після кліку, поки не повернемось у список лобі. */

var suppressTimer = null;

export function suppressLobbyJoinHover(btn) {
  clearLobbyJoinHoverSuppress();
  if (!btn) return;
  btn.classList.add("lobby-card__join-btn--suppress-hover");
}

export function clearLobbyJoinHoverSuppress() {
  if (suppressTimer != null) {
    clearTimeout(suppressTimer);
    suppressTimer = null;
  }
  document.querySelectorAll(".lobby-card__join-btn--suppress-hover").forEach(function (el) {
    el.classList.remove("lobby-card__join-btn--suppress-hover");
  });
}

/** Fallback, якщо залишились на списку лобі (скасували діалог тощо). */
export function scheduleLobbyJoinHoverSuppressFallback(ms) {
  if (suppressTimer != null) clearTimeout(suppressTimer);
  suppressTimer = window.setTimeout(clearLobbyJoinHoverSuppress, ms || 1000);
}
