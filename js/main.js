import { bindUi } from "./app/bind-ui.js";
import { switchTab } from "./app/nav.js";
import {
  renderHistory,
  renderLeaderboard,
  renderLobbies,
  initTelegram,
  setProfileFromTg,
} from "./app/shell.js";
import { setNavigateToTab } from "./game/match-board.js";

setNavigateToTab(switchTab);

var tg = initTelegram();
setProfileFromTg(tg);
renderLobbies();
renderHistory();
renderLeaderboard();

bindUi();
