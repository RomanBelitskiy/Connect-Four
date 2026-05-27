import { game } from "./state.js";
import { t } from "../i18n/index.js";

export function setTurnLabelKey(key) {
  game.lastTurnLabelKey = key;
  var label = document.getElementById("gameTurnLabel");
  if (label) label.textContent = t(key);
}
