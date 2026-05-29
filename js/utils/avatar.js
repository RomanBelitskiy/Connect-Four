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

  var name = displayName || t("profile.player");
  el.classList.toggle("profile-hero__avatar--photo", !!photoUrl);
  el.style.backgroundImage = "";
  el.innerHTML = avatarHtml({
    baseClass: "profile-hero__avatar-inner",
    displayName: name,
    photoUrl: photoUrl,
  });
  el.setAttribute("aria-label", name);
  el.removeAttribute("aria-hidden");
}
