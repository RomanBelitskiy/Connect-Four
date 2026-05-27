import { switchTab } from "./nav.js";
import { refreshLobbies, refreshLobbiesIfVisible, startLobbyListPolling } from "./shell.js";
import { setLobbyFeedHandler } from "../api/lobby-feed.js";
import { primeGamePresentation } from "../game/match-board.js";
import { bindCreateLobbyModal } from "../ui/create-lobby-modal.js";
import { bindPickGameModal } from "../ui/pick-game-modal.js";
import { bindLeaveGameConfirmModal, requestSwitchToLobby } from "../ui/leave-game-modal.js";
import { bindReplaceLobbyModal, confirmReplaceLobby } from "../ui/replace-lobby-modal.js";
import { bindShareButtons } from "../ui/share.js";
import { bindTelegramBackButton, setTelegramBackVisible } from "./telegram.js";
import { bindSettingsModal } from "../ui/settings-modal.js";
import { fetchActiveLobby } from "../api/client.js";
import { joinLobbyById, reopenOwnLobby, spectateLobbyById } from "../game/lobby-session.js";
import { userErrorMessage } from "../utils/errors.js";
import { t } from "../i18n/index.js";

/** Під'єднує обробники табів, модалки лобі, гру на старті. */
export function bindUi() {
  document.querySelectorAll(".tab-bar__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-tab");
      if (tab === "lobby") {
        requestSwitchToLobby(btn);
        return;
      }
      switchTab(tab);
    });
  });

  bindPickGameModal();
  bindCreateLobbyModal();
  bindLeaveGameConfirmModal();
  bindReplaceLobbyModal();
  bindShareButtons();
  bindSettingsModal();
  bindTelegramBackButton(function () {
    requestSwitchToLobby(null);
  });
  setTelegramBackVisible(false);

  var lobbyList = document.getElementById("lobbyList");
  if (lobbyList) {
    lobbyList.addEventListener("click", function (ev) {
      var card = ev.target.closest(".lobby-card");
      if (!card || card.classList.contains("empty-state")) return;
      var id = card.getAttribute("data-id");
      if (!id) return;

      var isMine = card.getAttribute("data-mine") === "1";

      (async function () {
        try {
          if (isMine) {
            await reopenOwnLobby(id);
            return;
          }

          var existing = await fetchActiveLobby();
          if (existing && String(existing.id) !== String(id)) {
            var ok = await confirmReplaceLobby({ mode: "join" });
            if (!ok) return;
            await spectateLobbyById(id, { skipActiveCheck: true, replaceExisting: true });
            return;
          }

          await spectateLobbyById(id);
        } catch (err) {
          window.alert(userErrorMessage(err) || t("error.openRoom"));
          refreshLobbies();
        }
      })();
    });
  }

  var btnReturnLobby = document.getElementById("btnGameReturnLobby");
  if (btnReturnLobby) {
    btnReturnLobby.addEventListener("click", function () {
      switchTab("lobby");
      refreshLobbies();
    });
  }

  setLobbyFeedHandler(refreshLobbiesIfVisible);
  startLobbyListPolling();
  primeGamePresentation();
}
