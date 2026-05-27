import { formatLobbyMetaLocal } from "../i18n/index.js";

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
  return formatLobbyMetaLocal(settings);
}
