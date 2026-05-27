import { prepareLobbyShare } from "../api/client.js";
import { getActiveLobby, getShareUrl } from "../game/lobby-session.js";
import { shareLobbyInvite, sharePreparedMessage } from "../app/telegram.js";
import { gameLabelKey } from "../games/index.js";
import { t } from "../i18n/index.js";

export function bindShareButtons() {
  var shareBtn = document.getElementById("btnShareLobby");
  if (!shareBtn) return;

  shareBtn.addEventListener("click", async function () {
    var lobby = getActiveLobby();
    var url = getShareUrl();
    if (!lobby || !lobby.inviteCode) return;

    shareBtn.blur();

    try {
      var messageId = await prepareLobbyShare(lobby.id);
      if (messageId && sharePreparedMessage(messageId)) {
        return;
      }
    } catch (_err) {
      /* fallback нижче */
    }

    shareLobbyInvite(url, t("share.inviteText", { game: t(gameLabelKey(lobby.gameType)) }));
  });
}
