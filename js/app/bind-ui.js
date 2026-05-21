import { switchTab } from "./nav.js";
import { refreshLobbies, startLobbyListPolling } from "./shell.js";
import { primeGamePresentation } from "../game/match-board.js";
import { bindCreateLobbyModal } from "../ui/create-lobby-modal.js";
import { bindLeaveGameConfirmModal, requestSwitchToLobby } from "../ui/leave-game-modal.js";
import { bindReplaceLobbyModal, confirmReplaceLobby } from "../ui/replace-lobby-modal.js";
import { bindShareButtons } from "../ui/share.js";
import { bindTelegramBackButton, setTelegramBackVisible } from "./telegram.js";
import { fetchActiveLobby } from "../api/client.js";
import { joinLobbyById, reopenOwnLobby } from "../game/lobby-session.js";
import { userErrorMessage } from "../utils/errors.js";

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

  document.querySelectorAll(".lb-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".lb-tab").forEach(function (t) {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
    });
  });

  bindCreateLobbyModal();
  bindLeaveGameConfirmModal();
  bindReplaceLobbyModal();
  bindShareButtons();
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
            await joinLobbyById(id, { skipActiveCheck: true, replaceExisting: true });
            return;
          }

          await joinLobbyById(id);
        } catch (err) {
          window.alert(userErrorMessage(err) || "Не вдалося відкрити кімнату");
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

  startLobbyListPolling();
  primeGamePresentation();
}
