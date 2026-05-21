export function initialFrom(text) {
  var s = (text || "").trim();
  if (!s) return "?";
  return s.charAt(0).toUpperCase();
}
export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export function formatClock(seconds) {
  var s = Math.max(0, Math.floor(seconds));
  var m = Math.floor(s / 60);
  var r = s % 60;
  return m + ":" + (r < 10 ? "0" : "") + r;
}
export function formatLobbyMeta(settings) {
  if (!settings || settings.secondsPerPlayer == null) return "—";
  var sec = parseInt(String(settings.secondsPerPlayer), 10);
  if (Number.isNaN(sec)) return "—";
  var allowedBase = [15, 30, 60, 120, 180];
  if (allowedBase.indexOf(sec) === -1) return "—";
  var inc = settings.incrementSeconds != null ? settings.incrementSeconds : "0";
  var ctl =
    sec < 60
      ? sec + " сек"
      : Math.floor(sec / 60) + " хв";
  return ctl + " · +" + inc + " с";
}
