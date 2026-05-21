import { bindUi } from "./app/bind-ui.js";
import { switchTab } from "./app/nav.js";
import {
  refreshAllData,
  initTelegram,
  setProfileFromTg,
  setProfileFromUser,
  setProfileLoading,
} from "./app/shell.js";
import { authenticateWithTelegram } from "./api/client.js";
import {
  initLobbySession,
  joinLobbyByInviteCode,
  parseJoinCodeFromUrl,
  clearJoinParamFromUrl,
  resumeActiveLobbyIfAny,
} from "./game/lobby-session.js";
import { setNavigateToTab } from "./game/match-board.js";

setNavigateToTab(switchTab);

async function bootstrap() {
  var tg = initTelegram();
  initLobbySession();
  bindUi();

  if (tg && tg.initData) {
    setProfileLoading(true);
    try {
      var user = await authenticateWithTelegram(tg.initData);
      setProfileFromUser(user);
    } catch (err) {
      console.warn("[auth]", err.message);
      setProfileFromTg(tg);
    }
  } else {
    setProfileFromTg(tg);
  }

  await refreshAllData();

  var joinCode = parseJoinCodeFromUrl();
  if (joinCode && tg && tg.initData) {
    try {
      await joinLobbyByInviteCode(joinCode);
      clearJoinParamFromUrl();
    } catch (err) {
      console.warn("[join]", err.message);
    }
  } else if (tg && tg.initData) {
    try {
      await resumeActiveLobbyIfAny();
    } catch (err) {
      console.warn("[resume]", err.message);
    }
  }
}

bootstrap();
