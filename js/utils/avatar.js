import { initialFrom } from "./format.js";
import { t } from "../i18n/index.js";

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function avatarHtml(options) {
  var baseClass = options.baseClass || "lobby-card__initial";
  var name = options.displayName || t("profile.player");
  var photoUrl = options.photoUrl;
  var letter = initialFrom(name);

  if (photoUrl) {
    var url = String(photoUrl).replace(/"/g, "%22");
    var fallback = letter.replace(/'/g, "\\'");
    return (
      '<img class="' +
      baseClass +
      " " +
      baseClass +
      '--photo" src="' +
      url +
      '" alt="" loading="lazy" decoding="async" onerror="this.outerHTML=\'<span class=&quot;' +
      baseClass +
      "&quot; aria-hidden=&quot;true&quot;>" +
      fallback +
      "</span>'\" />"
    );
  }

  return '<span class="' + baseClass + '" aria-hidden="true">' + letter + "</span>";
}

export function applyAvatarElement(el, displayName, photoUrl) {
  if (!el) return;

  if (photoUrl) {
    el.classList.add("profile-hero__avatar--photo");
    el.style.backgroundImage = "url('" + String(photoUrl).replace(/'/g, "%27") + "')";
    el.textContent = "";
    el.setAttribute("aria-label", displayName || t("profile.avatarAria"));
    el.removeAttribute("aria-hidden");
  } else {
    el.classList.remove("profile-hero__avatar--photo");
    el.style.backgroundImage = "";
    el.textContent = initialFrom(displayName);
    el.setAttribute("aria-label", t("profile.avatarAria"));
  }
}
