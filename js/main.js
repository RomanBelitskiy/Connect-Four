import { bindUi } from "./app/bind-ui.js";
import { switchTab, ensureGameTab, ensureLobbyTab } from "./app/nav.js";
import {
  refreshAllData,
  initTelegram,
  setProfileFromTg,
  setProfileFromUser,
  setProfileLoading,
} from "./app/shell.js";
import { authenticateWithTelegram, setTelegramInitData } from "./api/client.js";
import { connectLobbyFeed } from "./api/lobby-feed.js";
import {
  initLobbySession,
  joinLobbyByInviteCode,
  parseJoinCodeFromUrl,
  clearJoinParamFromUrl,
  resumeActiveLobbyIfAny,
} from "./game/lobby-session.js";
import { setNavigateToTab } from "./game/match-board.js";
import { runBootJoinGate } from "./app/boot-join.js";
import { runBootResumeGate } from "./app/boot-resume.js";
import { showAppLoading, hideAppLoading, finishAppLoading } from "./app/boot-gate.js";
import { loadSettings } from "./app/settings.js";
import { initLanguage } from "./i18n/index.js";
import { initMusic } from "./app/music.js";

setNavigateToTab(switchTab);

async function bootstrap() {
  var stored = loadSettings();
  initLanguage(stored.language);
  initMusic();

  var tg = initTelegram();
  var joinCode = parseJoinCodeFromUrl();
  var appLoadingMode = document.documentElement.dataset.appLoading || "";
  var bootResume = !!appLoadingMode && appLoadingMode !== "join";
  var hadAppLoadingGate = !!appLoadingMode;
  initLobbySession();
  bindUi();

  if (joinCode) {
    ensureGameTab();
  } else if (bootResume) {
    ensureGameTab();
  }

  if (tg && tg.initData && !hadAppLoadingGate) {
    showAppLoading();
  }

  var hasInitData = !!(tg && tg.initData);
  if (hasInitData) {
    setTelegramInitData(tg.initData);
    setProfileLoading(true);
    try {
      var user = await authenticateWithTelegram(tg.initData);
      setProfileFromUser(user);
      connectLobbyFeed();
    } catch (err) {
      console.warn("[auth]", err.message);
      setProfileFromTg(tg);
    }
  } else {
    setProfileFromTg(tg);
  }

  if (joinCode && hasInitData) {
    var bootResult = await runBootJoinGate(function () {
      return joinLobbyByInviteCode(joinCode);
    });

    if (bootResult.lobby) {
      clearJoinParamFromUrl();
    } else if (bootResult.error) {
      console.warn("[join]", bootResult.error.message);
      ensureLobbyTab();
    }

    finishAppLoading();
    if (hasInitData) refreshAllData();
    return;
  }

  if (hasInitData) {
    if (bootResume) {
      var bootResumeResult = await runBootResumeGate(function () {
        return resumeActiveLobbyIfAny();
      });
      if (!bootResumeResult.lobby) {
        ensureLobbyTab();
      }
      if (bootResumeResult.error) {
        console.warn("[resume]", bootResumeResult.error.message);
      }
      finishAppLoading();
    } else {
      try {
        await resumeActiveLobbyIfAny();
      } catch (err) {
        console.warn("[resume]", err.message);
      }
    }
  } else if (bootResume) {
    finishAppLoading();
  }

  if (hasInitData) {
    await refreshAllData();
  }
  hideAppLoading();
}

bootstrap();
