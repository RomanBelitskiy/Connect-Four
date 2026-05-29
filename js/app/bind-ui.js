import { switchTab, getActiveTab } from "./nav.js";
import { refreshLobbies, refreshLobbiesIfVisible, startLobbyListPolling } from "./shell.js";
import { setLobbyFeedHandler, setLobbyFeedPayloadHandler } from "../api/lobby-feed.js";
import { setLobbyRooms } from "./lobby-list.js";
import { primeGamePresentation } from "../game/match-board.js";
import { bindCreateLobbyModal } from "../ui/create-lobby-modal.js";
import { bindPickGameModal } from "../ui/pick-game-modal.js";
import { bindLeaveGameConfirmModal, requestSwitchToLobby } from "../ui/leave-game-modal.js";
import { bindReplaceLobbyModal } from "../ui/replace-lobby-modal.js";
import { bindShareButtons } from "../ui/share.js";
import { bindTelegramBackButton, setTelegramBackVisible } from "./telegram.js";
import { bindSettingsModal } from "../ui/settings-modal.js";
import { bindProfileRefresh } from "../ui/profile-refresh.js";
import { openLobbyFromList, reopenOwnLobby } from "../game/lobby-session.js";
import {
  clearLobbyJoinHoverSuppress,
  scheduleLobbyJoinHoverSuppressFallback,
  suppressLobbyJoinHover,
} from "./join-hover-suppress.js";
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
  bindProfileRefresh();
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
      var joinBtn = ev.target.closest(".lobby-card__join-btn--join");

      (async function () {
        try {
          if (joinBtn && !isMine) {
            ev.stopPropagation();
            suppressLobbyJoinHover(joinBtn);
            try {
              var joined = await openLobbyFromList(id, true);
              if (joined == null || getActiveTab() === "lobby") {
                scheduleLobbyJoinHoverSuppressFallback(1000);
              }
            } catch (joinErr) {
              clearLobbyJoinHoverSuppress();
              throw joinErr;
            }
            return;
          }

          if (isMine) {
            await reopenOwnLobby(id);
            return;
          }

          await openLobbyFromList(id, false);
        } catch (err) {
          window.alert(userErrorMessage(err) || t("error.openRoom"));
          refreshLobbies({ force: true });
        }
      })();
    });
  }

  var btnReturnLobby = document.getElementById("btnGameReturnLobby");
  if (btnReturnLobby) {
    btnReturnLobby.addEventListener("click", function () {
      switchTab("lobby");
    });
  }

  setLobbyFeedPayloadHandler(setLobbyRooms);
  setLobbyFeedHandler(refreshLobbiesIfVisible);
  startLobbyListPolling();
  primeGamePresentation();
}
