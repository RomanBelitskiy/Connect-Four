import { switchTab } from "./nav.js";
import { primeGamePresentation } from "../game/match-board.js";
import { bindCreateLobbyModal } from "../ui/create-lobby-modal.js";
import { bindLeaveGameConfirmModal, requestSwitchToLobby } from "../ui/leave-game-modal.js";

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

  var btnGameBack = document.getElementById("btnGameBack");
  if (btnGameBack) {
    btnGameBack.addEventListener("click", function () {
      requestSwitchToLobby(btnGameBack);
    });
  }

  var btnReturnLobby = document.getElementById("btnGameReturnLobby");
  if (btnReturnLobby) {
    btnReturnLobby.addEventListener("click", function () {
      switchTab("lobby");
    });
  }

  primeGamePresentation();
}
